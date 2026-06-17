// Shared multi-provider LLM caller. Mirrors the providers supported elsewhere
// in the app (Anthropic, Z.AI, OpenAI, Gemini, OpenRouter).
export async function fetchLLM(
  prompt: string,
  provider: string,
  apiKey: string,
  maxTokens = 1024,
  modelOverride?: string,
): Promise<string | null> {
  try {
    let text = '';
    if (provider === 'anthropic' || provider === 'zai') {
      const baseUrl = provider === 'zai' ? 'https://api.z.ai/api/anthropic' : 'https://api.anthropic.com';
      const model = modelOverride ?? (provider === 'zai' ? 'glm-4.5-air' : 'claude-haiku-4-5-20251001');
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) { console.error('[LLM]', provider, res.status, await res.text()); return null; }
      const data = await res.json();
      text = data.content?.[0]?.text ?? '';
    } else if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) { console.error('[LLM] openai', res.status); return null; }
      const data = await res.json();
      text = data.choices?.[0]?.message?.content ?? '';
    } else if (provider === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (!res.ok) { console.error('[LLM] gemini', res.status); return null; }
      const data = await res.json();
      text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    } else if (provider === 'openrouter') {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'anthropic/claude-3.5-haiku', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) { console.error('[LLM] openrouter', res.status); return null; }
      const data = await res.json();
      text = data.choices?.[0]?.message?.content ?? '';
    }
    return text;
  } catch (e) {
    console.error('[LLM] fetchLLM error:', e);
    return null;
  }
}
