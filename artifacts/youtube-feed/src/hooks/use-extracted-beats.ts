import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ExtractedBeat {
  id: number;
  videoId: string;
  title: string;
  thumbnailUrl: string;
  channelName: string;
  objectPath: string;
  durationSeconds: number;
  createdAt: string;
}

export interface SongSearchResult {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  channelName: string;
  duration: string | null;
  viewCount: string | null;
}

export interface ExtractionProgress {
  step: "download" | "extract" | "upload";
  message: string;
  pct?: number;
}

async function fetchJson<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export function useExtractedBeats() {
  return useQuery({
    queryKey: ["extracted-beats"],
    queryFn: () => fetchJson<ExtractedBeat[]>(`/api/extracted-beats`),
    staleTime: 0,
  });
}

export function useDeleteExtractedBeat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/extracted-beats/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["extracted-beats"] }),
  });
}

export function useSearchSongs(query: string) {
  return useQuery({
    queryKey: ["song-search", query],
    queryFn: () => fetchJson<SongSearchResult[]>(`/api/search-songs?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length >= 2,
    staleTime: 60_000,
  });
}

export function useExtractBeat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      song,
      onProgress,
    }: {
      song: SongSearchResult;
      onProgress: (p: ExtractionProgress) => void;
    }) => {
      return new Promise<ExtractedBeat>(async (resolve, reject) => {
        try {
          // Step 1: POST to start job — returns immediately with jobId or cached result
          const start = await fetchJson<{ jobId?: string; cached?: boolean; result?: ExtractedBeat }>(
            "/api/extracted-beats",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                videoId: song.videoId,
                title: song.title,
                thumbnailUrl: song.thumbnailUrl,
                channelName: song.channelName,
              }),
            }
          );

          // Cached result — done immediately
          if (start.cached && start.result) {
            resolve(start.result);
            return;
          }

          if (!start.jobId) {
            reject(new Error("Server did not return a job ID"));
            return;
          }

          // Step 2: Poll GET /api/extracted-beats/job/:jobId every 1.5s
          const POLL_INTERVAL = 1500;
          const MAX_POLLS = 400; // ~10 minutes max
          let polls = 0;

          const poll = async () => {
            polls++;
            if (polls > MAX_POLLS) {
              reject(new Error("Extraction timed out after 10 minutes"));
              return;
            }

            try {
              const status = await fetchJson<{
                status: "running" | "done" | "error";
                step: ExtractionProgress["step"];
                message: string;
                pct: number;
                result?: ExtractedBeat;
                error?: string;
              }>(`/api/extracted-beats/job/${start.jobId}`);

              // Forward progress to UI
              onProgress({ step: status.step, message: status.message, pct: status.pct });

              if (status.status === "done" && status.result) {
                resolve(status.result);
              } else if (status.status === "error") {
                reject(new Error(status.error ?? "Extraction failed"));
              } else {
                // Still running — poll again
                setTimeout(poll, POLL_INTERVAL);
              }
            } catch (err: any) {
              // Network error during poll — retry a few times
              if (polls < 5) {
                setTimeout(poll, POLL_INTERVAL * 2);
              } else {
                reject(err);
              }
            }
          };

          // Start polling after a short delay to let the job begin
          setTimeout(poll, 800);
        } catch (err: any) {
          reject(err);
        }
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["extracted-beats"] }),
  });
}
