import { useState } from "react";
import { Link } from "wouter";
import { Bookmark, FolderOpen, Music2, FileText, Mic, Plus, Trash2, ExternalLink, Loader2, AlertCircle, Wand2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSavedVideos,
  useSaveVideo,
  useRemoveSavedVideo,
  getListSavedVideosQueryKey,
  type SavedVideoItem,
} from "@workspace/api-client-react";
import type { Video } from "@workspace/api-client-react";
import { VideoPlayerModal } from "../components/video-player-modal";
import { formatViews, formatDuration } from "../lib/utils";
import { cn } from "../lib/utils";

function savedToVideo(s: SavedVideoItem): Video {
  return {
    videoId: s.videoId,
    title: s.title,
    description: s.description,
    thumbnailUrl: s.thumbnailUrl,
    publishedAt: s.publishedAt,
    viewCount: s.viewCount,
    channelId: s.channelId,
    channelName: s.channelName,
    channelThumbnailUrl: s.channelThumbnailUrl,
    duration: s.duration,
  };
}

function AddVideoModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const saveVideo = useSaveVideo({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSavedVideosQueryKey() });
        setUrl("");
        setError(null);
        onClose();
      },
      onError: (err: unknown) => {
        const msg =
          err && typeof err === "object" && "error" in err
            ? String((err as { error: unknown }).error)
            : err instanceof Error
            ? err.message
            : "Failed to save video";
        setError(msg);
      },
    },
  });

  const handleSave = () => {
    const trimmed = url.trim();
    if (!trimmed) { setError("Please paste a YouTube URL"); return; }
    setError(null);
    saveVideo.mutate({ url: trimmed });
  };

  const handleClose = () => { setUrl(""); setError(null); onClose(); };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="relative z-10 w-full max-w-md bg-surface border border-border rounded-2xl p-6 flex flex-col gap-5 shadow-2xl"
          >
            <div>
              <h2 className="text-text-main font-bold text-lg">Save a Video</h2>
              <p className="text-text-muted text-sm mt-1">Paste any YouTube link to add it to your collection</p>
            </div>

            <div className="flex flex-col gap-2">
              <input
                type="url"
                autoFocus
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                placeholder="https://youtube.com/watch?v=..."
                className={cn(
                  "w-full bg-background border rounded-xl px-4 py-3 text-text-main text-sm placeholder:text-text-muted/60 outline-none focus:border-primary transition-colors",
                  error ? "border-red-500/60" : "border-border"
                )}
              />
              {error && (
                <div className="flex items-center gap-2 text-red-400 text-xs">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {error}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 py-2.5 rounded-xl border border-border text-text-muted hover:text-text-main hover:bg-surface-hover text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saveVideo.isPending}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-bold transition-all disabled:opacity-70 shadow-lg shadow-primary/20"
              >
                {saveVideo.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bookmark className="w-4 h-4" />}
                {saveVideo.isPending ? "Saving…" : "Save Video"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function SavedCard({ item, onPlay, onDelete }: { item: SavedVideoItem; onPlay: (v: Video) => void; onDelete: (id: string) => void }) {
  const duration = formatDuration(item.duration);
  const views = item.viewCount ? formatViews(item.viewCount) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="group flex gap-3 bg-surface border border-border rounded-xl p-3 hover:border-border-hover transition-colors cursor-pointer"
      onClick={() => onPlay(savedToVideo(item))}
    >
      <div className="relative w-36 h-20 shrink-0 rounded-lg overflow-hidden bg-black">
        <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" />
        {duration && (
          <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
            {duration}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1 py-0.5">
        <p className="text-text-main text-sm font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {item.title}
        </p>
        <p className="text-text-muted text-xs truncate">{item.channelName}</p>
        {views && <p className="text-text-muted text-xs">{views} views</p>}
      </div>

      <div className="flex flex-col items-center justify-center gap-2 pl-1 shrink-0">
        <a
          href={`https://youtube.com/watch?v=${item.videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="p-1.5 text-text-muted hover:text-primary rounded-lg hover:bg-surface-hover transition-colors"
          title="Open on YouTube"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(item.videoId); }}
          className="p-1.5 text-text-muted hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
          title="Remove"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

export default function Saved() {
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [activeVideo, setActiveVideo] = useState<Video | null>(null);

  const { data: saved = [], isLoading } = useListSavedVideos();

  const remove = useRemoveSavedVideo({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSavedVideosQueryKey() }),
    },
  });

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      {/* Topbar */}
      <header className="h-16 border-b border-border glass-panel sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <img
              src={`${import.meta.env.BASE_URL}images/logo.png`}
              className="w-9 h-9 rounded-xl shadow-lg"
              alt="Logo"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <h1 className="font-display font-bold text-xl sm:text-2xl tracking-tight text-white flex items-center">
              Tube<span className="text-primary ml-0.5">Feed</span>
            </h1>
          </div>
          <nav className="flex items-center gap-1 bg-surface/60 border border-border rounded-xl px-1.5 py-1">
            <Link href="/">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer">
                <FolderOpen className="w-3.5 h-3.5" />Projects
              </span>
            </Link>
            <Link href="/beats">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer">
                <Music2 className="w-3.5 h-3.5" />Beats
              </span>
            </Link>
            <Link href="/lyrics">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer">
                <FileText className="w-3.5 h-3.5" />Lyrics
              </span>
            </Link>
            <Link href="/recordings">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer">
                <Mic className="w-3.5 h-3.5" />Recordings
              </span>
            </Link>
            <Link href="/extractor">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer">
                <Wand2 className="w-3.5 h-3.5" />Extractor
              </span>
            </Link>
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-semibold bg-primary/15 text-primary border border-primary/20">
              <Bookmark className="w-3.5 h-3.5" />Saved
            </span>
          </nav>
        </div>

        <button
          onClick={() => setIsAddOpen(true)}
          className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg font-medium text-sm transition-all shadow-[0_0_15px_rgba(255,0,0,0.3)] hover:shadow-[0_0_20px_rgba(255,0,0,0.5)] flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Save Video</span>
        </button>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-display font-bold text-text-main">Saved Videos</h2>
            {saved.length > 0 && (
              <p className="text-text-muted text-sm mt-0.5">{saved.length} video{saved.length !== 1 ? "s" : ""} saved</p>
            )}
          </div>
          <button
            onClick={() => setIsAddOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-surface border border-border hover:border-border-hover rounded-xl text-sm font-medium text-text-muted hover:text-text-main transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add URL
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : saved.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="w-20 h-20 rounded-full bg-surface border border-border flex items-center justify-center mb-5">
              <Bookmark className="w-9 h-9 text-border-hover" />
            </div>
            <h3 className="text-xl font-display font-bold text-text-main mb-2">No saved videos yet</h3>
            <p className="text-text-muted text-sm max-w-xs mb-6 leading-relaxed">
              Paste any YouTube link to save it here for easy access and in-app playback.
            </p>
            <button
              onClick={() => setIsAddOpen(true)}
              className="px-6 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-primary/20 flex items-center gap-2"
            >
              <Bookmark className="w-4 h-4" />
              Save Your First Video
            </button>
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="flex flex-col gap-3">
              {saved.map((item) => (
                <SavedCard
                  key={item.videoId}
                  item={item}
                  onPlay={setActiveVideo}
                  onDelete={(videoId) => remove.mutate({ videoId })}
                />
              ))}
            </div>
          </AnimatePresence>
        )}
      </main>

      <AddVideoModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />
      <VideoPlayerModal video={activeVideo} onClose={() => setActiveVideo(null)} />
    </div>
  );
}
