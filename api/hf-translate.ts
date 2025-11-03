import type { VercelRequest, VercelResponse } from '@vercel/node';

const HF_TOKEN = process.env.HF_TOKEN || '';
const MODEL = 'facebook/nllb-200-distilled-600M';
const ORIGIN = process.env.CORS_ORIGIN || '*';

const MAP: Record<string,string> = {
  en:'eng_Latn', es:'spa_Latn', fr:'fra_Latn', pt:'por_Latn', it:'ita_Latn',
  de:'deu_Latn', ru:'rus_Cyrl', ja:'jpn_Jpan', ko:'kor_Hang',
  'zh':'zho_Hans', 'zh-cn':'zho_Hans', 'zh-tw':'zho_Hant'
};

function cors(res: VercelResponse){
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse){
  cors(res);
  if (req.method==='OPTIONS') return res.status(204).end();
  if (req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  if (!HF_TOKEN) return res.status(500).json({error:'Missing HF_TOKEN'});

  try{
    const body = typeof req.body==='object' ? req.body : JSON.parse(req.body||'{}');
    const q = Array.isArray(body?.q) ? body.q : [];
    const srcIso = String(body?.source || 'auto').toLowerCase();
    const dstIso = String(body?.target || 'es').toLowerCase();
    if (!q.length) return res.status(400).json({error:'Missing q[]'});

    const src = MAP[srcIso==='auto' ? 'en' : srcIso] || 'eng_Latn';
    const dst = MAP[dstIso] || 'spa_Latn';

    const url = `https://api-inference.huggingface.co/models/${MODEL}`;
    const outs: string[] = [];
    // Batching simple (trozos de 20); el Inference API es por texto, iteramos manteniendo orden
    const CHUNK = 20;
    for (let i=0; i<q.length; i+=CHUNK){
      const slice = q.slice(i, i+CHUNK);
      for (const s of slice){
        const r = await fetch(url, {
          method:'POST',
          headers:{
            'Authorization': `Bearer ${HF_TOKEN}`,
            'Content-Type':'application/json'
          },
          body: JSON.stringify({ inputs: s, parameters: { src_lang: src, tgt_lang: dst } })
        });
        if (!r.ok) throw new Error('HF '+r.status);
        const data = await r.json();
        const text = Array.isArray(data) ? (data[0]?.translation_text || '') : (data?.translation_text || '');
        outs.push((text||'').trim());
      }
    }
    return res.status(200).json({ translatedText: outs });
  }catch(e:any){
    return res.status(502).json({ error:'Upstream error', detail:String(e?.message||e) });
  }
}
