import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, channelsTable } from "@workspace/db";
import { ListVideosQueryParams, ListVideosResponse } from "@workspace/api-zod";
import { fetchRecentVideos, fetchPopularVideos, getApiKey } from "../lib/youtube";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

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

// ── General video search ──────────────────────────────────────────────────────
// Returns results shaped like Video[] so the frontend can reuse VideoCard / VideoPlayerModal
router.get("/videos/search", async (req, res): Promise<void> => {
  if (process.env.YOUTUBE_SEARCH_DISABLED === "true") {
    res.status(503).json({ error: "Search is temporarily disabled", disabled: true });
    return;
  }

  const q = String(req.query.q ?? "").trim();
  if (!q) { res.status(400).json({ error: "q is required" }); return; }

  const maxResults = Math.min(Number(req.query.maxResults ?? 20), 50);
  const apiKey = getApiKey();

  // Search — request extra results because we'll filter out Shorts (<= 60s)
  const fetchCount = Math.min(maxResults * 2, 50);
  const searchUrl =
    `${YOUTUBE_API_BASE}/search?part=snippet&type=video&q=${encodeURIComponent(q)}` +
    `&maxResults=${fetchCount}&key=${apiKey}`;
  const searchResp = await fetch(searchUrl);
  if (!searchResp.ok) {
    res.status(502).json({ error: `YouTube API error: ${searchResp.status}` });
    return;
  }
  const searchData = (await searchResp.json()) as {
    items?: Array<{
      id: { videoId: string };
      snippet: {
        title: string;
        channelId: string;
        channelTitle: string;
        description: string;
        publishedAt: string;
        thumbnails?: { medium?: { url: string }; default?: { url: string } };
      };
    }>;
  };

  if (!searchData.items?.length) { res.json([]); return; }

  // Fetch duration + view count in one batch
  const ids = searchData.items.map((i) => i.id.videoId).join(",");
  const detailUrl =
    `${YOUTUBE_API_BASE}/videos?part=contentDetails,statistics&id=${encodeURIComponent(ids)}&key=${apiKey}`;
  const detailMap = new Map<string, { duration: string | null; viewCount: string | null }>();

  const detailResp = await fetch(detailUrl);
  if (detailResp.ok) {
    const detailData = (await detailResp.json()) as {
      items?: Array<{ id: string; contentDetails: { duration: string }; statistics: { viewCount: string } }>;
    };
    for (const item of detailData.items ?? []) {
      detailMap.set(item.id, {
        duration: item.contentDetails?.duration ?? null,
        viewCount: item.statistics?.viewCount ?? null,
      });
    }
  }

  // Parse ISO 8601 duration (PT1M30S → 90 seconds)
  function parseDurationSec(iso: string | null | undefined): number {
    if (!iso) return Infinity; // unknown duration → keep it
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return Infinity;
    return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
  }

  const results = searchData.items
    .map((item) => {
      const d = detailMap.get(item.id.videoId);
      return {
        videoId: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description ?? "",
        thumbnailUrl:
          item.snippet.thumbnails?.medium?.url ??
          item.snippet.thumbnails?.default?.url ??
          `https://i.ytimg.com/vi/${item.id.videoId}/mqdefault.jpg`,
        publishedAt: item.snippet.publishedAt ?? "",
        channelId: item.snippet.channelId ?? "",
        channelName: item.snippet.channelTitle ?? "",
        channelThumbnailUrl: null,
        duration: d?.duration ?? null,
        viewCount: d?.viewCount ?? null,
      };
    })
    // Filter out Shorts (≤ 60 seconds)
    .filter((v) => parseDurationSec(v.duration) > 60)
    .slice(0, maxResults);

  res.json(results);
});

export default router;
