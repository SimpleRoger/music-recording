import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listBeatListens, markBeatListened } from "@workspace/api-client-react";
import { useCallback } from "react";

const STORAGE_KEY = "tubefeed-listened-beats";
const QUERY_KEY = ["beat-listens"];

// ── localStorage cache (instant, offline-friendly) ──────────────────────────

function loadLocal(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveLocal(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch { /* quota */ }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useListenedBeats() {
  const queryClient = useQueryClient();

  // Server is source of truth; seed initialData from localStorage so the UI
  // never flashes unheard on first render.
  const { data: serverSet } = useQuery<Set<string>>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const ids = await listBeatListens();
      const set = new Set(ids);
      saveLocal(set); // keep local cache in sync
      return set;
    },
    initialData: loadLocal,
    staleTime: 1000 * 60 * 5,
  });

  const listened = serverSet ?? loadLocal();

  const isListened = useCallback((videoId: string) => listened.has(videoId), [listened]);

  return { listened, isListened };
}

// ── Fire-and-forget helper called from beat-player ───────────────────────────
// Updates the local cache immediately and pushes to the server in the background.

let _queryClient: ReturnType<typeof useQueryClient> | null = null;

export function initListenedQueryClient(qc: ReturnType<typeof useQueryClient>) {
  _queryClient = qc;
}

export function markListened(videoId: string) {
  // 1. Update localStorage instantly
  const local = loadLocal();
  if (!local.has(videoId)) {
    local.add(videoId);
    saveLocal(local);

    // 2. Optimistically update React Query cache
    if (_queryClient) {
      _queryClient.setQueryData<Set<string>>(QUERY_KEY, (prev) => {
        const next = new Set(prev ?? local);
        next.add(videoId);
        return next;
      });
    }

    // 3. Persist to server (fire and forget)
    markBeatListened(videoId).catch(() => {/* ignore transient errors */});
  }
}
