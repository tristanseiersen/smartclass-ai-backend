import LRU from "lru-cache";

const cache = new LRU({ max: 500, ttl: 1000 * 60 * 60 * 24 * 30 });
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_KEY = process.env.OPENAI_API_KEY;

export default async function handler(req, res) {
    try {
        if (req.method !== "POST")
            return res.status(405).json({ error: "Method not allowed" });

        const body = req.body || {};
        const event = body.event || "generic";
        const transcriptChunk =
            body.payload?.transcriptChunk || body.transcript || body.prompt || "";
        const cacheKey = `${event}::${transcriptChunk.slice(0, 200)}`;

        if (cache.has(cacheKey)) {
            return res.status(200).json({ cached: true, ...cache.get(cacheKey) });
        }

        const model = body.model || "gpt-4o-mini";
        const messages =
            body.messages ||
            [
                {
                    role: "system",
                    content:
                        "You are a helpful AI assistant for classroom support. Answer concisely.",
                },
                { role: "user", content: transcriptChunk || "Please provide a short answer." },
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

        const data = await response.json();

        const result = {
            choices: [
                { message: { content: data?.choices?.[0]?.message?.content || "" } },
            ],
        };

        cache.set(cacheKey, result);
        return res.status(200).json(result);
    } catch (err) {
        console.error("AI handler error", err);
        return res.status(500).json({ error: "Internal error", details: String(err) });
    }
}
