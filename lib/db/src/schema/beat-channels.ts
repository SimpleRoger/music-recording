import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const beatChannelsTable = pgTable("beat_channels", {
  id: serial("id").primaryKey(),
  youtubeChannelId: text("youtube_channel_id").notNull().unique(),
  name: text("name").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

export const insertBeatChannelSchema = createInsertSchema(beatChannelsTable).omit({ id: true, addedAt: true });
export type InsertBeatChannel = z.infer<typeof insertBeatChannelSchema>;
export type BeatChannel = typeof beatChannelsTable.$inferSelect;
