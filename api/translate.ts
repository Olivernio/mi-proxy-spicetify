import { NextRequest } from 'next/server';
import { fetch } from 'undici';

const UPSTREAM = process.env.LT_URL || 'https://libretranslate.com/translate';
const ALLOW_ORIGIN = process.env.CORS_ORIGIN || '*';
const RATE_MS = Number(process.env.RATE_MS || 600); // separa requests por IP

// Memoria simple por IP (Vercel edge/func: best-effort)
const lastHit: Record<string, number> = {};

export default async function handler(req: NextRequest) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || 'anon';
    const now = Date.now();
    const last = lastHit[ip] || 0;
    const wait = Math.max(0, RATE_MS - (now - last));
    if (wait) await new Promise(r => setTimeout(r, wait));
    lastHit[ip] = Date.now();

    const body = await req.json().catch(() => ({}));
    // Validación mínima
    if (!body || !body.q) return json({ error: 'Missing q' }, 400);

    const upstreamRes = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        q: body.q,                    // array o string
        source: body.source ?? 'auto',
        target: body.target ?? 'es',
        format: body.format ?? 'text'
      })
    });

    const text = await upstreamRes.text();
    // Pasa-through del código al cliente para que haga fallback si no es 200
    return new Response(text, {
      status: upstreamRes.status,
      headers: { ...corsHeaders(), 'content-type': upstreamRes.headers.get('content-type') || 'application/json' }
    });
  } catch (e: any) {
    return json({ error: 'Upstream error', detail: String(e?.message || e) }, 502);
  }
}

function corsHeaders() {
  return {
    'access-control-allow-origin': ALLOW_ORIGIN,
    'access-control-allow-methods': 'POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization'
  };
}
function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders(), 'content-type': 'application/json' } });
}
