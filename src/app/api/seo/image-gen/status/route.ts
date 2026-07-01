import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getKieImageTask } from "@/lib/seo/kieImages";

// POST /api/seo/image-gen/status — poll a kie.ai image-generation task.
// body: { taskId, apiKey } -> { state, resultUrls?, progress?, error? }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json();
  const apiKey = String(b.apiKey ?? "");
  const taskId = String(b.taskId ?? "");
  if (!apiKey || !taskId) return NextResponse.json({ error: "missing_params" }, { status: 400 });

  const r = await getKieImageTask(taskId, apiKey);
  return NextResponse.json(r);
}
