export default async function handler(req, res) {
    // --- GET til test af nøglen ---
    if (req.method === "GET") {
        const hasKey = !!process.env.OPENAI_API_KEY;
        return res.status(200).json({
            ok: true,
            haskey: hasKey,
            note: "✅ hasKey = true betyder Vercel har variablen til denne deployment.",
        });
    }

    // --- POST håndtering (Base44 bruger denne) ---
    if (req.method === "POST") {
        try {
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) {
                return res.status(500).json({
                    error: "API key not configured",
                });
            }

            const body = req.body || {};
            const prompt =
                body.prompt || body.input || body.transcript || "Hello from SmartClass AI";

            const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.7,
                    max_tokens: 200,
                }),
            });

            const data = await response.json();
            return res.status(200).json(data);
        } catch (error) {
            console.error("AI Handler Error:", error);
            return res.status(500).json({ error: String(error) });
        }
    }

    // --- Andre metoder ---
    return res.status(405).json({ error: "Method not allowed" });
}
