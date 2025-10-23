import { LRUCache } from "lru-cache";

const cache = new LRUCache({ max: 500, ttl: 1000 * 60 * 60 * 24 * 30 });
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_KEY = process.env.OPENAI_API_KEY;

export default async function handler(req, res) {
    try {
        // Debug GET: https://.../api/ai?debug=1
        if (req.method === "GET") {
            if (req.query && req.query.debug === "1") {
                return res.status(200).json({
                    ok: true,
                    hasKey: !!OPENAI_KEY,
                    note: "hasKey = true betyder Vercel har variablen til denne deployment. Nøglen vises aldrig her."
                });
            }
            return res.status(405).json({ error: "Method not allowed" });
        }

        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        const body = req.body || {};
        const event = body.event || "generic";
        const transcriptChunk = body.payload?.transcriptChunk || body.transcript || body.prompt || "";
        const cacheKey = `${event}::${transcriptChunk.slice(0, 200)}`;

        if (cache.has(cacheKey)) {
            return res.status(200).json({ cached: true, ...cache.get(cacheKey) });
        }

        if (!OPENAI_KEY) {
            console.error("OPENAI_API_KEY missing in runtime env");
            return res.status(500).json({ error: "API key not configured", details: "OPENAI_API_KEY missing in runtime" });
        }

        const model = body.model || "gpt-4o-mini";
        const messages = body.messages || [
            { role: "system", content: "You are a helpful AI assistant for classroom support. Answer clearly and briefly." },
            { role: "user", content: transcriptChunk || "Please provide a short answer." }
        ];

        const openaiResp = await fetch(OPENAI_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_KEY}`
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: body.temperature ?? 0.6,
                max_tokens: Math.min(body.max_tokens || 400, 1500)
            })
        });

        if (!openaiResp.ok) {
            const txt = await openaiResp.text();
            console.error("OpenAI error", openaiResp.status, txt);
            return res.status(502).json({ error: "OpenAI error", status: openaiResp.status, body: txt });
        }

        const openaiData = await openaiResp.json();
        const content = openaiData.choices?.[0]?.message?.content || "";
        const result = { choices: [{ message: { content } }], raw: openaiData };

        cache.set(cacheKey, result);
        return res.status(200).json(result);

    } catch (err) {
        console.error('AI handler error', err);
        return res.status(500).json({ error: 'Internal error', details: String(err) });
    }
}
