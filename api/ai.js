import { LRUCache } from "lru-cache";

const cache = new LRUCache({
    max: 500,
    ttl: 1000 * 60 * 60 * 24 * 30,
});

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_KEY = process.env.OPENAI_API_KEY;

export default async function handler(req, res) {
    try {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === "OPTIONS") {
            return res.status(200).end();
        }

        if (req.method === "GET") {
            return res.status(200).json({
                ok: true,
                hasKey: !!OPENAI_KEY,
                endpoint: "SmartClass AI Vercel Backend",
                timestamp: new Date().toISOString()
            });
        }

        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        const body = req.body || {};
        
        console.log("📥 Received request:", JSON.stringify(body, null, 2));

        if (!OPENAI_KEY) {
            return res.status(500).json({
                error: "API key not configured",
                details: "OPENAI_API_KEY must be set in Vercel Environment Variables"
            });
        }

        const model = body.model || "gpt-4o-mini";
        let messages = body.messages || [
            { role: "system", content: "You are a helpful AI assistant." },
            { role: "user", content: body.prompt || "Hello" }
        ];

        const openaiPayload = {
            model,
            messages,
            temperature: body.temperature || 0.7,
            max_tokens: body.max_tokens || 1000
        };

        // ✅ CRITICAL: If response_format is requested, enforce it
        if (body.response_format && body.response_format.type === "json_object") {
            openaiPayload.response_format = { type: "json_object" };
            
            // ✅ ENSURE the last user message explicitly asks for JSON
            const lastMessageIndex = messages.length - 1;
            if (!messages[lastMessageIndex].content.toLowerCase().includes('json')) {
                messages[lastMessageIndex].content += "\n\nIMPORTANT: You must respond with valid JSON only. No additional text.";
            }
            
            console.log("📋 JSON response format enabled");
            console.log("Updated prompt:", messages[lastMessageIndex].content);
        }

        console.log("🔄 Calling OpenAI with payload:", JSON.stringify(openaiPayload, null, 2));

        const response = await fetch(OPENAI_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${OPENAI_KEY}`,
            },
            body: JSON.stringify(openaiPayload),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("❌ OpenAI error:", response.status, errText);
            return res.status(response.status).json({ 
                error: "OpenAI API failed", 
                status: response.status, 
                details: errText 
            });
        }

        const data = await response.json();
        
        console.log("✅ OpenAI response:", JSON.stringify(data, null, 2));

        // Return standard OpenAI format
        return res.status(200).json({
            choices: data.choices,
            usage: data.usage,
            model: data.model
        });

    } catch (err) {
        console.error("❌ Handler error:", err);
        return res.status(500).json({ 
            error: "Internal error", 
            details: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
}