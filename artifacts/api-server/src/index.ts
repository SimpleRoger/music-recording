import { execFileSync } from "child_process";
import app from "./app";
import { logger } from "./lib/logger";

// ── Ensure curl_cffi is installed ─────────────────────────────────────────────
// curl_cffi 0.13.0 gives yt-dlp a real Chrome TLS fingerprint so YouTube
// does not block downloads from datacenter IPs even with valid cookies.
// .pythonlibs is not committed to git so pip must install it at startup.
(function ensureCurlCffi() {
  try {
    execFileSync("python", ["-m", "pip", "install", "--quiet", "curl_cffi==0.13.0"], {
      stdio: "pipe",
      timeout: 60_000,
    });
    logger.info("curl_cffi 0.13.0 ready");
  } catch (e: any) {
    logger.warn({ err: e?.message }, "curl_cffi install skipped (pip unavailable?)");
  }
})();

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
