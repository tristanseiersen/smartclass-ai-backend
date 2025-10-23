const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_KEY = process.env.OPENAI_API_KEY;

export default async function handler(req, res) {
    // ✅ CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    // ✅ Health check (GET request)
    if (req.method === "GET") {
        return res.status(200).json({
            ok: true,
            hasKey: !!OPENAI_KEY,
            service: "SmartClass AI Backend",
            timestamp: new Date().toISOString()
        });
    }

    // ✅ Only POST allowed
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const body = req.body;

        console.log("📥 Received request:", {
            hasModel: !!body.model,
            hasMessages: !!body.messages,
            messageCount: body.messages?.length,
            hasResponseFormat: !!body.response_format
        });

        // ✅ Check API key
        if (!OPENAI_KEY) {
            console.error("❌ OPENAI_API_KEY not set in environment");
            return res.status(500).json({
                error: "API key not configured",
                details: "OPENAI_API_KEY must be set in Vercel Environment Variables"
            });
        }

        // ✅ Build OpenAI request (exact format OpenAI expects)
        const openaiPayload = {
            model: body.model || "gpt-4o-mini",
            messages: body.messages || [
                { role: "system", content: "You are a helpful assistant." },
                { role: "user", content: body.prompt || "Hello" }
            ],
            temperature: body.temperature || 0.7,
            max_tokens: body.max_tokens || 1000
        };

        // ✅ If JSON response requested, add response_format
        if (body.response_format && body.response_format.type === "json_object") {
            openaiPayload.response_format = { type: "json_object" };
            console.log("✅ JSON mode enabled");
        }

        console.log("📤 Sending to OpenAI:", JSON.stringify(openaiPayload, null, 2));

        // ✅ Call OpenAI API
        const openaiResponse = await fetch(OPENAI_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_KEY}`
            },
            body: JSON.stringify(openaiPayload)
        });

        // ✅ Check OpenAI response status
        if (!openaiResponse.ok) {
            const errorText = await openaiResponse.text();
            console.error("❌ OpenAI API Error:", openaiResponse.status, errorText);
            return res.status(openaiResponse.status).json({
                error: "OpenAI API failed",
                status: openaiResponse.status,
                details: errorText
            });
        }

        // ✅ Parse OpenAI response
        const openaiData = await openaiResponse.json();

        console.log("✅ OpenAI responded successfully");
        console.log("Response preview:", openaiData.choices?.[0]?.message?.content?.substring(0, 100));

        // ✅ Return OpenAI response as-is (standard format)
        return res.status(200).json(openaiData);

    } catch (error) {
        console.error("❌ Handler error:", error);
        return res.status(500).json({
            error: "Internal server error",
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}