import { useState, useCallback, useRef } from "react";
import type { Video } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type SearchState =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | { status: "done"; query: string; results: Video[] }
  | { status: "error"; query: string; error: string };

export function useVideoSearch() {
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) { setState({ status: "idle" }); return; }

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ status: "loading", query: q });

    try {
      const url = `${BASE}/api/videos/search?q=${encodeURIComponent(q)}`;
      const resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok) throw new Error(`Search failed: ${resp.status}`);
      const results: Video[] = await resp.json();
      setState({ status: "done", query: q, results });
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setState({ status: "error", query: q, error: e.message ?? "Search failed" });
    }
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setState({ status: "idle" });
  }, []);

  return { state, search, clear };
}
