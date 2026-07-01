// Shared multi-provider LLM caller. Mirrors the providers supported elsewhere
// in the app (Anthropic, Z.AI, OpenAI, Gemini, OpenRouter, Kie.ai).

// Kie.ai's "Codex" endpoint (GPT-5.5) speaks the OpenAI *Responses* API shape, not classic
// chat-completions: `input` is an array of {role, content:[...]} messages (content items are
// {type:"input_text"|"input_image"|"input_file", ...}), and the reply comes back as an `output`
// array of items — a "reasoning" item (usually empty/summary-only) and a "message" item whose
// content holds the actual text. Shared by fetchLLM + fetchLLMVision below.
function parseKieOutput(data: any): string {
  const out: any[] = Array.isArray(data?.output) ? data.output : [];
  for (const item of out) {
    if (item?.type === 'message') {
      const content: any[] = Array.isArray(item.content) ? item.content : [];
      const part = content.find((c: any) => c?.type === 'output_text' || typeof c?.text === 'string');
      if (part?.text) return part.text;
    }
  }
  return typeof data?.output_text === 'string' ? data.output_text : '';
}

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
    } else if (provider === 'kie') {
      // Kie.ai "Codex" (GPT-5.5) — Responses API, distinct from the "custom" chat-completions path.
      const root = (baseUrl || 'https://api.kie.ai').replace(/\/+$/, '');
      const res = await fetch(`${root}/codex/v1/responses`, {
        method: 'POST', signal: sig,
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelOverride ?? 'gpt-5-5',
          stream: false,
          input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
          reasoning: { effort: 'medium' },
        }),
      });
      if (!res.ok) { console.error('[LLM] kie', res.status, await res.text().catch(() => '')); return null; }
      const data = await res.json();
      text = parseKieOutput(data);
    } else if (provider === 'custom') {
      // Any OpenAI-compatible endpoint. baseUrl is the API root; we call /chat/completions.
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
    } else if (provider === 'kie') {
      // NOTE: the Codex Responses API's `input_image.image_url` is documented as a "publicly
      // accessible URL" — unclear if kie.ai's backend also accepts base64 data URIs the way
      // OpenAI's own Responses API does. Untested against a real key; falls back cleanly (non-200)
      // if the backend rejects it, same as any other provider error path here.
      const root = (baseUrl || 'https://api.kie.ai').replace(/\/+$/, '');
      const dataUrl = `data:${mimeType};base64,${b64}`;
      const res = await fetch(`${root}/codex/v1/responses`, {
        method: 'POST', signal: sig,
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelOverride ?? 'gpt-5-5',
          stream: false,
          input: [{ role: 'user', content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: dataUrl },
          ] }],
          reasoning: { effort: 'medium' },
        }),
      });
      if (!res.ok) { console.error('[LLM vision] kie', res.status, await res.text().catch(() => '')); return null; }
      const data = await res.json();
      text = parseKieOutput(data);
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
