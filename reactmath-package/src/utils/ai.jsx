/**
 * AI Generation Utilities
 * Wraps OpenAI API calls for SEO generation
 */

const SYSTEM_PROMPT = "You are an expert SEO specialist. Generate high-quality, engaging, and SEO-optimized content. Return ONLY the requested content without quotes or explanations.";

export const generateSEOTitle = async (apiKey, content, keywords) => {
    if (!apiKey) throw new Error("API Key missing");

    const prompt = `Generate a single, catchy SEO page title (max 60 chars) for the following content. Include these keywords if meaningful: ${keywords.join(', ')}. Content snippet: ${content.substring(0, 500)}...`;

    return await callOpenAIText(apiKey, prompt);
};

export const generateSEODescription = async (apiKey, content, keywords) => {
    if (!apiKey) throw new Error("API Key missing");

    const prompt = `Generate a compelling meta description (max 160 chars) that encourages clicks. Include these keywords: ${keywords.join(', ')}. Content snippet: ${content.substring(0, 500)}...`;

    return await callOpenAIText(apiKey, prompt);
};

export const generateSEOImage = async (apiKey, topic) => {
    if (!apiKey) throw new Error("API Key missing");

    try {
        const response = await fetchWithTimeout('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "dall-e-3",
                prompt: `A high-quality, professional, modern web website image representing: ${topic}. Minimalist, digital art style.`,
                n: 1,
                size: "1024x1024"
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
            throw new Error(err.error?.message || `OpenAI Error: ${response.status}`);
        }

        const data = await response.json();
        return data.data[0].url;
    } catch (e) {
        console.error("AI Image Gen Error:", e);
        throw e;
    }
};

// Helper for Text Completions (using gpt-3.5-turbo for speed/cost)
const callOpenAIText = async (apiKey, userPrompt) => {
    try {
        console.log('Sending request to OpenAI...');
        const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.7,
                max_tokens: 100
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
            throw new Error(err.error?.message || `OpenAI Error: ${response.status}`);
        }

        const data = await response.json();
        console.log('OpenAI Response:', data);
        if (!data.choices || !data.choices[0]) {
            console.error('Unexpected OpenAI format:', data);
            throw new Error('Invalid response from AI');
        }
        return data.choices[0].message.content.trim().replace(/^"|"$/g, '');
    } catch (e) {
        console.error("AI Text Gen Error:", e);
        throw e;
    }
};

const fetchWithTimeout = async (resource, options = {}) => {
    const { timeout = 15000 } = options;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(resource, {
        ...options,
        signal: controller.signal
    });

    clearTimeout(id);
    return response;
};
