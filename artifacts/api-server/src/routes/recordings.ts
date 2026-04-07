import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, recordingsTable } from "@workspace/db";
import { CreateRecordingBody, DeleteRecordingParams } from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();

router.get("/recordings", async (_req, res): Promise<void> => {
  const recordings = await db
    .select()
    .from(recordingsTable)
    .orderBy(desc(recordingsTable.createdAt));
  res.json(recordings);
});

router.post("/recordings", async (req, res): Promise<void> => {
  const parsed = CreateRecordingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [created] = await db
    .insert(recordingsTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(created);
});

router.delete("/recordings/:id", async (req, res): Promise<void> => {
  const parsed = DeleteRecordingParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid recording id" });
    return;
  }
  const [existing] = await db
    .select()
    .from(recordingsTable)
    .where(eq(recordingsTable.id, parsed.data.id));

  if (!existing) {
    res.status(404).json({ error: "Recording not found" });
    return;
  }

  // Best-effort GCS object deletion
  try {
    const file = await storage.getObjectEntityFile(existing.objectPath);
    await file.delete();
  } catch (err) {
    req.log?.warn({ err, objectPath: existing.objectPath }, "Could not delete GCS object");
  }

  await db.delete(recordingsTable).where(eq(recordingsTable.id, parsed.data.id));
  res.status(204).send();
});

export default router;
