const UPSTREAM = 'https://api.mymemory.translated.net/get';
const ALLOW_ORIGIN = process.env.CORS_ORIGIN || '*';
const RATE_MS = Number(process.env.RATE_MS || 600);
const lastHit: Record<string, number> = {};

function cors(h: Headers) {
  h.set('access-control-allow-origin', ALLOW_ORIGIN);
  h.set('access-control-allow-methods', 'POST,OPTIONS');
  h.set('access-control-allow-headers', 'content-type,authorization');
}
const clean = (s: string) => (s || '').replace(/\s*([.,;:·—\-]+)\s*$/u, '').trim();
function guessLang2(s: string) {
  if (/[ぁ-ゟ゠-ヿ一-龯]/u.test(s)) return 'ja';
  if (/[가-힣]/u.test(s)) return 'ko';
  if (/[А-яЁё]/u.test(s)) return 'ru';
  if (/[α-ωΑ-Ω]/u.test(s)) return 'el';
  if (/[א-ת]/u.test(s)) return 'he';
  if (/[ء-ي]/u.test(s)) return 'ar';
  if (/[ऀ-ॿ]/u.test(s)) return 'hi';
  if (/[ñ¡¿]/i.test(s)) return 'es';
  if (/[çéèàùâêîôûëïüœ]/i.test(s)) return 'fr';
  if (/[äöüß]/i.test(s)) return 'de';
  if (/[ãõ]/i.test(s)) return 'pt';
  if (/[òàèìù]/i.test(s)) return 'it';
  return 'en';
}

export default {
  async fetch(request: Request): Promise<Response> {
    const headers = new Headers(); cors(headers);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST')
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });

    try {
      const ip = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for') || 'anon';
      const now = Date.now(), last = (lastHit as any)[ip] || 0;
      const wait = Math.max(0, RATE_MS - (now - last));
      if (wait) await new Promise(r => setTimeout(r, wait));
      (lastHit as any)[ip] = Date.now();

      const { q, source, target } = await request.json().catch(() => ({} as any));
      if (!q || !Array.isArray(q) || !target)
        return new Response(JSON.stringify({ error: 'Missing q[] or target' }), { status: 400, headers });

      const src = (source && source !== 'auto') ? source : guessLang2(q[0] || '');
      const results: string[] = [];
      for (const s of q) {
        const url = `${UPSTREAM}?q=${encodeURIComponent(s)}&langpair=${encodeURIComponent(src)}|${encodeURIComponent(target)}`;
        const r = await fetch(url);
        const d = await r.json();
        const primary = d?.responseData?.translatedText || '';
        const better = Array.isArray(d?.matches) ? d.matches.find((m: any) => m?.id === 0)?.translation : '';
        results.push(clean((better || primary || s).trim()));
      }
      return new Response(JSON.stringify({ translatedText: results }), { status: 200, headers });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: 'Upstream error', detail: String(e?.message || e) }), { status: 502, headers });
    }
  }
};
