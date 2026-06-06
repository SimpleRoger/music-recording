import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listRecordings, deleteRecording, createRecording } from "@workspace/api-client-react";
import type { CreateRecordingBody } from "@workspace/api-client-react";

export function useRecordings() {
  return useQuery({
    queryKey: ["recordings"],
    queryFn: () => listRecordings(),
    staleTime: 0,
  });
}

export function useDeleteRecording() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteRecording({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recordings"] }),
  });
}

interface UploadRecordingArgs {
  blob: Blob;
  mime: string;
  meta: CreateRecordingBody;
  takeNumber?: number;
}

export function useUploadRecording() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ blob, mime, meta, takeNumber = 1 }: UploadRecordingArgs) => {
      const name = encodeURIComponent(`${meta.beatTitle}-take-${takeNumber}`);

      // Upload blob directly to the API server (no signed URL needed)
      const uploadRes = await fetch(`/api/storage/uploads?name=${name}`, {
        method: "POST",
        headers: { "Content-Type": mime },
        body: blob,
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Upload failed");
      }
      const { objectPath } = await uploadRes.json() as { objectPath: string };

      return createRecording({ ...meta, objectPath });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recordings"] }),
  });
}
