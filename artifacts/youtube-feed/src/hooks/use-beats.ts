import { useQuery } from "@tanstack/react-query";
import { listBeats, getSimilarBeats, searchBeats } from "@workspace/api-client-react";

export type BeatSortOrder = "relevance" | "date" | "viewCount";

export function useBeats(channelId?: number) {
  return useQuery({
    queryKey: ["beats", channelId],
    queryFn: () => listBeats({ channelId }),
    enabled: true,
  });
}

export function useSearchBeats(query: string, order: BeatSortOrder) {
  return useQuery({
    queryKey: ["beats-search", query, order],
    queryFn: () => searchBeats({ q: query, order, maxResults: 10 }),
    enabled: query.trim().length >= 2,
    staleTime: 1000 * 60 * 2,
  });
}

export function useSimilarBeats(videoId: string, title: string, enabled: boolean) {
  return useQuery({
    queryKey: ["similar-beats", videoId],
    queryFn: () => getSimilarBeats(videoId, { title }),
    enabled: enabled && videoId.length > 0,
    staleTime: 1000 * 60 * 10,
  });
}
