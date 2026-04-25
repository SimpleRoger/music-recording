import { useState, useEffect, useRef, useCallback } from "react";
import { X, Mic2, Search, ChevronUp, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface KaraokeEntry {
  id: string;
  title: string;
  artist: string;
  syncedLyrics: string;
  beatVideoId?: string;
}

interface KaraokePlayerProps {
  entry: KaraokeEntry;
  onClose: () => void;
}

// ── LRC parser ────────────────────────────────────────────────────────────────
interface LrcLine {
  time: number;
  text: string;
}

function parseLrc(lrc: string): LrcLine[] {
  return lrc
    .split("\n")
    .map((line) => {
      const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
      if (!m) return null;
      return { time: parseInt(m[1]) * 60 + parseFloat(m[2]), text: m[3].trim() };
    })
    .filter(Boolean) as LrcLine[];
}

// ── YouTube ID extractor ──────────────────────────────────────────────────────
function extractVideoId(input: string): string {
  input = input.trim();
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = input.match(p);
    if (m) return m[1];
  }
  return input;
}

// ── Global YT API loader ──────────────────────────────────────────────────────
let ytApiLoading = false;
let ytApiReady = false;
const ytReadyCallbacks: (() => void)[] = [];

function loadYouTubeApi(onReady: () => void) {
  if (ytApiReady) { onReady(); return; }
  ytReadyCallbacks.push(onReady);
  if (ytApiLoading) return;
  ytApiLoading = true;
  (window as any).onYouTubeIframeAPIReady = () => {
    ytApiReady = true;
    ytReadyCallbacks.forEach((cb) => cb());
    ytReadyCallbacks.length = 0;
  };
  const s = document.createElement("script");
  s.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(s);
}

// ── Karaoke lyrics display ────────────────────────────────────────────────────
function LyricsDisplay({ lines, currentIndex }: { lines: LrcLine[]; currentIndex: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentIndex]);

  if (lines.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        No lyrics to display
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-y-auto px-6 py-8 scroll-smooth">
      <div className="min-h-full flex flex-col justify-center gap-1">
        {/* Spacer so first line can center */}
        <div className="h-[30vh] shrink-0" />

        {lines.map((line, i) => {
          const isCurrent = i === currentIndex;
          const isPast = i < currentIndex;
          const isNear = Math.abs(i - currentIndex) <= 2;

          return (
            <div
              key={i}
              ref={isCurrent ? activeRef : undefined}
              className="text-center transition-all duration-300 select-none"
              style={{
                transform: isCurrent ? "scale(1.08)" : "scale(1)",
                transformOrigin: "center",
              }}
            >
              {line.text ? (
                <span
                  className={`block font-display font-bold leading-snug transition-all duration-300 ${
                    isCurrent
                      ? "text-white text-2xl sm:text-3xl drop-shadow-[0_0_20px_rgba(239,68,68,0.8)]"
                      : isPast
                      ? isNear
                        ? "text-text-muted/60 text-base sm:text-lg"
                        : "text-text-muted/30 text-sm"
                      : isNear
                      ? "text-text-muted/50 text-base sm:text-lg"
                      : "text-text-muted/20 text-sm"
                  }`}
                >
                  {line.text}
                </span>
              ) : (
                <span className="block text-text-muted/20 text-2xl">·</span>
              )}
            </div>
          );
        })}

        {/* Spacer so last line can center */}
        <div className="h-[30vh] shrink-0" />
      </div>
    </div>
  );
}

