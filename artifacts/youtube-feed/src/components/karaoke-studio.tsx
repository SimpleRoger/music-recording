import { useState, useEffect, useRef, useCallback } from "react";
import {
  X, Search, Mic2, Play, Pause, Download, Music2,
  ChevronLeft, Loader2, AlertCircle, Volume2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ExtractedBeat } from "../hooks/use-extracted-beats";

// ── Types ─────────────────────────────────────────────────────────────────────
interface LrcLine {
  time: number;
  text: string;
}

interface LrcResult {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

// ── LRC parser ────────────────────────────────────────────────────────────────
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

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ── Scrolling lyrics display ──────────────────────────────────────────────────
function SyncedDisplay({ lines, currentIdx }: { lines: LrcLine[]; currentIdx: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentIdx]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-6 py-4 space-y-2 scroll-smooth"
      style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}
    >
      {lines.map((line, i) => {
        const isActive = i === currentIdx;
        const isPast = i < currentIdx;
        return (
          <div
            key={i}
            ref={isActive ? activeRef : undefined}
            className={`text-center transition-all duration-300 px-4 py-1 rounded-xl select-none ${
              isActive
                ? "text-amber-300 font-bold text-xl leading-snug scale-105"
                : isPast
                ? "text-white/30 text-base"
                : "text-white/50 text-base"
            }`}
          >
            {line.text || "\u00A0"}
          </div>
        );
      })}
    </div>
  );
}

function PlainDisplay({ text }: { text: string }) {
  return (
    <div
      className="flex-1 overflow-y-auto px-6 py-4"
      style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}
    >
      <pre className="text-white/70 text-sm font-mono leading-relaxed whitespace-pre-wrap text-center">
        {text}
      </pre>
    </div>
  );
}

// ── Audio player ──────────────────────────────────────────────────────────────
interface AudioPlayerProps {
  src: string;
  onTimeUpdate: (t: number) => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  downloadName: string;
}

function AudioPlayer({ src, onTimeUpdate, audioRef, downloadName }: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => { setCurrentTime(audio.currentTime); onTimeUpdate(audio.currentTime); };
    const onDur = () => setDuration(audio.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("durationchange", onDur);
    audio.addEventListener("loadedmetadata", onDur);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("durationchange", onDur);
      audio.removeEventListener("loadedmetadata", onDur);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [audioRef, onTimeUpdate]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause(); else audio.play();
  };

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration || !barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * duration;
  }, [audioRef, duration]);

  const changeVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  };

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="px-6 pb-6 pt-3 space-y-3">
      {/* Hidden audio element */}
      <audio ref={audioRef as React.RefObject<HTMLAudioElement>} src={src} preload="metadata" />

      {/* Timeline */}
      <div
        ref={barRef}
        onClick={seek}
        className="relative h-2 bg-white/10 rounded-full cursor-pointer group"
      >
        <div
          className="absolute inset-y-0 left-0 bg-amber-400 rounded-full transition-all duration-100"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-amber-300 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `calc(${pct}% - 7px)` }}
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-4">
        <span className="text-xs text-white/40 font-mono w-10 shrink-0">{fmtTime(currentTime)}</span>

        <button
          onClick={togglePlay}
          className="w-12 h-12 rounded-full bg-amber-500 hover:bg-amber-400 transition-colors flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/30"
        >
          {playing
            ? <Pause className="w-5 h-5 text-black fill-black" />
            : <Play className="w-5 h-5 text-black fill-black ml-0.5" />}
        </button>

        <span className="text-xs text-white/40 font-mono w-10 shrink-0">{fmtTime(duration)}</span>

        <div className="flex items-center gap-2 ml-auto">
          <Volume2 className="w-3.5 h-3.5 text-white/30 shrink-0" />
          <input
            type="range" min={0} max={1} step={0.01} value={volume}
            onChange={changeVolume}
            className="w-20 accent-amber-400 cursor-pointer"
          />
        </div>

        <a
          href={src}
          download={`${downloadName} - instrumental.mp3`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white/60 hover:text-white border border-white/10 hover:border-white/30 transition-all"
        >
          <Download className="w-3.5 h-3.5" />
          Download
        </a>
      </div>
    </div>
  );
}

// ── Lyrics search panel ───────────────────────────────────────────────────────
interface SearchPanelProps {
  defaultQuery: string;
  onSelect: (plain: string, synced: string | null) => void;
}

