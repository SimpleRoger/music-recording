import { Router, type IRouter, type Response } from "express";
import { eq, desc } from "drizzle-orm";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { db, extractedBeatsTable } from "@workspace/db";
import { searchVideos } from "../lib/youtube";
import { objectStorageClient } from "../lib/objectStorage";

const router: IRouter = Router();

// Paths
const YTDLP   = process.env.YTDLP_PATH   ?? path.resolve(__dirname, "../../../.pythonlibs/bin/yt-dlp");
const PYTHON  = process.env.PYTHON_PATH  ?? path.resolve(__dirname, "../../../.pythonlibs/bin/python3");
const EXTRACT_SCRIPT = path.resolve(__dirname, "../../../scripts/extract_beat.py");
const COOKIES_FILE   = process.env.YTDLP_COOKIES_PATH ?? path.resolve(__dirname, "../../../youtube-cookies.txt");
const YTDLP_CACHE_DIR = process.env.YTDLP_CACHE_DIR   ?? path.resolve(__dirname, "../../../.ytdlp-cache");

// ── SSE helper ────────────────────────────────────────────────────────────────
function setupSSE(res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx/caddy buffering
  res.flushHeaders(); // send headers immediately so browser opens the stream

  const send = (evt: string, data: object) => {
    res.write(`event: ${evt}\ndata: ${JSON.stringify(data)}\n\n`);
    // @ts-ignore — flush exists when compression middleware is present
    res.flush?.();
  };

  // Heartbeat every 5 s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
    // @ts-ignore
    res.flush?.();
  }, 5000);

  const finish = () => clearInterval(heartbeat);
  return { send, finish };
}

// ── Process runner with timeout + kill on close ───────────────────────────────
interface RunOpts {
  timeoutMs?: number;
  onStderr?: (line: string) => void;
  signal?: AbortSignal;
}

function runProcess(cmd: string, args: string[], opts: RunOpts = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const { timeoutMs = 10 * 60 * 1000, onStderr, signal } = opts;

    const child = spawn(cmd, args);
    const out: Buffer[] = [];
    const err: Buffer[] = [];

    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => {
      err.push(d);
      if (onStderr) {
        d.toString().split("\n").filter(Boolean).forEach((l) => onStderr(l));
      }
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Process timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    const onAbort = () => { child.kill("SIGKILL"); reject(new Error("Cancelled")); };
    signal?.addEventListener("abort", onAbort);

    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (code === 0) resolve(Buffer.concat(out).toString().trim());
      else reject(new Error(Buffer.concat(err).toString().trim() || `Process exited with code ${code}`));
    });

    child.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

async function downloadAudio(videoId: string, outDir: string, opts: RunOpts = {}): Promise<string> {
  const hasCookies = fs.existsSync(COOKIES_FILE);
  const cookieArgs = hasCookies ? ["--cookies", COOKIES_FILE] : [];
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  // ── Pre-flight: check the video is actually downloadable (fast, ~2s) ──────
  try {
    await runProcess(YTDLP, [
      "--cache-dir", YTDLP_CACHE_DIR,
      "--no-playlist", "--simulate", "--no-warnings",
      ...cookieArgs,
      url,
    ], { ...opts, timeoutMs: 30_000 });
  } catch (e: any) {
    const msg = e.message ?? "";
    if (msg.includes("unavailable") || msg.includes("Private") || msg.includes("Sign in")) {
      throw new Error(
        "This video is not available for download on this server — it is likely a major-label music video blocked by Content ID. " +
        "Try searching for an audio-only upload, a lyrics video, or a beat/instrumental version instead."
      );
    }
    throw e; // re-throw if it's a different error
  }

  // ── Actual download ──────────────────────────────────────────────────────
  const args = [
    "--cache-dir", YTDLP_CACHE_DIR,
    "--no-playlist",
    "--format", "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio",
    "--no-warnings",
    "-o", path.join(outDir, "%(id)s.%(ext)s"),
    ...cookieArgs,
    url,
  ];
  await runProcess(YTDLP, args, { ...opts, timeoutMs: 3 * 60 * 1000 });
  const files = fs.readdirSync(outDir).filter((f) => f.startsWith(videoId));
  if (!files.length) throw new Error("yt-dlp succeeded but no output file found");
  return path.join(outDir, files[0]);
}

