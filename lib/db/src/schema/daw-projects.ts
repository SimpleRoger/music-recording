import { pgTable, serial, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export type DawLaneSave = {
  id: number;
  name: string;
  color: string;
  muted: boolean;
  volume: number;
  startOffset: number;
  durationSec: number;
  objectPath: string | null; // null if lane was never recorded
  mime: string;
};

export const dawProjectsTable = pgTable("daw_projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  beatVideoId: text("beat_video_id").notNull(),
  beatTitle: text("beat_title").notNull(),
  beatChannelName: text("beat_channel_name").notNull(),
  beatThumbnailUrl: text("beat_thumbnail_url").notNull(),
  lanes: jsonb("lanes").notNull().$type<DawLaneSave[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type DawProject = typeof dawProjectsTable.$inferSelect;
export type NewDawProject = typeof dawProjectsTable.$inferInsert;
