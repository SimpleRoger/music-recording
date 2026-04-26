import fs from "fs";
import os from "os";
import path from "path";
import { logger } from "./logger";

// ── Binaries ──────────────────────────────────────────────────────────────────
export const YTDLP_BIN =
  process.env.YTDLP_PATH ??
  path.resolve(__dirname, "../../../.pythonlibs/bin/yt-dlp");

export const YTDLP_CACHE_DIR =
  process.env.YTDLP_CACHE_DIR ??
  path.resolve(__dirname, "../../../.ytdlp-cache");

// ── ffmpeg ────────────────────────────────────────────────────────────────────
function resolveFfmpegDir(): string {
  if (process.env.FFMPEG_PATH) return path.dirname(process.env.FFMPEG_PATH);
  const candidates = ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"];
  for (const c of candidates) {
    if (fs.existsSync(c)) return path.dirname(c);
  }
  try {
    const { execSync } = require("child_process");
    const bin = execSync("which ffmpeg", { encoding: "utf8" }).trim();
    if (bin) return path.dirname(bin);
  } catch {}
  return "";
}
export const FFMPEG_DIR = resolveFfmpegDir();
export const ffmpegArgs = (): string[] =>
  FFMPEG_DIR ? ["--ffmpeg-location", FFMPEG_DIR] : [];

// ── Authentication ────────────────────────────────────────────────────────────
// YouTube requires browser cookies for server-side yt-dlp downloads.
// OAuth2 was removed by YouTube in early 2025 — cookies are the only method.
//
// Priority:
//  1. YTDLP_COOKIES_PATH env var (explicit file path)
//  2. YTDLP_COOKIES secret (raw Netscape cookies.txt content) → written to /tmp
//  3. youtube-cookies.txt in workspace root (dev convenience)

let _cookiePath: string | null = null;
let _resolved = false;

function resolveCookiePath(): string | null {
  if (_resolved) return _cookiePath;
  _resolved = true;

  if (process.env.YTDLP_COOKIES_PATH) {
    if (fs.existsSync(process.env.YTDLP_COOKIES_PATH)) {
      _cookiePath = process.env.YTDLP_COOKIES_PATH;
      logger.info("YouTube cookies loaded from YTDLP_COOKIES_PATH");
      return _cookiePath;
    }
  }

  const rawCookies = process.env.YTDLP_COOKIES;
  if (rawCookies && rawCookies.trim().length > 10) {
    const tmpPath = path.join(os.tmpdir(), "tubefeed-yt-cookies.txt");
    try {
      fs.writeFileSync(tmpPath, rawCookies, { mode: 0o600 });
      _cookiePath = tmpPath;
      logger.info({ path: tmpPath }, "YouTube cookies written from YTDLP_COOKIES secret");
      return _cookiePath;
    } catch (e) {
      logger.error({ err: e }, "Failed to write YTDLP_COOKIES to temp file");
    }
  }

  const devFile = path.resolve(__dirname, "../../../youtube-cookies.txt");
  if (fs.existsSync(devFile)) {
    _cookiePath = devFile;
    logger.info("YouTube cookies loaded from dev file");
    return _cookiePath;
  }

  logger.warn(
    "No YouTube cookies found — set the YTDLP_COOKIES secret to enable beat/audio downloads"
  );
  return null;
}

// Eagerly resolve on module load so it's ready before the first request
resolveCookiePath();

/** Returns yt-dlp auth args to append to every download command. */
export function authArgs(): string[] {
  const p = resolveCookiePath();
  return p ? ["--cookies", p] : [];
}

// Alias for backwards compatibility
export const cookieArgs = authArgs;
