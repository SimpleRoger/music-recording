import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import path from "path";
import { getYtdlpBin, cookieArgs, serverArgs } from "../lib/ytdlp";

const router: IRouter = Router();

const PYTHON = process.env.PYTHON_PATH ?? path.resolve(__dirname, "../../../.pythonlibs/bin/python3");
const DETECT_SCRIPT = path.resolve(__dirname, "../../../scripts/detect_key.py");

router.get("/detect-key/:videoId", async (req, res) => {
  const { videoId } = req.params;
  if (!videoId || !/^[a-zA-Z0-9_-]{6,15}$/.test(videoId)) {
    res.status(400).json({ error: "Invalid video ID" });
    return;
  }

  const ytdlp = getYtdlpBin();
  const cookies = cookieArgs();
  const servers = serverArgs();

  try {
    const result = await new Promise<{ note: string; mode: string }>((resolve, reject) => {
      const args = [DETECT_SCRIPT, videoId, ytdlp, ...cookies, ...servers];
      const child = spawn(PYTHON, args);
      const out: Buffer[] = [];
      const err: Buffer[] = [];

      child.stdout.on("data", (d: Buffer) => out.push(d));
      child.stderr.on("data", (d: Buffer) => err.push(d));

      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Timed out"));
      }, 120_000);

      child.on("close", (code) => {
        clearTimeout(timer);
        const stdout = Buffer.concat(out).toString().trim();
        const stderr = Buffer.concat(err).toString().trim();
        // Always try to parse stdout first — the Python script writes error JSON there
        if (stdout) {
          try {
            const parsed = JSON.parse(stdout);
            if (parsed.error) { reject(new Error(parsed.error)); return; }
            resolve(parsed as { note: string; mode: string });
            return;
          } catch { /* fall through */ }
        }
        reject(new Error(stderr || "Script produced no output"));
      });
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "detect-key failed");
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
