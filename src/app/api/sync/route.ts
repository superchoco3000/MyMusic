import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";

export const maxDuration = 300; // 5 min cap (Vercel/Next.js)

const STATUS_PATH = path.join(process.cwd(), "public", "data", "sync_status.json");

// ── Helpers ───────────────────────────────────────────────────────────────────

async function writeStatus(payload: Record<string, unknown>) {
  try {
    await fs.mkdir(path.dirname(STATUS_PATH), { recursive: true });
    await fs.writeFile(STATUS_PATH, JSON.stringify({ ...payload, updated_at: new Date().toISOString() }, null, 2), "utf-8");
  } catch {
    // non-fatal: the Python scripts will overwrite it anyway
  }
}

/**
 * Spawns a Python script in fire-and-forget mode (detached child).
 * Returns a promise that resolves when the process exits.
 * Rejects with the combined stderr if the exit code is non-zero.
 */
function runPython(scriptPath: string, args: string[], cwd: string, env: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("python", [scriptPath, ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env, ...env },
    });

    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });

    child.on("close", (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Exit ${code}: ${stderr.slice(-500)}`));
      }
    });

    child.on("error", (err: Error) => reject(err));
  });
}

// ── POST /api/sync ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const cwd = process.cwd();

  let token = "";
  try {
    const body = await request.json().catch(() => ({}));
    token = body?.provider_token || body?.access_token || body?.token || "";
  } catch {
    // optional body
  }

  if (!token || !token.trim()) {
    console.warn("[API /api/sync] Blocked: missing Spotify provider_token.");
    return NextResponse.json(
      { error: "No autorizado. Token de Spotify no proporcionado." },
      { status: 401 }
    );
  }

  // Respond immediately — the heavy work runs in the background
  // We kick off the two-phase pipeline asynchronously so the browser doesn't time out.
  runTwoPhaseSync(cwd, token.trim()).catch((err) => {
    console.error("[API /api/sync] Background pipeline error:", err);
  });

  return NextResponse.json({
    status: "started",
    message: "Pipeline de sincronización de dos fases iniciado en segundo plano.",
  });
}

// ── Rate-limit detection ──────────────────────────────────────────────────────
const RATE_LIMIT_RE = /rate[/\s._-]?limit|429|retry[/\s._-]?after|retry will occur|max retries/i;

function isRateLimit(msg: string): boolean {
  return RATE_LIMIT_RE.test(msg);
}

// ── Two-Phase Background Pipeline ────────────────────────────────────────────

async function runTwoPhaseSync(cwd: string, token: string) {
  const deltaSyncScript  = path.join(cwd, "sync_library.py");
  const enrichScript     = path.join(cwd, "enrich_metadata.py");
  const tokenEnv         = { SPOTIFY_ACCESS_TOKEN: token };

  // ── Phase 1: Delta Sync ──────────────────────────────────────────────────
  await writeStatus({
    status: "syncing",
    phase: "delta",
    phase_label: "Buscando cambios en Spotify...",
    message: "Fase 1/2: Comparando snapshot_id de playlists y descargando deltas.",
  });

  console.log("[sync/route] Phase 1 — running sync_library.py...");

  try {
    await runPython(deltaSyncScript, [token], cwd, tokenEnv);
    console.log("[sync/route] Phase 1 — delta sync OK.");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync/route] Phase 1 failed:", message);

    const rateLimit = isRateLimit(message);
    await writeStatus({
      status: "error",
      phase: "delta",
      rate_limited: rateLimit,
      message: rateLimit
        ? `Spotify Rate Limit (429) — Retry after ~10 min. El servidor de Spotify ha limitado las peticiones. ${message.slice(0, 200)}`
        : `Error en delta sync (Fase 1): ${message.slice(0, 300)}`,
    });
    return;
  }

  // ── Phase 2: Metadata Enrichment ─────────────────────────────────────────
  await writeStatus({
    status: "syncing",
    phase: "enrich",
    phase_label: "Enriqueciendo metadatos nuevos...",
    message: "Fase 2/2: Descargando audio_features para tracks sin metadatos.",
  });

  console.log("[sync/route] Phase 2 — running enrich_metadata.py...");

  try {
    await runPython(enrichScript, ["--token", token, "--sleep", "3"], cwd, tokenEnv);
    console.log("[sync/route] Phase 2 — enrichment OK.");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const rateLimit = isRateLimit(message);
    console.warn("[sync/route] Phase 2 warning (non-fatal):", message);
    await writeStatus({
      status: "done",           // Phase 1 succeeded — still mark done
      phase: "enrich",
      phase_label: rateLimit ? "Cooldown (enriquecimiento)" : "Completado (enriquecimiento parcial)",
      rate_limited: rateLimit,
      warning: true,
      message: rateLimit
        ? `Spotify Rate Limit (429) en enrichment — Fase 1 completada. El enriquecimiento se puede reintentar más tarde.`
        : `Sincronización completada. Advertencia en enriquecimiento: ${message.slice(0, 200)}`,
    });
    return;
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  await writeStatus({
    status: "done",
    phase: "complete",
    phase_label: "Sincronización completada",
    message: "Delta sync + enriquecimiento de metadatos finalizados con éxito.",
  });

  console.log("[sync/route] Two-phase pipeline complete.");
}

// ── GET /api/sync ─────────────────────────────────────────────────────────────

export async function GET() {
  let currentStatus: Record<string, unknown> | null = null;
  try {
    const raw = await fs.readFile(STATUS_PATH, "utf-8");
    currentStatus = JSON.parse(raw);
  } catch {
    currentStatus = null;
  }

  return NextResponse.json({
    status: "ok",
    message: "POST a este endpoint con { provider_token } para iniciar el pipeline de sync.",
    current_sync_status: currentStatus,
  });
}
