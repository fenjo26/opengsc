import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MCP_TOOLS, findTool } from "@/lib/mcp/tools";

// MCP (Model Context Protocol) endpoint — Streamable HTTP transport, stateless mode.
// Lets AI agents (Claude Code, Cursor, Codex, any MCP client) query this instance's
// SEO data with the user's MCP token (Settings → API & MCP).
//
// Connect from Claude Code:
//   claude mcp add --transport http opengsc https://your-domain.com/api/mcp \
//     --header "Authorization: Bearer <token>"
//
// Protocol: JSON-RPC 2.0 over POST. We answer every request with a plain JSON body
// (the spec explicitly allows servers to respond with application/json instead of an
// SSE stream), keep no session state, and support: initialize, ping, tools/list,
// tools/call. Notifications get 202 Accepted.

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "opengsc", version: "1.0.0" };

const INSTRUCTIONS =
  "OpenGSC — self-hosted Google Search Console dashboard with rank tracking, AI-answer-engine (AEO) visibility, backlinks, a competitor Link Monitor, and a built-in site-audit crawler. " +
  "Call get_capabilities first to see which modules have data, then list_sites for site identifiers. " +
  "Most tools read the instance's local store (already synced) — fast and free. The two LIVE tools (query_gsc_live, inspect_url) call Google APIs via the user's own OAuth: free but quota-limited; prefer local tools when they cover the question.";

async function authUserId(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const token = bearer || req.headers.get("x-api-key")?.trim() || "";
  if (!token || !token.startsWith("ogsc_")) return null;
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT id FROM "User" WHERE mcpToken = ?`, token);
    return rows?.[0]?.id ?? null;
  } catch {
    return null; // mcpToken column missing (prisma db push not run yet)
  }
}

type RpcMsg = { jsonrpc?: string; id?: number | string | null; method?: string; params?: any };

const rpcResult = (id: RpcMsg["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const rpcError = (id: RpcMsg["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handleMessage(msg: RpcMsg, userId: string): Promise<object | null> {
  const { id, method, params } = msg;

  // Notifications (no id) get no response body.
  if (id === undefined && method?.startsWith("notifications/")) return null;

  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: typeof params?.protocolVersion === "string" ? params.protocolVersion : PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, {
        tools: MCP_TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      });

    case "tools/call": {
      const name = String(params?.name ?? "");
      const tool = findTool(name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${name}`);
      try {
        const result = await tool.handler(userId, params?.arguments ?? {});
        return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: false });
      } catch (e: any) {
        // Tool-level errors go back as tool results (isError) so the agent can read and react.
        return rpcResult(id, { content: [{ type: "text", text: String(e?.message ?? e) }], isError: true });
      }
    }

    // Optional protocol surface we don't implement — empty lists keep clients happy.
    case "resources/list":
      return rpcResult(id, { resources: [] });
    case "prompts/list":
      return rpcResult(id, { prompts: [] });

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

export async function POST(req: Request) {
  const userId = await authUserId(req);
  if (!userId) {
    return NextResponse.json(rpcError(null, -32001, "Unauthorized: pass your MCP token as 'Authorization: Bearer <token>' (generate one in OpenGSC → Settings → API & MCP)"), { status: 401 });
  }

  let body: RpcMsg | RpcMsg[];
  try { body = await req.json(); } catch {
    return NextResponse.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map(m => handleMessage(m, userId)))).filter(Boolean);
    if (!responses.length) return new Response(null, { status: 202 });
    return NextResponse.json(responses);
  }

  const response = await handleMessage(body, userId);
  if (!response) return new Response(null, { status: 202 }); // notification
  return NextResponse.json(response);
}

// Stateless server: no SSE stream to resume, no session to delete.
export async function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST, DELETE" } });
}
export async function DELETE() {
  return new Response(null, { status: 200 });
}
