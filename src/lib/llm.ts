// Shared multi-provider LLM caller. Mirrors the providers supported elsewhere
// in the app (Anthropic, Z.AI, OpenAI, Gemini, OpenRouter).
export async function fetchLLM(
  prompt: string,
  provider: string,
  apiKey: string,
  maxTokens = 1024,
  modelOverride?: string,
  baseUrl?: string,
): Promise<string | null> {
  // Hard timeout so a stuck/over-long generation fails in minutes instead of hanging forever.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 280_000);
  const sig = ctrl.signal;
  try {
    let text = '';
    if (provider === 'anthropic' || provider === 'zai') {
      const baseUrl = provider === 'zai' ? 'https://api.z.ai/api/anthropic' : 'https://api.anthropic.com';
      const model = modelOverride ?? (provider === 'zai' ? 'glm-4.5-air' : 'claude-haiku-4-5-20251001');
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST', signal: sig,
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) { console.error('[LLM]', provider, res.status, await res.text()); return null; }
      const data = await res.json();
      text = data.content?.[0]?.text ?? '';
    } else if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', signal: sig,
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelOverride ?? 'gpt-4o-mini', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) { console.error('[LLM] openai', res.status); return null; }
      const data = await res.json();
      text = data.choices?.[0]?.message?.content ?? '';
    } else if (provider === 'gemini') {
      const gModel = modelOverride ?? 'gemini-1.5-flash';
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${gModel}:generateContent?key=${apiKey}`, {
        method: 'POST', signal: sig,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (!res.ok) { console.error('[LLM] gemini', res.status); return null; }
      const data = await res.json();
      text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    } else if (provider === 'openrouter') {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', signal: sig,
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelOverride ?? 'anthropic/claude-3.5-haiku', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) { console.error('[LLM] openrouter', res.status); return null; }
      const data = await res.json();
      text = data.choices?.[0]?.message?.content ?? '';
    } else if (provider === 'custom') {
      // Any OpenAI-compatible endpoint (e.g. kie.ai). baseUrl is the API root; we call /chat/completions.
      const root = (baseUrl || '').replace(/\/+$/, '');
      if (!root) { console.error('[LLM] custom: no baseUrl'); return null; }
      const url = /\/chat\/completions$/.test(root) ? root : `${root}/chat/completions`;
      const res = await fetch(url, {
        method: 'POST', signal: sig,
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelOverride ?? 'gpt-4o-mini', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) { console.error('[LLM] custom', res.status, await res.text().catch(() => '')); return null; }
      const data = await res.json();
      text = data.choices?.[0]?.message?.content ?? '';
    }
    return text;
  } catch (e) {
    console.error('[LLM] fetchLLM error:', (e as any)?.name === 'AbortError' ? 'timeout' : e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Vision variant — same provider set, but the message carries an image alongside the prompt.
// Used by Landing-flow's "разобрать по скриншоту" (screenshot → page structure) feature.
export async function fetchLLMVision(
  prompt: string,
  imageBase64: string,
  mimeType: string,
  provider: string,
  apiKey: string,
  maxTokens = 2048,
  modelOverride?: string,
  baseUrl?: string,
): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 280_000);
  const sig = ctrl.signal;
  const b64 = imageBase64.includes(',') ? imageBase64.split(',').pop()! : imageBase64;
  try {
    let text = '';
    if (provider === 'anthropic' || provider === 'zai') {
      const base = provider === 'zai' ? 'https://api.z.ai/api/anthropic' : 'https://api.anthropic.com';
      const model = modelOverride ?? (provider === 'zai' ? 'glm-4.5v' : 'claude-haiku-4-5-20251001');
      const res = await fetch(`${base}/v1/messages`, {
        method: 'POST', signal: sig,
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model, max_tokens: maxTokens,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: b64 } },
            { type: 'text', text: prompt },
          ] }],
        }),
      });
      if (!res.ok) { console.error('[LLM vision]', provider, res.status, await res.text()); return null; }
      const data = await res.json();
      text = data.content?.[0]?.text ?? '';
    } else if (provider === 'gemini') {
      const gModel = modelOverride ?? 'gemini-1.5-flash';
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${gModel}:generateContent?key=${apiKey}`, {
        method: 'POST', signal: sig,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: b64 } }] }] }),
      });
      if (!res.ok) { console.error('[LLM vision] gemini', res.status); return null; }
      const data = await res.json();
      text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    } else if (provider === 'openai' || provider === 'openrouter' || provider === 'custom') {
      const dataUrl = `data:${mimeType};base64,${b64}`;
      const content = [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: dataUrl } },
      ];
      let url = 'https://api.openai.com/v1/chat/completions';
      let model = modelOverride ?? 'gpt-4o-mini';
      if (provider === 'openrouter') { url = 'https://openrouter.ai/api/v1/chat/completions'; model = modelOverride ?? 'anthropic/claude-3.5-haiku'; }
      if (provider === 'custom') {
        const root = (baseUrl || '').replace(/\/+$/, '');
        if (!root) { console.error('[LLM vision] custom: no baseUrl'); return null; }
        url = /\/chat\/completions$/.test(root) ? root : `${root}/chat/completions`;
      }
      const res = await fetch(url, {
        method: 'POST', signal: sig,
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content }] }),
      });
      if (!res.ok) { console.error('[LLM vision]', provider, res.status, await res.text().catch(() => '')); return null; }
      const data = await res.json();
      text = data.choices?.[0]?.message?.content ?? '';
    } else {
      console.error('[LLM vision] unsupported provider', provider);
      return null;
    }
    return text;
  } catch (e) {
    console.error('[LLM vision] fetchLLMVision error:', (e as any)?.name === 'AbortError' ? 'timeout' : e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
