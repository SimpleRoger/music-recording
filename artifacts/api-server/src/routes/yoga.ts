import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, yogaVideosTable } from "@workspace/db";
import { fetchVideoById } from "../lib/youtube";

const router: IRouter = Router();

function parseVideoId(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.hostname === "youtu.be") return url.pathname.slice(1).split("?")[0] || null;
    if (url.hostname.includes("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v) return v;
      const shorts = url.pathname.match(/\/shorts\/([A-Za-z0-9_-]+)/);
      if (shorts) return shorts[1];
      const embed = url.pathname.match(/\/embed\/([A-Za-z0-9_-]+)/);
      if (embed) return embed[1];
    }
  } catch {
    if (/^[A-Za-z0-9_-]{11}$/.test(input.trim())) return input.trim();
  }
  return null;
}

router.get("/yoga", async (req, res): Promise<void> => {
  const { category } = req.query as { category?: string };
  let query = db.select().from(yogaVideosTable).orderBy(desc(yogaVideosTable.savedAt));
  const videos = category
    ? await db.select().from(yogaVideosTable).where(eq(yogaVideosTable.category, category)).orderBy(desc(yogaVideosTable.savedAt))
    : await query;
  res.json(videos);
});

router.post("/yoga", async (req, res): Promise<void> => {
  const { url, category } = req.body as { url?: string; category?: string };
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "url is required" });
    return;
  }
  const videoId = parseVideoId(url.trim());
  if (!videoId) {
    res.status(400).json({ error: "Could not extract a YouTube video ID from that URL" });
    return;
  }
  const existing = await db.select().from(yogaVideosTable).where(eq(yogaVideosTable.videoId, videoId));
  if (existing.length > 0) {
    // Update category if provided
    if (category !== undefined) {
      const [updated] = await db
        .update(yogaVideosTable)
        .set({ category: category || null })
        .where(eq(yogaVideosTable.videoId, videoId))
        .returning();
      res.json(updated);
    } else {
      res.json(existing[0]);
    }
    return;
  }
  const video = await fetchVideoById(videoId);
  if (!video) {
    res.status(404).json({ error: "Video not found on YouTube" });
    return;
  }
  const [inserted] = await db
    .insert(yogaVideosTable)
    .values({
      videoId: video.videoId,
      title: video.title,
      description: video.description,
      thumbnailUrl: video.thumbnailUrl,
      channelId: video.channelId,
      channelName: video.channelName,
      channelThumbnailUrl: video.channelThumbnailUrl,
      viewCount: video.viewCount,
      duration: video.duration,
      publishedAt: video.publishedAt,
      category: category || null,
    })
    .returning();
  res.status(201).json(inserted);
});

router.patch("/yoga/:videoId", async (req, res): Promise<void> => {
  const { videoId } = req.params;
  const { category } = req.body as { category?: string | null };
  const [updated] = await db
    .update(yogaVideosTable)
    .set({ category: category ?? null })
    .where(eq(yogaVideosTable.videoId, videoId))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/yoga/:videoId", async (req, res): Promise<void> => {
  const { videoId } = req.params;
  await db.delete(yogaVideosTable).where(eq(yogaVideosTable.videoId, videoId));
  res.status(204).send();
});

export default router;