// ── Main KaraokePlayer ────────────────────────────────────────────────────────
export function KaraokePlayer({ entry, onClose }: KaraokePlayerProps) {
  const lines = parseLrc(entry.syncedLyrics);

  // YouTube player state
  const playerRef = useRef<any>(null);
  const playerDivRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playerReady, setPlayerReady] = useState(false);

  // Video ID state (needed if no beatVideoId)
  const [videoInput, setVideoInput] = useState(entry.beatVideoId ?? "");
  const [activeVideoId, setActiveVideoId] = useState(entry.beatVideoId ?? "");
  const [videoMode, setVideoMode] = useState<"playing" | "input">(!entry.beatVideoId ? "input" : "playing");

  // Video size toggle
  const [videoLarge, setVideoLarge] = useState(false);

  // Current line index
  const currentIndex = (() => {
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= currentTime) idx = i;
      else break;
    }
    return idx;
  })();

  // Init YouTube player
  const initPlayer = useCallback((videoId: string) => {
    if (!playerDivRef.current || !videoId) return;
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }
    setPlayerReady(false);
    playerRef.current = new (window as any).YT.Player(playerDivRef.current, {
      videoId,
      playerVars: { autoplay: 1, rel: 0, modestbranding: 1 },
      events: {
        onReady: () => {
          setPlayerReady(true);
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = setInterval(() => {
            try {
              const t = playerRef.current?.getCurrentTime?.();
              if (typeof t === "number") setCurrentTime(t);
            } catch { /* ignore */ }
          }, 100);
        },
      },
    });
  }, []);

  // Load YouTube API and init player
  useEffect(() => {
    if (!activeVideoId) return;
    loadYouTubeApi(() => initPlayer(activeVideoId));
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      try { playerRef.current?.destroy(); } catch { /* ignore */ }
      playerRef.current = null;
    };
  }, [activeVideoId, initPlayer]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === " " && playerRef.current) {
        e.preventDefault();
        const state = playerRef.current.getPlayerState?.();
        if (state === 1) playerRef.current.pauseVideo();
        else playerRef.current.playVideo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleVideoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractVideoId(videoInput);
    if (!id) return;
    setActiveVideoId(id);
    setVideoMode("playing");
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/97 flex flex-col"
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <Mic2 className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-bold text-white leading-tight truncate max-w-[200px] sm:max-w-sm">
                {entry.title}
              </p>
              <p className="text-xs text-text-muted">{entry.artist}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Video URL input button */}
            <button
              onClick={() => setVideoMode(videoMode === "input" ? "playing" : "input")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-muted border border-white/10 hover:text-white hover:border-white/20 transition-colors"
            >
              <Search className="w-3 h-3" />
              {videoMode === "input" ? "Cancel" : "Change video"}
            </button>
            {/* Video size toggle */}
            {videoMode === "playing" && (
              <button
                onClick={() => setVideoLarge((v) => !v)}
                className="p-1.5 rounded-lg text-text-muted border border-white/10 hover:text-white hover:border-white/20 transition-colors"
                title={videoLarge ? "Shrink video" : "Expand video"}
              >
                {videoLarge ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-text-muted hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video URL input (shown when no video or user wants to change) */}
        <AnimatePresence>
          {videoMode === "input" && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-white/10 shrink-0"
            >
              <form onSubmit={handleVideoSubmit} className="flex items-center gap-2 px-4 py-3">
                <input
                  autoFocus
                  value={videoInput}
                  onChange={(e) => setVideoInput(e.target.value)}
                  placeholder="Paste YouTube URL or video ID…"
                  className="flex-1 h-9 px-3 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-text-muted focus:outline-none focus:border-primary/50"
                />
                <button
                  type="submit"
                  disabled={!videoInput.trim()}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Load
                </button>
              </form>
              <p className="px-4 pb-3 text-xs text-text-muted/60">
                Tip: search the song on YouTube, then paste the URL here. Space bar = play/pause.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main area: video + lyrics */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* YouTube player */}
          {activeVideoId && videoMode === "playing" && (
            <div
              className={`shrink-0 w-full transition-all duration-300 bg-black ${
                videoLarge ? "h-[45vh]" : "h-[28vh] sm:h-[32vh]"
              }`}
            >
              {/* YT mounts into this div */}
              <div ref={playerDivRef} className="w-full h-full" />
            </div>
          )}

          {/* Placeholder if no video yet */}
          {(!activeVideoId || videoMode === "input") && (
            <div className="shrink-0 flex items-center justify-center h-28 text-text-muted/40 text-sm border-b border-white/5">
              {videoMode === "input"
                ? "Enter a YouTube URL above to load the video"
                : "No video loaded"}
            </div>
          )}

          {/* Lyrics scroll */}
          <div className="flex-1 overflow-hidden relative">
            {/* Gradient fade top */}
            <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/97 to-transparent z-10 pointer-events-none" />
            {/* Gradient fade bottom */}
            <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black/97 to-transparent z-10 pointer-events-none" />

            <LyricsDisplay lines={lines} currentIndex={currentIndex} />
          </div>
        </div>

        {/* Progress glow bar */}
        {lines.length > 0 && currentIndex >= 0 && (
          <div className="shrink-0 h-0.5 bg-white/5">
            <motion.div
              className="h-full bg-primary"
              animate={{ width: `${((currentIndex + 1) / lines.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
