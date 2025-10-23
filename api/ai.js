import { LRUCache } from "lru-cache";

const cache = new LRUCache({
    max: 500,
    ttl: 1000 * 60 * 60 * 24 * 30,
});

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_KEY = process.env.OPENAI_API_KEY;

export default async function handler(req, res) {
    try {
        // Accept both GET (for ping/tests) and POST for real calls
        if (req.method === "GET") {
            // Hvis test bruger GET, tillad et ?prompt=... så Base44 kan teste
            const prompt = req.query?.prompt || "ping";
            return res.status(200).json({
                ok: true,
                haskey: !!OPENAI_KEY,
                note: "hasKey = true betyder Vercel har variablen til denne deployment.",
                receivedPrompt: prompt,
            });
        }

        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        // POST-handler
        const body = req.body || {};
        const prompt = body.prompt || (Array.isArray(body.messages) ? body.messages : null);
        const event = body.event || "generic";
        const transcriptChunk =
            body.payload?.transcriptChunk || body.transcript || body.prompt || "";
        const cacheKey = `${event}::${transcriptChunk.slice(0, 200)}`;

        if (cache.has(cacheKey)) {
            return res.status(200).json({ cached: true, ...cache.get(cacheKey) });
        }

        if (!OPENAI_KEY) {
            return res.status(500).json({
                error: "API key not configured",
                details: "OPENAI_API_KEY must be set in Vercel Environment Variables",
            });
        }

        const model = body.model || "gpt-4o-mini";
        const messages =
            body.messages ||
            [
                { role: "system", content: "You are a helpful AI assistant for classroom support. Answer briefly." },
                { role: "user", content: transcriptChunk || "Please provide a short answer." }
            ];

        const response = await fetch(OPENAI_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${OPENAI_KEY}`,
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: 0.6,
                max_tokens: 400,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("OpenAI error:", response.status, errText);
            return res.status(502).json({ error: "OpenAI API failed", status: response.status, body: errText });
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content || "";
        const result = { choices: [{ message: { content } }] };

        cache.set(cacheKey, result);
        return res.status(200).json(result);
    } catch (err) {
        console.error("AI handler error:", err);
        return res.status(500).json({ error: "Internal error", details: String(err) });
    }
}
