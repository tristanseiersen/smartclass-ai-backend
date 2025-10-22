import fetch from 'node-fetch';
import LRU from 'lru-cache';

/**
 * Simple serverless handler for Vercel: /api/ai
 * Expected input: JSON schema Base44 provided (model/messages...) OR custom payload from Base44 backend function.
 * Response: JSON shaped like OpenAI Chat response OR simplified string.
 *
 * NOTE: Set OPENAI_API_KEY in Vercel Environment Variables.
 */

// In-memory LRU cache for simple dedupe (max 500 entries, 30 days)
const cache = new LRU({ max: 500, ttl: 1000 * 60 * 60 * 24 * 30 });

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_KEY = process.env.OPENAI_API_KEY;

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

        const body = req.body || {};
        // Normalize incoming payloads - allow both Base44 format and simpler formats
        const event = body.event || body.type || (body.payload && body.payload.event) || 'generic';
        const transcriptChunk = body.payload?.transcriptChunk || body.transcript || body.prompt || '';
        const cacheKey = `${event}::${(transcriptChunk || '').slice(0, 200)}`;

        // 1) Check cache - return cached full response (string or JSON) if exists
        if (cache.has(cacheKey)) {
            const cached = cache.get(cacheKey);
            return res.status(200).json({ cached: true, ...cached });
        }

        // 2) Minimal prompt composition - DO NOT send full transcript; keep short context id and snippet
        // Build messages array for OpenAI (use gpt-4o-mini or whichever you choose)
        const model = (body.model) || 'gpt-4o-mini';
        const messages = body.messages || [
            { role: 'system', content: 'You are a helpful AI assistant for classroom support. Answer concisely and in the requested grade level.' },
            { role: 'user', content: transcriptChunk || 'Please provide a short answer.' }
        ];

        // Optional: If caller provided gradeLevel, include in system instruction
        if (body.payload?.context?.includes('gradeLevel') || body.gradeLevel) {
            const level = body.gradeLevel || (body.payload && body.payload.context && body.payload.context.gradeLevel) || null;
            if (level) {
                messages.unshift({ role: 'system', content: `Answer targeted for grade level: ${level}.` });
            }
        }

        // 3) Call OpenAI (Chat Completions)
        const openaiResp = await fetch(OPENAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_KEY}`
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
            console.error('OpenAI error', openaiResp.status, txt);
            return res.status(502).json({ error: 'OpenAI error', status: openaiResp.status, body: txt });
        }

        const openaiData = await openaiResp.json();

        // 4) Normalize response content
        const content = openaiData.choices?.[0]?.message?.content || '';
        // Try to parse JSON content if it looks like JSON (Base44 expects sometimes JSON stringified)
        let parsed = null;
        try { parsed = JSON.parse(content); } catch (e) { parsed = null; }

        const result = parsed ? { choices: [{ message: { content: JSON.stringify(parsed) } }], raw: openaiData } : { choices: [{ message: { content } }], raw: openaiData };

        // 5) Cache the result (short TTL)
        cache.set(cacheKey, result);

        // 6) Logging
        console.log('AI_HANDLER', { event, cacheKey, model, status: 'ok' });

        // 7) Return result in the format Base44 expects (they already showed example with choices.message.content string)
        return res.status(200).json(result);

    } catch (err) {
        console.error('AI handler error', err);
        return res.status(500).json({ error: 'Internal error', details: String(err) });
    }
}
