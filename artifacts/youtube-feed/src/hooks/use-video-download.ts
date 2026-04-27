import { useState, useRef, useCallback } from "react";

export type DlStatus = "idle" | "running" | "done" | "error";

export interface DlState {
  status: DlStatus;
  pct: number;
  message: string;
  fileId?: string;
  filename?: string;
  error?: string;
}

const POLL_MS = 1500;

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

async function fetchJson<T>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, opts);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error((body as any).error ?? `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

/** Programmatically trigger a browser file download without a visible button. */
function triggerBrowserDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  // Clean up after a short delay to let the click register
  setTimeout(() => document.body.removeChild(a), 1000);
}

export function useVideoDownload() {
  const [state, setState] = useState<DlState>({ status: "idle", pct: 0, message: "" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const start = useCallback(async (
    videoId: string,
    title: string,
    startTime?: string,
    endTime?: string,
  ) => {
    stopPoll();
    const isClip = Boolean(startTime || endTime);
    setState({
      status: "running", pct: 0,
      message: isClip
        ? `Preparing clip ${startTime ?? "0:00"}–${endTime ?? "end"}…`
        : "Starting download…",
    });

    let jobId: string;
    try {
      const { jobId: id } = await fetchJson<{ jobId: string }>(`${BASE}/api/video-download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, title, startTime, endTime }),
      });
      jobId = id;
    } catch (e: any) {
      setState({ status: "error", pct: 0, message: "", error: e.message });
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const data = await fetchJson<DlState & { status: DlStatus }>(`${BASE}/api/video-download/job/${jobId}`);
        if (data.status === "done" || data.status === "error") {
          stopPoll();
          setState({
            status: data.status,
            pct: data.pct,
            message: data.message,
            fileId: data.fileId,
            filename: data.filename,
            error: data.error,
          });
          // Auto-save as soon as the file is ready — no button click required
          if (data.status === "done" && data.fileId && data.filename) {
            const url = `${BASE}/api/video-download/file/${data.fileId}`;
            triggerBrowserDownload(url, data.filename);
          }
        } else {
          setState({
            status: data.status,
            pct: data.pct,
            message: data.message,
            fileId: data.fileId,
            filename: data.filename,
            error: data.error,
          });
        }
      } catch {
        /* ignore transient poll errors */
      }
    }, POLL_MS);
  }, []);

  const reset = useCallback(() => {
    stopPoll();
    setState({ status: "idle", pct: 0, message: "" });
  }, []);

  const downloadUrl = state.fileId ? `${BASE}/api/video-download/file/${state.fileId}` : null;

  return { state, start, reset, downloadUrl };
}
