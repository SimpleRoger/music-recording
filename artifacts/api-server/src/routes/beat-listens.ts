import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { beatListensTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/beat-listens", async (_req, res) => {
  const rows = await db.select({ videoId: beatListensTable.videoId }).from(beatListensTable);
  res.json(rows.map((r) => r.videoId));
});

router.post("/beat-listens/:videoId", async (req, res) => {
  const { videoId } = req.params;
  if (!videoId) { res.status(400).json({ error: "videoId required" }); return; }
  await db
    .insert(beatListensTable)
    .values({ videoId })
    .onConflictDoUpdate({
      target: beatListensTable.videoId,
      set: { listenedAt: sql`now()` },
    });
  res.status(204).end();
});

export default router;
