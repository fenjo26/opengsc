import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchLLM } from '@/lib/llm';

// POST /api/gsc/ai-summary  { prompt, aiProvider, aiApiKey }
// Generic AI completion endpoint used by the Clarity UX analysis (and reusable
// elsewhere). The provider + key come from the client (stored in localStorage).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.id && !session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const prompt = String(body.prompt ?? '').trim();
  const provider = String(body.aiProvider ?? 'anthropic').trim();
  const apiKey = String(body.aiApiKey ?? '').trim();

  if (!prompt) return NextResponse.json({ error: 'missing_prompt' }, { status: 400 });
  if (!apiKey) return NextResponse.json({ error: 'no_ai_key' }, { status: 400 });

  const summary = await fetchLLM(prompt, provider, apiKey, 1500);
  if (summary == null) {
    return NextResponse.json({ error: 'llm_error' }, { status: 502 });
  }

  return NextResponse.json({ summary });
}
