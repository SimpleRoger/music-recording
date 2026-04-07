import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listBeatChannels, addBeatChannel, removeBeatChannel } from "@workspace/api-client-react";

export function useBeatChannels() {
  return useQuery({ queryKey: ["beat-channels"], queryFn: () => listBeatChannels() });
}

export function useAddBeatChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (youtubeChannelId: string) => addBeatChannel({ youtubeChannelId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["beat-channels"] }),
  });
}

export function useRemoveBeatChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => removeBeatChannel({ id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beat-channels"] });
      qc.invalidateQueries({ queryKey: ["beats"] });
    },
  });
}
