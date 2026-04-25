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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
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
      return new Promise<ExtractedBeat>((resolve, reject) => {
        fetch(`/api/extracted-beats`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoId: song.videoId,
            title: song.title,
            thumbnailUrl: song.thumbnailUrl,
            channelName: song.channelName,
          }),
        })
          .then((res) => {
            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            const process = (): Promise<void> =>
              reader.read().then(({ done, value }) => {
                if (done) { reject(new Error("Stream ended unexpectedly")); return; }
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop()!;

                let evt = "";
                for (const line of lines) {
                  if (line.startsWith("event: ")) { evt = line.slice(7).trim(); }
                  else if (line.startsWith("data: ")) {
                    const data = JSON.parse(line.slice(6));
                    if (evt === "progress") onProgress(data as ExtractionProgress);
                    else if (evt === "done") { resolve(data as ExtractedBeat); return; }
                    else if (evt === "error") { reject(new Error(data.message)); return; }
                  }
                }
                return process();
              });

            return process();
          })
          .catch(reject);
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["extracted-beats"] }),
  });
}
