import { pgTable, text, serial, timestamp, jsonb } from "drizzle-orm/pg-core";

export const videoAnalysesTable = pgTable("video_analyses", {
  id: serial("id").primaryKey(),
  videoId: text("video_id").notNull().unique(),
  structured: jsonb("structured").notNull(),
  transcriptUsed: text("transcript_used").notNull().default("false"),
  transcriptFailReason: text("transcript_fail_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VideoAnalysis = typeof videoAnalysesTable.$inferSelect;
