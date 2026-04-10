import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, channelsTable } from "@workspace/db";
import { ListVideosQueryParams, ListVideosResponse } from "@workspace/api-zod";
import { fetchRecentVideos, fetchPopularVideos } from "../lib/youtube";

const router: IRouter = Router();

router.get("/videos", async (req, res): Promise<void> => {
  const queryParsed = ListVideosQueryParams.safeParse(req.query);
  if (!queryParsed.success) {
    res.status(400).json({ error: queryParsed.error.message });
    return;
  }

  const { channelId: filterChannelId, order } = queryParsed.data;

  let channels;
  if (filterChannelId != null) {
    channels = await db
      .select()
      .from(channelsTable)
      .where(eq(channelsTable.id, filterChannelId));
  } else {
    channels = await db.select().from(channelsTable);
  }

  if (channels.length === 0) {
    res.json([]);
    return;
  }

  const fetchFn = order === "popular" ? fetchPopularVideos : fetchRecentVideos;

  const videoArrays = await Promise.all(
    channels.map((ch) =>
      fetchFn(ch.youtubeChannelId, ch.name, ch.thumbnailUrl ?? null)
    )
  );

  const allVideos = videoArrays.flat();
  if (order === "popular") {
    allVideos.sort(
      (a, b) => Number(b.viewCount ?? 0) - Number(a.viewCount ?? 0)
    );
  } else {
    allVideos.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  }

  res.json(ListVideosResponse.parse(allVideos));
});

export default router;
