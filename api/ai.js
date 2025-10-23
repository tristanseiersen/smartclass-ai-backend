import { LRUCache } from "lru-cache";

const cache = new LRUCache({
    max: 500,
    ttl: 1000 * 60 * 60 * 24 * 30, // 30 dage
});

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_KEY = process.env.OPENAI_API_KEY;

export default async function handler(req, res) {
    try {
        // Tillad kun POST-requests
        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        const body = req.body || {};
        const event = body.event || "generic";
        const transcriptChunk =
            body.payload?.transcriptChunk || body.transcript || body.prompt || "";
        const cacheKey = `${event}::${transcriptChunk.slice(0, 200)}`;

        // Brug cache hvis muligt
        if (cache.has(cacheKey)) {
            return res.status(200).json({ cached: true, ...cache.get(cacheKey) });
        }

        // Model og prompt setup
        const model = body.model || "gpt-4o-mini";
        const messages =
            body.messages ||
            [
                {
                    role: "system",
                    content:
                        "You are a helpful AI assistant for classroom support. Answer clearly and briefly.",
                },
                { role: "user", content: transcriptChunk || "Please provide a short answer." },
            ];

        // Send request til OpenAI API
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
            return res
                .status(502)
                .json({ error: "OpenAI API failed", status: response.status, body: errText });
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content || "";
        const result = { choices: [{ message: { content } }] };

        // Gem i cache og send tilbage
        cache.set(cacheKey, result);
        return res.status(200).json(result);

    } catch (err) {
        console.error("AI handler error:", err);
        return res.status(500).json({ error: "Internal error", details: String(err) });
    }
}
