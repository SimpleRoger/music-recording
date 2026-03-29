import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, Sparkles, Loader2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Video } from "@workspace/api-client-react";
import { formatViews, formatDuration } from "../lib/utils";

interface VideoPlayerModalProps {
  video: Video | null;
  onClose: () => void;
}

export function VideoPlayerModal({ video, onClose }: VideoPlayerModalProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);

  const isOpen = video !== null;

  // Reset when video changes
  useEffect(() => {
    setSummary(null);
    setSummaryError(null);
    setDescExpanded(false);
  }, [video?.videoId]);

  // Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // Prevent body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const generateSummary = useCallback(async () => {
    if (!video) return;
    setIsSummaryLoading(true);
    setSummaryError(null);
    try {
      const resp = await fetch("/api/videos/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: video.videoId,
          title: video.title,
          description: video.description,
          channelName: video.channelName,
        }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate summary");
      }
      const data = await resp.json();
      setSummary(data.summary);
    } catch (err: any) {
      setSummaryError(err.message || "Something went wrong");
    } finally {
      setIsSummaryLoading(false);
    }
  }, [video]);

  if (!video) return null;

  const publishedDate = new Date(video.publishedAt);
  const relativeDate = isNaN(publishedDate.getTime())
    ? ""
    : formatDistanceToNow(publishedDate, { addSuffix: true });
  const duration = formatDuration(video.duration);
  const shortDesc = video.description?.slice(0, 280);
  const hasMoreDesc = (video.description?.length ?? 0) > 280;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 12 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="relative z-10 w-full max-w-5xl max-h-[92vh] flex flex-col lg:flex-row bg-surface border border-border rounded-2xl overflow-hidden shadow-[0_32px_80px_-16px_rgba(0,0,0,0.7)]"
          >
            {/* Close */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 z-20 p-1.5 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/80 transition-colors backdrop-blur-sm"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Left — Player */}
            <div className="flex flex-col w-full lg:w-[60%] shrink-0">
              {/* iframe */}
              <div className="relative w-full aspect-video bg-black">
                <iframe
                  src={`https://www.youtube.com/embed/${video.videoId}?autoplay=1&rel=0`}
                  title={video.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                />
              </div>

              {/* Video meta below player */}
              <div className="p-4 border-b border-border lg:border-b-0 lg:border-r flex-1 overflow-y-auto">
                <h2 className="text-text-main font-bold text-base sm:text-lg leading-snug mb-3">
                  {video.title}
                </h2>

                <div className="flex items-center gap-3 mb-3">
                  {video.channelThumbnailUrl ? (
                    <img
                      src={video.channelThumbnailUrl}
                      alt={video.channelName}
                      className="w-8 h-8 rounded-full object-cover border border-border shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center text-xs font-bold text-text-muted border border-border shrink-0">
                      {video.channelName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-main truncate">{video.channelName}</p>
                    <div className="flex items-center gap-1.5 text-xs text-text-muted">
                      {video.viewCount && <span>{formatViews(video.viewCount)} views</span>}
                      {video.viewCount && <span>·</span>}
                      <span>{relativeDate}</span>
                      {duration && <><span>·</span><span>{duration}</span></>}
                    </div>
                  </div>
                </div>

                {/* Description */}
                {video.description && (
                  <div className="text-xs text-text-muted leading-relaxed bg-background rounded-xl p-3">
                    <p className="whitespace-pre-line">
                      {descExpanded ? video.description : shortDesc}
                      {!descExpanded && hasMoreDesc && "..."}
                    </p>
                    {hasMoreDesc && (
                      <button
                        onClick={() => setDescExpanded((p) => !p)}
                        className="mt-1.5 flex items-center gap-1 text-primary hover:text-primary/80 transition-colors font-medium text-xs"
                      >
                        {descExpanded ? (
                          <><ChevronUp className="w-3 h-3" /> Show less</>
                        ) : (
                          <><ChevronDown className="w-3 h-3" /> Show more</>
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* Open on YouTube */}
                <a
                  href={`https://youtube.com/watch?v=${video.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-primary transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open on YouTube
                </a>
              </div>
            </div>

            {/* Right — AI Summary */}
            <div className="flex flex-col w-full lg:w-[40%] p-5 overflow-y-auto">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                </div>
                <h3 className="font-bold text-text-main text-sm">AI Summary</h3>
              </div>

              {/* Not yet generated */}
              {!summary && !isSummaryLoading && !summaryError && (
                <div className="flex flex-col items-center justify-center flex-1 text-center py-8">
                  <div className="w-14 h-14 rounded-full bg-primary/5 border border-primary/10 flex items-center justify-center mb-4">
                    <Sparkles className="w-6 h-6 text-primary/40" />
                  </div>
                  <p className="text-text-muted text-sm mb-5 max-w-xs leading-relaxed">
                    Get a quick AI-written overview of what this video covers, without watching the whole thing first.
                  </p>
                  <button
                    onClick={generateSummary}
                    className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-primary/20 flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Generate Summary
                  </button>
                </div>
              )}

              {/* Loading */}
              {isSummaryLoading && (
                <div className="flex flex-col items-center justify-center flex-1 gap-3 py-8">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-text-muted text-sm">Generating summary...</p>
                </div>
              )}

              {/* Error */}
              {summaryError && !isSummaryLoading && (
                <div className="flex flex-col items-center text-center py-6 flex-1">
                  <AlertCircle className="w-7 h-7 text-red-400 mb-3" />
                  <p className="text-red-400 text-sm mb-4">{summaryError}</p>
                  <button
                    onClick={generateSummary}
                    className="px-4 py-2 bg-surface-hover hover:bg-border rounded-xl text-sm font-medium transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {/* Summary text */}
              {summary && !isSummaryLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col gap-4 flex-1"
                >
                  <div className="bg-background rounded-xl p-4 border border-border">
                    <p className="text-text-main text-sm leading-relaxed">{summary}</p>
                  </div>
                  <button
                    onClick={generateSummary}
                    className="self-start flex items-center gap-1.5 text-xs text-text-muted hover:text-primary transition-colors"
                  >
                    <Sparkles className="w-3 h-3" />
                    Regenerate
                  </button>
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
