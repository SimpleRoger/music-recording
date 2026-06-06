import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const beatSavedSearchesTable = pgTable("beat_saved_searches", {
  id: serial("id").primaryKey(),
  query: text("query").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBeatSavedSearchSchema = createInsertSchema(beatSavedSearchesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertBeatSavedSearch = z.infer<typeof insertBeatSavedSearchSchema>;
export type BeatSavedSearch = typeof beatSavedSearchesTable.$inferSelect;
