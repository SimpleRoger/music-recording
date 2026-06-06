import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const beatListensTable = pgTable("beat_listens", {
  id: serial("id").primaryKey(),
  videoId: text("video_id").notNull().unique(),
  listenedAt: timestamp("listened_at").defaultNow().notNull(),
});

export type BeatListen = typeof beatListensTable.$inferSelect;