/** Upload a local file directly to GCS and return the internal objectPath */
async function uploadToStorage(localFile: string, objectName: string, contentType: string): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR ?? "";
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");

  const stripped = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
  const [bucketName, ...prefixParts] = stripped.split("/");
  const prefix = prefixParts.join("/");
  const fullObjectName = prefix ? `${prefix}/${objectName}` : objectName;

  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(fullObjectName);
  await file.save(fs.readFileSync(localFile), { contentType, resumable: false });
  return `/objects/${objectName}`;
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/search-songs", async (req, res): Promise<void> => {
  const q = String(req.query.q ?? "").trim();
  if (!q) { res.status(400).json({ error: "q is required" }); return; }
  try {
    const results = await searchVideos(q, 12);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/extracted-beats", async (_req, res): Promise<void> => {
  const rows = await db.select().from(extractedBeatsTable).orderBy(desc(extractedBeatsTable.createdAt));
  res.json(rows);
});

router.delete("/extracted-beats/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(extractedBeatsTable).where(eq(extractedBeatsTable.id, id));
  res.json({ ok: true });
});

// SSE endpoint — streams progress then emits "done" with the DB record
router.post("/extracted-beats", async (req, res): Promise<void> => {
  const { videoId, title, thumbnailUrl = "", channelName = "" } = req.body as {
    videoId?: string; title?: string; thumbnailUrl?: string; channelName?: string;
  };
  if (!videoId || !title) { res.status(400).json({ error: "videoId and title are required" }); return; }

  // Return cached result immediately
  const [existing] = await db.select().from(extractedBeatsTable).where(eq(extractedBeatsTable.videoId, videoId));
  if (existing) {
    const { send, finish } = setupSSE(res);
    send("done", existing);
    finish();
    res.end();
    return;
  }

  const { send, finish } = setupSSE(res);

  // AbortController so we can cancel child processes when the client disconnects
  const ac = new AbortController();
  req.on("close", () => ac.abort());

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tubefeed-ext-"));
  const demucsOut = path.join(tmpDir, "demucs");

  try {
    // ── Step 1: Download ──────────────────────────────────────────────────────
    send("progress", { step: "download", message: "Downloading audio from YouTube…", pct: 5 });

    const audioFile = await downloadAudio(videoId, tmpDir, { signal: ac.signal });
    send("progress", { step: "download", message: "Audio downloaded ✓", pct: 30 });

    // ── Step 2: Demucs ────────────────────────────────────────────────────────
    send("progress", { step: "extract", message: "Running AI vocal separation (1–3 min)…", pct: 35 });

    let lastDemucsMsg = "";
    const noVocalsPath = await runProcess(
      PYTHON,
      [EXTRACT_SCRIPT, audioFile, demucsOut],
      {
        signal: ac.signal,
        timeoutMs: 8 * 60 * 1000,
        onStderr: (line) => {
          // Demucs logs progress to stderr — forward key lines to the client
          if (line === lastDemucsMsg) return;
          lastDemucsMsg = line;
          const lower = line.toLowerCase();
          if (lower.includes("%") || lower.includes("separating") || lower.includes("loading") || lower.includes("model")) {
            send("progress", { step: "extract", message: line.trim().slice(0, 80), pct: 50 });
          }
        },
      },
    );

    if (!noVocalsPath || !fs.existsSync(noVocalsPath)) {
      throw new Error("Demucs produced no output file");
    }
    send("progress", { step: "extract", message: "Vocals separated ✓", pct: 80 });

    // ── Step 3: Upload ────────────────────────────────────────────────────────
    send("progress", { step: "upload", message: "Uploading instrumental to cloud…", pct: 85 });

    const objectName = `extracted-beats/${videoId}-instrumental.wav`;
    const objectPath = await uploadToStorage(noVocalsPath, objectName, "audio/wav");

    const [created] = await db
      .insert(extractedBeatsTable)
      .values({ videoId, title, thumbnailUrl, channelName, objectPath })
      .returning();

    send("done", created);
    res.end();
  } catch (err: any) {
    if (err.message !== "Cancelled") {
      send("error", { message: err.message });
    }
    res.end();
  } finally {
    finish();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

export default router;
