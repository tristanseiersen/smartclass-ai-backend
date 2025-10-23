import { LRUCache } from "lru-cache";

const cache = new LRUCache({
    max: 500,
    ttl: 1000 * 60 * 60 * 24 * 30, // 30 dage
});

const OPENAI_KEY = process.env.OPENAI_API_KEY;

export default async function handler(req, res) {
    // 👇 test endpoint
    if (req.method === "GET") {
        const hasKey = !!OPENAI_KEY;
        return res.status(200).json({
            ok: true,
            haskey: hasKey,
            note: hasKey
                ? "✅ hasKey = true betyder Vercel har variablen til denne deployment."
                : "❌ Ingen API-nøgle fundet i miljøvariabler.",
        });
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const body = req.body || {};
        const prompt =
            body.prompt ||
            body.payload?.transcriptChunk ||
            body.transcript ||
            "Hello from SmartClass AI.";

        if (!OPENAI_KEY) {
            return res.status(500).json({
                error: "API key not configured",
                details:
                    "OPENAI_API_KEY skal sættes i Vercel > Project Settings > Environment Variables.",
            });
        }

        const cacheKey = prompt.slice(0, 200);
        if (cache.has(cacheKey)) {
            return res.status(200).json({ cached: true, ...cache.get(cacheKey) });
        }

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${OPENAI_KEY}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content:
                            "You are a helpful AI assistant for SmartClass that answers briefly and clearly.",
                    },
                    { role: "user", content: prompt },
                ],
                temperature: 0.6,
                max_tokens: 300,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("OpenAI API fejl:", errorText);
            return res.status(502).json({
                error: "OpenAI API fejl",
                status: response.status,
                details: errorText,
            });
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content || "";

        const result = { message: content };
        cache.set(cacheKey, result);
        return res.status(200).json(result);
    } catch (err) {
        console.error("AI handler fejl:", err);
        return res.status(500).json({
            error: "Internal Server Error",
            details: String(err),
        });
    }
}
