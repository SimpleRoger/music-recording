import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const yogaVideosTable = pgTable("yoga_videos", {
  id: serial("id").primaryKey(),
  videoId: text("video_id").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  thumbnailUrl: text("thumbnail_url").notNull(),
  channelId: text("channel_id").notNull(),
  channelName: text("channel_name").notNull(),
  channelThumbnailUrl: text("channel_thumbnail_url"),
  viewCount: text("view_count"),
  duration: text("duration"),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  category: text("category"),
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertYogaVideoSchema = createInsertSchema(yogaVideosTable).omit({
  id: true,
  savedAt: true,
});
export type InsertYogaVideo = z.infer<typeof insertYogaVideoSchema>;
export type YogaVideo = typeof yogaVideosTable.$inferSelect;
