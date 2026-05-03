import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, dawProjectsTable } from "@workspace/db";
import { CreateDawProjectBody } from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();

router.get("/daw/projects", async (_req, res): Promise<void> => {
  const projects = await db
    .select()
    .from(dawProjectsTable)
    .orderBy(desc(dawProjectsTable.createdAt));
  res.json(projects);
});

router.get("/daw/projects/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [project] = await db.select().from(dawProjectsTable).where(eq(dawProjectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  res.json(project);
});

router.post("/daw/projects", async (req, res): Promise<void> => {
  const parsed = CreateDawProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const lanes = data.lanes.map((l) => ({
    id: l.id,
    name: l.name,
    color: l.color,
    muted: l.muted,
    volume: l.volume,
    startOffset: l.startOffset,
    durationSec: l.durationSec,
    objectPath: l.objectPath ?? null,
    mime: l.mime,
  }));
  const [created] = await db
    .insert(dawProjectsTable)
    .values({ ...data, lanes })
    .returning();
  res.status(201).json(created);
});

router.delete("/daw/projects/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(dawProjectsTable).where(eq(dawProjectsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Project not found" }); return; }

  for (const lane of existing.lanes) {
    if (lane.objectPath) {
      try {
        const file = await storage.getObjectEntityFile(lane.objectPath);
        await file.delete();
      } catch (err) {
        req.log?.warn({ err, objectPath: lane.objectPath }, "Could not delete GCS lane object");
      }
    }
  }

  await db.delete(dawProjectsTable).where(eq(dawProjectsTable.id, id));
  res.status(204).send();
});

export default router;
