import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const recordingsTable = pgTable("recordings", {
  id: serial("id").primaryKey(),
  beatVideoId: text("beat_video_id").notNull(),
  beatTitle: text("beat_title").notNull(),
  beatChannelName: text("beat_channel_name").notNull(),
  beatThumbnailUrl: text("beat_thumbnail_url").notNull(),
  objectPath: text("object_path").notNull(),
  durationSeconds: integer("duration_seconds").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Recording = typeof recordingsTable.$inferSelect;
export type NewRecording = typeof recordingsTable.$inferInsert;
