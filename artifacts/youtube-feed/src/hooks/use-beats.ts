import { useQuery } from "@tanstack/react-query";
import { listBeats, getSimilarBeats } from "@workspace/api-client-react";

export function useBeats(channelId?: number) {
  return useQuery({
    queryKey: ["beats", channelId],
    queryFn: () => listBeats({ channelId }),
    enabled: true,
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
