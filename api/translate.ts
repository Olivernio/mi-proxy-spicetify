const UPSTREAM = process.env.LT_URL || 'https://libretranslate.com/translate';
const ALLOW_ORIGIN = process.env.CORS_ORIGIN || '*';
const RATE_MS = Number(process.env.RATE_MS || 600);
const lastHit: Record<string, number> = {};

function cors(h: Headers) {
  h.set('access-control-allow-origin', ALLOW_ORIGIN);
  h.set('access-control-allow-methods', 'POST,OPTIONS');
  h.set('access-control-allow-headers', 'content-type,authorization');
}

export default {
  async fetch(request: Request): Promise<Response> {
    const headers = new Headers();
    cors(headers);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    if (request.method !== 'POST')
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });

    try {
      const ip = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for') || 'anon';
      const now = Date.now(), last = (lastHit as any)[ip] || 0;
      const wait = Math.max(0, RATE_MS - (now - last));
      if (wait) await new Promise(r => setTimeout(r, wait));
      (lastHit as any)[ip] = Date.now();

      const body = await request.json().catch(() => ({} as any));
      if (!body || !body.q)
        return new Response(JSON.stringify({ error: 'Missing q' }), { status: 400, headers });

      const upstream = await fetch(UPSTREAM, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          q: body.q,
          source: body.source ?? 'auto',
          target: body.target ?? 'es',
          format: body.format ?? 'text'
        })
      });

      const text = await upstream.text();
      headers.set('content-type', upstream.headers.get('content-type') || 'application/json');
      return new Response(text, { status: upstream.status, headers });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: 'Upstream error', detail: String(e?.message || e) }), { status: 502, headers });
    }
  }
};