function LyricsSearchPanel({ defaultQuery, onSelect }: SearchPanelProps) {
  const [query, setQuery] = useState(defaultQuery);
  const [results, setResults] = useState<LrcResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`,
        { headers: { "Lrclib-Client": "TubeFeed/1.0" } }
      );
      if (!r.ok) throw new Error("Search failed");
      const data: LrcResult[] = await r.json();
      setResults(data.slice(0, 10));
    } catch {
      setError("Could not reach lyrics service. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => doSearch(query), 600);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [query, doSearch]);

  // Auto-search on mount
  useEffect(() => { doSearch(defaultQuery); }, []);

  return (
    <div className="flex flex-col gap-3 h-full overflow-hidden">
      <div className="relative shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for lyrics…"
          className="w-full h-10 pl-9 pr-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-amber-500/50 transition-colors"
        />
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-white/40 py-4 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Searching…</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm py-2">
          <AlertCircle className="w-4 h-4" />{error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2" style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}>
        {!loading && results.map((r) => (
          <div
            key={r.id}
            className="p-3 rounded-xl bg-white/5 border border-white/10 hover:border-amber-500/30 transition-colors"
          >
            <p className="text-sm font-semibold text-white truncate">{r.trackName}</p>
            <p className="text-xs text-white/40 truncate">{r.artistName} · {r.albumName}</p>
            <div className="flex items-center gap-2 mt-2">
              {r.syncedLyrics && (
                <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold">
                  ♪ Synced
                </span>
              )}
              {r.plainLyrics && (
                <span className="text-[10px] text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-full font-semibold">
                  Plain
                </span>
              )}
              <button
                onClick={() => onSelect(r.plainLyrics ?? "", r.syncedLyrics ?? null)}
                disabled={!r.plainLyrics && !r.syncedLyrics}
                className="ml-auto text-xs font-semibold px-3 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Use these lyrics
              </button>
            </div>
          </div>
        ))}
        {!loading && results.length === 0 && !error && (
          <p className="text-white/30 text-sm text-center py-6">No lyrics found — try a different search.</p>
        )}
      </div>
    </div>
  );
}

// ── Main Karaoke Studio ───────────────────────────────────────────────────────
interface Props {
  beat: ExtractedBeat;
  onClose: () => void;
}

export function KaraokeStudio({ beat, onClose }: Props) {
  const [plainLyrics, setPlainLyrics] = useState<string | null>(null);
  const [syncedLyrics, setSyncedLyrics] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [showSearch, setShowSearch] = useState(false);
  const [viewMode, setViewMode] = useState<"synced" | "plain">("synced");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const audioSrc = `/api/storage${beat.objectPath}`;
  const lrcLines = syncedLyrics ? parseLrc(syncedLyrics) : [];

  const handleTimeUpdate = useCallback((t: number) => {
    if (!lrcLines.length) return;
    let idx = -1;
    for (let i = 0; i < lrcLines.length; i++) {
      if (lrcLines[i].time <= t) idx = i; else break;
    }
    setCurrentIdx(idx);
  }, [lrcLines]);

  const handleSelectLyrics = (plain: string, synced: string | null) => {
    setPlainLyrics(plain);
    setSyncedLyrics(synced);
    setViewMode(synced ? "synced" : "plain");
    setShowSearch(false);
  };

  const hasLyrics = plainLyrics !== null;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="relative w-full max-w-2xl mx-4 bg-[#0d0d0d] border border-white/10 rounded-2xl overflow-hidden flex flex-col"
        style={{ height: "min(88vh, 680px)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <Mic2 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm truncate">{beat.title}</p>
            <p className="text-white/40 text-xs truncate">{beat.channelName} · Instrumental</p>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSearch((s) => !s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                showSearch
                  ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                  : "text-white/50 border-white/10 hover:border-white/20"
              }`}
            >
              <Music2 className="w-3.5 h-3.5" />
              {hasLyrics ? "Change Lyrics" : "Find Lyrics"}
            </button>

            {hasLyrics && syncedLyrics && (
              <div className="flex items-center gap-0.5 bg-white/5 border border-white/10 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode("synced")}
                  className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${viewMode === "synced" ? "bg-amber-500/20 text-amber-400" : "text-white/30"}`}
                >
                  Synced
                </button>
                <button
                  onClick={() => setViewMode("plain")}
                  className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${viewMode === "plain" ? "bg-white/10 text-white/70" : "text-white/30"}`}
                >
                  Plain
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/5 transition-colors ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Lyrics search panel */}
        <AnimatePresence>
          {showSearch && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 320, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden shrink-0 border-b border-white/8"
            >
              <div className="p-5 h-full flex flex-col">
                <LyricsSearchPanel
                  defaultQuery={beat.title}
                  onSelect={handleSelectLyrics}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lyrics display */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {!hasLyrics ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
              <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Music2 className="w-7 h-7 text-amber-400/60" />
              </div>
              <div>
                <p className="text-white font-semibold mb-1">Add lyrics to sing along</p>
                <p className="text-white/40 text-sm max-w-xs">
                  Click "Find Lyrics" above to search for matching lyrics from the library.
                </p>
              </div>
              <button
                onClick={() => setShowSearch(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all"
              >
                <Search className="w-4 h-4" />Find Lyrics
              </button>
            </div>
          ) : viewMode === "synced" && lrcLines.length > 0 ? (
            <SyncedDisplay lines={lrcLines} currentIdx={currentIdx} />
          ) : (
            <PlainDisplay text={plainLyrics ?? ""} />
          )}
        </div>

        {/* Audio player — always visible at bottom */}
        <div className="shrink-0 border-t border-white/8 bg-black/30">
          <AudioPlayer
            src={audioSrc}
            onTimeUpdate={handleTimeUpdate}
            audioRef={audioRef}
            downloadName={beat.title}
          />
        </div>
      </motion.div>
    </div>
  );
}
