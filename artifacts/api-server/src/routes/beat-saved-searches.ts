import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { beatSavedSearchesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/beat-saved-searches", async (_req, res) => {
  const rows = await db
    .select()
    .from(beatSavedSearchesTable)
    .orderBy(beatSavedSearchesTable.createdAt);
  res.json(rows);
});

router.post("/beat-saved-searches", async (req, res) => {
  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  if (!query || query.length > 200) {
    res.status(400).json({ error: "query is required (max 200 chars)" });
    return;
  }
  try {
    const [row] = await db
      .insert(beatSavedSearchesTable)
      .values({ query })
      .returning();
    res.status(201).json(row);
  } catch (err: unknown) {
    const pg = err as { code?: string };
    if (pg.code === "23505") {
      res.status(409).json({ error: "Search already saved" });
      return;
    }
    throw err;
  }
});

router.delete("/beat-saved-searches/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const deleted = await db
    .delete(beatSavedSearchesTable)
    .where(eq(beatSavedSearchesTable.id, id))
    .returning();
  if (deleted.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).end();
});

export default router;
