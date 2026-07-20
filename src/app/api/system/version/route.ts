import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { promisify } from "util";
import { exec as execCb } from "child_process";

const exec = promisify(execCb);

// GET /api/system/version
// Compares the locally-checked-out git commit with the latest commit on origin/main
// (GitHub API) and returns { local, remote, behind, updateAvailable, changelog[], isGit }.
// No secrets — reads the public repo. Used by the dashboard "update available" banner.

const REPO = "fenjo26/opengsc";
const BRANCH = "main";

async function localCommit(): Promise<string | null> {
  try {
    const { stdout } = await exec("git rev-parse HEAD", { cwd: process.cwd(), timeout: 5000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const local = await localCommit();
  if (!local) {
    // Not a git checkout (e.g. Docker image) — self-update from UI isn't possible.
    return NextResponse.json({ isGit: false, updateAvailable: false });
  }

  try {
    const headers = { Accept: "application/vnd.github+json", "User-Agent": "opengsc" };
    // Latest commit on main
    const relRes = await fetch(`https://api.github.com/repos/${REPO}/commits/${BRANCH}`, { headers, signal: AbortSignal.timeout(10000) });
    if (!relRes.ok) return NextResponse.json({ isGit: true, local, updateAvailable: false, error: `github ${relRes.status}` });
    const latest = await relRes.json();
    const remote = String(latest.sha ?? "");

    if (!remote || remote === local) {
      return NextResponse.json({ isGit: true, local, remote, behind: 0, updateAvailable: false });
    }

    // How far behind + changelog (commit subjects between local and remote)
    let behind = 0;
    let changelog: { sha: string; message: string; date: string }[] = [];
    try {
      const cmpRes = await fetch(`https://api.github.com/repos/${REPO}/compare/${local}...${remote}`, { headers, signal: AbortSignal.timeout(10000) });
      if (cmpRes.ok) {
        const cmp = await cmpRes.json();
        behind = cmp.ahead_by ?? cmp.total_commits ?? 0;
        changelog = (cmp.commits ?? [])
          .slice(-30)
          .reverse()
          .map((c: any) => ({
            sha: String(c.sha ?? "").slice(0, 7),
            message: String(c.commit?.message ?? "").split("\n")[0],
            date: c.commit?.author?.date ?? "",
          }))
          // Hide noise
          .filter((c: any) => c.message && !/^merge /i.test(c.message));
      }
    } catch { /* compare is best-effort — the update flag still works without it */ }

    return NextResponse.json({
      isGit: true,
      local: local.slice(0, 7),
      remote: remote.slice(0, 7),
      behind,
      updateAvailable: true,
      changelog,
    });
  } catch (e: any) {
    return NextResponse.json({ isGit: true, local: local.slice(0, 7), updateAvailable: false, error: String(e?.message ?? e) });
  }
}
