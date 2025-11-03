// /api/hf-translate.ts — Vercel Function (Node.js runtime, handler web fetch)

const HF_TOKEN = process.env.HF_TOKEN || "";
const MODEL = "facebook/nllb-200-distilled-600M";
const ORIGIN = process.env.CORS_ORIGIN || "*";

const MAP: Record<string, string> = {
  en: "eng_Latn",
  es: "spa_Latn",
  fr: "fra_Latn",
  pt: "por_Latn",
  it: "ita_Latn",
  de: "deu_Latn",
  ru: "rus_Cyrl",
  ja: "jpn_Jpan",
  ko: "kor_Hang",
  zh: "zho_Hans",
  "zh-cn": "zho_Hans",
  "zh-tw": "zho_Hant",
};

function cors(h: Headers) {
  h.set("access-control-allow-origin", ORIGIN);
  h.set("access-control-allow-methods", "POST,OPTIONS");
  h.set("access-control-allow-headers", "content-type,authorization");
}

const shouldRetry = (s: number) =>
  s === 410 || s === 429 || s === 503 || s >= 500;

async function callHF(text: string, src: string, dst: string) {
  const url = `https://api-inference.huggingface.co/models/${MODEL}`;
  let attempt = 0;
  while (true) {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: text,
        parameters: { src_lang: src, tgt_lang: dst },
        options: { wait_for_model: true },
      }),
    });
    if (r.ok) {
      const data = await r.json();
      const out = Array.isArray(data)
        ? data[0]?.translation_text || ""
        : data?.translation_text || "";
      return out.trim();
    }
    if (!shouldRetry(r.status) || ++attempt >= 3)
      throw new Error("HF " + r.status);
    await new Promise((rz) => setTimeout(rz, 400 * attempt));
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const headers = new Headers();
    cors(headers);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers,
      });
    }
    if (!HF_TOKEN) {
      return new Response(JSON.stringify({ error: "Missing HF_TOKEN" }), {
        status: 500,
        headers,
      });
    }

    try {
      const body = await request.json().catch(() => ({}));
      const q: string[] = Array.isArray(body?.q) ? body.q : [];
      const srcIso = String(body?.source || "auto").toLowerCase();
      const dstIso = String(body?.target || "es").toLowerCase();
      if (!q.length) {
        return new Response(JSON.stringify({ error: "Missing q[]" }), {
          status: 400,
          headers,
        });
      }

      // Construye URL absoluta a tu propio respaldo /api/mymemory
      const base = new URL(request.url).origin;
      const mmUrl = `${base}/api/mymemory`;

      async function callMM(line: string, src2: string, dst2: string) {
        const r = await fetch(mmUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ q: [line], source: src2, target: dst2 }),
        });
        const j = await r.json().catch(() => ({ translatedText: [line] }));
        return j?.translatedText?.[0] ?? line;
      }

      const src = MAP[srcIso === "auto" ? "en" : srcIso] || "eng_Latn";
      const dst = MAP[dstIso] || "spa_Latn";

      const out: string[] = [];
      // Opcional: rastrea proveedor por línea
      // const providers: string[] = [];

      for (const line of q) {
        try {
          out.push(await callHF(line, src, dst));
          // providers.push('hf');
        } catch {
          out.push(
            await callMM(line, srcIso === "auto" ? "en" : srcIso, dstIso)
          );
          // providers.push('mm');
        }
      }

      // Si quieres exponer proveedores, añade { providers } en la respuesta
      return new Response(JSON.stringify({ translatedText: out }), {
        status: 200,
        headers,
      });
    } catch (e: any) {
      return new Response(
        JSON.stringify({
          error: "Upstream error",
          detail: String(e?.message || e),
        }),
        { status: 502, headers }
      );
    }
  },
};
