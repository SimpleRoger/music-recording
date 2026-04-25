import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const extractedBeatsTable = pgTable("extracted_beats", {
  id: serial("id").primaryKey(),
  videoId: text("video_id").notNull().unique(),
  title: text("title").notNull(),
  thumbnailUrl: text("thumbnail_url").notNull().default(""),
  channelName: text("channel_name").notNull().default(""),
  objectPath: text("object_path").notNull(),
  durationSeconds: integer("duration_seconds").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ExtractedBeat = typeof extractedBeatsTable.$inferSelect;
export type NewExtractedBeat = typeof extractedBeatsTable.$inferInsert;
