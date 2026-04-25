import { Router, type IRouter } from "express";
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function runProcess(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const child = spawn(cmd, args);
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => err.push(d));
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out).toString().trim());
      else reject(new Error(Buffer.concat(err).toString().trim() || `Exit ${code}`));
    });
    child.on("error", reject);
  });
}

async function downloadAudio(videoId: string, outDir: string): Promise<string> {
  const hasCookies = fs.existsSync(COOKIES_FILE);
  const nodeExec = process.execPath;
  const args = [
    "--js-runtimes", `node:${nodeExec}`,
    "--remote-components", "ejs:github",
    "--cache-dir", YTDLP_CACHE_DIR,
    ...(hasCookies ? ["--cookies", COOKIES_FILE] : []),
    "--format", "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio",
    "-o", path.join(outDir, "%(id)s.%(ext)s"),
    `https://www.youtube.com/watch?v=${videoId}`,
  ];
  await runProcess(YTDLP, args);
  const files = fs.readdirSync(outDir).filter((f) => f.startsWith(videoId));
  if (!files.length) throw new Error("yt-dlp succeeded but output file not found");
  return path.join(outDir, files[0]);
}

/** Upload a local file directly to GCS and return the internal objectPath */
async function uploadToStorage(localFile: string, objectName: string, contentType: string): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR ?? "";
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");

  // privateDir format: /bucketName/prefix  or  bucketName/prefix
  const stripped = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
  const [bucketName, ...prefixParts] = stripped.split("/");
  const prefix = prefixParts.join("/");
  const fullObjectName = prefix ? `${prefix}/${objectName}` : objectName;

  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(fullObjectName);
  await file.save(fs.readFileSync(localFile), { contentType, resumable: false });

  // Internal path format used by the storage route: /objects/{objectName}
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
  const [row] = await db.select().from(extractedBeatsTable).where(eq(extractedBeatsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(extractedBeatsTable).where(eq(extractedBeatsTable.id, id));
  res.json({ ok: true });
});

// SSE endpoint — streams progress events then emits "done" with the DB record
router.post("/extracted-beats", async (req, res): Promise<void> => {
  const { videoId, title, thumbnailUrl = "", channelName = "" } = req.body as {
    videoId?: string; title?: string; thumbnailUrl?: string; channelName?: string;
  };
  if (!videoId || !title) { res.status(400).json({ error: "videoId and title are required" }); return; }

  // Return cached result immediately
  const [existing] = await db.select().from(extractedBeatsTable).where(eq(extractedBeatsTable.videoId, videoId));
  if (existing) {
    res.setHeader("Content-Type", "text/event-stream");
    res.write(`event: done\ndata: ${JSON.stringify(existing)}\n\n`);
    res.end();
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const send = (evt: string, data: object) => res.write(`event: ${evt}\ndata: ${JSON.stringify(data)}\n\n`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tubefeed-ext-"));
  const demucsOut = path.join(tmpDir, "demucs");

  try {
    send("progress", { step: "download", message: "Downloading audio…" });
    const audioFile = await downloadAudio(videoId, tmpDir);

    send("progress", { step: "extract", message: "Separating vocals with AI (1–3 min)…" });
    const noVocalsPath = await runProcess(PYTHON, [EXTRACT_SCRIPT, audioFile, demucsOut]);
    if (!noVocalsPath || !fs.existsSync(noVocalsPath)) throw new Error("Extraction produced no output");

    send("progress", { step: "upload", message: "Uploading instrumental…" });
    const objectName = `extracted-beats/${videoId}-instrumental.wav`;
    const objectPath = await uploadToStorage(noVocalsPath, objectName, "audio/wav");

    const [created] = await db
      .insert(extractedBeatsTable)
      .values({ videoId, title, thumbnailUrl, channelName, objectPath })
      .returning();

    send("done", created);
    res.end();
  } catch (err: any) {
    send("error", { message: err.message });
    res.end();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

export default router;
