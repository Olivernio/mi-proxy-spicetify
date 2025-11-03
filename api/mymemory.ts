import { NextRequest } from 'next/server';
import { fetch } from 'undici';

const UPSTREAM = 'https://api.mymemory.translated.net/get';
const ALLOW_ORIGIN = process.env.CORS_ORIGIN || '*';
const RATE_MS = Number(process.env.RATE_MS || 600);
const lastHit: Record<string, number> = {};

export default async function handler(req: NextRequest) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || 'anon';
    const now = Date.now(); const last = lastHit[ip] || 0; const wait = Math.max(0, RATE_MS - (now - last));
    if (wait) await new Promise(r => setTimeout(r, wait)); lastHit[ip] = Date.now();

    const { q, source, target } = await req.json();
    if (!q || !Array.isArray(q) || !target) return json({ error: 'Missing q[] or target' }, 400);

    const src = (source && source !== 'auto') ? source : guessLang2(q[0] || '');
    const results: string[] = [];
    for (const s of q) {
      const url = `${UPSTREAM}?q=${encodeURIComponent(s)}&langpair=${encodeURIComponent(src)}|${encodeURIComponent(target)}`;
      const r = await fetch(url);
      const d = await r.json();
      const primary = d?.responseData?.translatedText || '';
      const better = Array.isArray(d?.matches) ? d.matches.find((m:any)=>m?.id===0)?.translation : '';
      results.push(clean((better || primary || s).trim()));
    }
    return json({ translatedText: results });
  } catch (e:any) {
    return json({ error: 'Upstream error', detail: String(e?.message||e) }, 502);
  }
}

function clean(s:string){ return s.replace(/\s*([.,;:·—\-]+)\s*$/u,'').trim(); }
function corsHeaders(){ return { 'access-control-allow-origin': ALLOW_ORIGIN, 'access-control-allow-methods':'POST,OPTIONS', 'access-control-allow-headers':'content-type,authorization' }; }
function json(obj:any,status=200){ return new Response(JSON.stringify(obj),{status,headers:{...corsHeaders(),'content-type':'application/json'}}); }

function guessLang2(s:string){
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
