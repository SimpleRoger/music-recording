import { useState, useEffect, useRef, useCallback } from "react";
import {
  X, Search, Mic2, Play, Pause, Download, Music2,
  Loader2, AlertCircle, Volume2, VolumeX, Mic,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ExtractedBeat } from "../hooks/use-extracted-beats";

// ── Types ─────────────────────────────────────────────────────────────────────
interface LrcLine { time: number; text: string; }
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
  const activeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentIdx]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2" style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}>
      {lines.map((line, i) => {
        const isActive = i === currentIdx;
        const isPast = i < currentIdx;
        return (
          <div
            key={i}
            ref={isActive ? activeRef : undefined}
            className={`text-center transition-all duration-300 px-4 py-1 rounded-xl select-none ${
              isActive ? "text-amber-300 font-bold text-xl leading-snug scale-105"
              : isPast  ? "text-white/30 text-base"
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
    <div className="flex-1 overflow-y-auto px-6 py-4" style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}>
      <pre className="text-white/70 text-sm font-mono leading-relaxed whitespace-pre-wrap text-center">{text}</pre>
    </div>
  );
}

// ── Volume Knob ───────────────────────────────────────────────────────────────
function VolumeSlider({
  icon, label, value, onChange, color = "amber",
}: {
  icon: React.ReactNode; label: string; value: number;
  onChange: (v: number) => void; color?: "amber" | "violet";
}) {
  const muted = value === 0;
  const accentClass = color === "violet" ? "#a855f7" : "#f59e0b";
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-[72px]">
      <div className={`p-1.5 rounded-lg ${muted ? "text-white/20" : color === "violet" ? "text-violet-400" : "text-amber-400"}`}>
        {icon}
      </div>
      <input
        type="range" min={0} max={1} step={0.01} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-16 cursor-pointer"
        style={{ accentColor: accentClass }}
      />
      <span className="text-[10px] text-white/30 font-mono">{label}</span>
    </div>
  );
}

// ── Dual-track Audio Player ───────────────────────────────────────────────────
interface DualPlayerProps {
  instrumentalSrc: string;
  vocalsSrc: string | null;
  onTimeUpdate: (t: number) => void;
  instrumentalRef: React.RefObject<HTMLAudioElement | null>;
  vocalsRef: React.RefObject<HTMLAudioElement | null>;
  downloadName: string;
  instrumentalSrc2: string; // same as instrumentalSrc, used for download href
}

function DualAudioPlayer({
  instrumentalSrc, vocalsSrc, onTimeUpdate,
  instrumentalRef, vocalsRef, downloadName,
}: DualPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [instVol, setInstVol] = useState(1);
  const [vocVol, setVocVol] = useState(0.2);   // vocals start soft
  const barRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);             // prevent feedback loop during seek

  // Wire up instrumental listeners
  useEffect(() => {
    const audio = instrumentalRef.current;
    if (!audio) return;
    const onTime = () => { setCurrentTime(audio.currentTime); onTimeUpdate(audio.currentTime); };
    const onDur  = () => setDuration(audio.duration || 0);
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
  }, [instrumentalRef, onTimeUpdate]);

  // Apply volume changes
  useEffect(() => { if (instrumentalRef.current) instrumentalRef.current.volume = instVol; }, [instVol, instrumentalRef]);
  useEffect(() => { if (vocalsRef.current) vocalsRef.current.volume = vocVol; }, [vocVol, vocalsRef]);

  const togglePlay = async () => {
    const inst = instrumentalRef.current;
    const voc  = vocalsRef.current;
    if (!inst) return;
    if (playing) {
      inst.pause();
      voc?.pause();
    } else {
      // Sync positions before playing
      if (voc && !syncingRef.current) voc.currentTime = inst.currentTime;
      await Promise.all([inst.play(), voc ? voc.play().catch(() => {}) : Promise.resolve()]);
    }
  };

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const inst = instrumentalRef.current;
    const voc  = vocalsRef.current;
    if (!inst || !duration || !barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t = pct * duration;
    syncingRef.current = true;
    inst.currentTime = t;
    if (voc) voc.currentTime = t;
    setTimeout(() => { syncingRef.current = false; }, 200);
  }, [instrumentalRef, vocalsRef, duration]);

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="px-5 pb-5 pt-3 space-y-3">
      {/* Hidden audio elements */}
      <audio ref={instrumentalRef as React.RefObject<HTMLAudioElement>} src={instrumentalSrc} preload="metadata" />
      {vocalsSrc && <audio ref={vocalsRef as React.RefObject<HTMLAudioElement>} src={vocalsSrc} preload="metadata" />}

      {/* Timeline */}
      <div ref={barRef} onClick={seek} className="relative h-2 bg-white/10 rounded-full cursor-pointer group">
        <div className="absolute inset-y-0 left-0 bg-amber-400 rounded-full transition-all duration-100" style={{ width: `${pct}%` }} />
        <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-amber-300 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `calc(${pct}% - 7px)` }} />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-white/40 font-mono w-9 shrink-0">{fmtTime(currentTime)}</span>

        <button
          onClick={togglePlay}
          className="w-11 h-11 rounded-full bg-amber-500 hover:bg-amber-400 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/30 transition-colors"
        >
          {playing
            ? <Pause className="w-4 h-4 text-black fill-black" />
            : <Play  className="w-4 h-4 text-black fill-black ml-0.5" />}
        </button>

        <span className="text-xs text-white/40 font-mono w-9 shrink-0">{fmtTime(duration)}</span>

        {/* Volume controls */}
        <div className="flex items-center gap-4 ml-auto">
          <VolumeSlider
            icon={<Volume2 className="w-3.5 h-3.5" />}
            label="Beat"
            value={instVol}
            onChange={setInstVol}
            color="amber"
          />
          {vocalsSrc && (
            <VolumeSlider
              icon={<Mic className="w-3.5 h-3.5" />}
              label="Vocals"
              value={vocVol}
              onChange={setVocVol}
              color="violet"
            />
          )}
        </div>

        <a
          href={instrumentalSrc}
          download={`${downloadName} - instrumental.mp3`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white/50 hover:text-white border border-white/10 hover:border-white/30 transition-all shrink-0"
        >
          <Download className="w-3.5 h-3.5" />Download
        </a>
      </div>
    </div>
  );
}

// ── Lyrics search panel ───────────────────────────────────────────────────────
function LyricsSearchPanel({ defaultQuery, onSelect }: { defaultQuery: string; onSelect: (plain: string, synced: string | null) => void }) {
  const [query, setQuery] = useState(defaultQuery);
  const [results, setResults] = useState<LrcResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true); setError(null);
    try {
      const r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, { headers: { "Lrclib-Client": "TubeFeed/1.0" } });
      if (!r.ok) throw new Error("Search failed");
      setResults((await r.json() as LrcResult[]).slice(0, 10));
    } catch { setError("Could not reach lyrics service. Check your connection."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => doSearch(query), 600);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [query, doSearch]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { doSearch(defaultQuery); }, []);

  return (
    <div className="flex flex-col gap-3 h-full overflow-hidden">
      <div className="relative shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search for lyrics…"
          className="w-full h-10 pl-9 pr-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-amber-500/50 transition-colors" />
      </div>

      {loading && <div className="flex items-center gap-2 text-white/40 py-4 justify-center"><Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Searching…</span></div>}
      {error   && <div className="flex items-center gap-2 text-red-400 text-sm py-2"><AlertCircle className="w-4 h-4" />{error}</div>}

      <div className="flex-1 overflow-y-auto space-y-2" style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}>
        {!loading && results.map((r) => (
          <div key={r.id} className="p-3 rounded-xl bg-white/5 border border-white/10 hover:border-amber-500/30 transition-colors">
            <p className="text-sm font-semibold text-white truncate">{r.trackName}</p>
            <p className="text-xs text-white/40 truncate">{r.artistName} · {r.albumName}</p>
            <div className="flex items-center gap-2 mt-2">
              {r.syncedLyrics && <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold">♪ Synced</span>}
              {r.plainLyrics   && <span className="text-[10px] text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-full font-semibold">Plain</span>}
              <button onClick={() => onSelect(r.plainLyrics ?? "", r.syncedLyrics ?? null)}
                disabled={!r.plainLyrics && !r.syncedLyrics}
                className="ml-auto text-xs font-semibold px-3 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                Use these lyrics
              </button>
            </div>
          </div>
        ))}
        {!loading && results.length === 0 && !error && <p className="text-white/30 text-sm text-center py-6">No lyrics found — try a different search.</p>}
      </div>
    </div>
  );
}

// ── Main Karaoke Studio ───────────────────────────────────────────────────────
export function KaraokeStudio({ beat, onClose }: { beat: ExtractedBeat; onClose: () => void }) {
  const [plainLyrics, setPlainLyrics] = useState<string | null>(null);
  const [syncedLyrics, setSyncedLyrics] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [showSearch, setShowSearch] = useState(false);
  const [viewMode, setViewMode] = useState<"synced" | "plain">("synced");
  const instrumentalRef = useRef<HTMLAudioElement | null>(null);
  const vocalsRef = useRef<HTMLAudioElement | null>(null);

  const instrumentalSrc = `/api/storage${beat.objectPath}`;
  const vocalsSrc = beat.vocalsObjectPath ? `/api/storage${beat.vocalsObjectPath}` : null;

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
        style={{ height: "min(88vh, 700px)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <Mic2 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm truncate">{beat.title}</p>
            <p className="text-white/40 text-xs truncate">
              {beat.channelName} · Instrumental{vocalsSrc ? " + Vocals" : ""}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setShowSearch((s) => !s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                showSearch ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : "text-white/50 border-white/10 hover:border-white/20"
              }`}
            >
              <Music2 className="w-3.5 h-3.5" />
              {hasLyrics ? "Change Lyrics" : "Find Lyrics"}
            </button>

            {hasLyrics && syncedLyrics && (
              <div className="flex items-center gap-0.5 bg-white/5 border border-white/10 rounded-lg p-0.5">
                <button onClick={() => setViewMode("synced")}
                  className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${viewMode === "synced" ? "bg-amber-500/20 text-amber-400" : "text-white/30"}`}>
                  Synced
                </button>
                <button onClick={() => setViewMode("plain")}
                  className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${viewMode === "plain" ? "bg-white/10 text-white/70" : "text-white/30"}`}>
                  Plain
                </button>
              </div>
            )}

            <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/5 transition-colors ml-1">
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
                <LyricsSearchPanel defaultQuery={beat.title} onSelect={handleSelectLyrics} />
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
                <p className="text-white/40 text-sm max-w-xs">Click "Find Lyrics" to search for matching lyrics from the library.</p>
              </div>
              <button onClick={() => setShowSearch(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all">
                <Search className="w-4 h-4" />Find Lyrics
              </button>
            </div>
          ) : viewMode === "synced" && lrcLines.length > 0 ? (
            <SyncedDisplay lines={lrcLines} currentIdx={currentIdx} />
          ) : (
            <PlainDisplay text={plainLyrics ?? ""} />
          )}
        </div>

        {/* Dual-track audio player */}
        <div className="shrink-0 border-t border-white/8 bg-black/30">
          {!vocalsSrc && (
            <div className="px-5 pt-3 pb-0">
              <p className="text-[10px] text-white/25 italic">
                Vocals track not available for this beat — re-extract the song to get separate vocal/instrumental controls.
              </p>
            </div>
          )}
          <DualAudioPlayer
            instrumentalSrc={instrumentalSrc}
            instrumentalSrc2={instrumentalSrc}
            vocalsSrc={vocalsSrc}
            onTimeUpdate={handleTimeUpdate}
            instrumentalRef={instrumentalRef}
            vocalsRef={vocalsRef}
            downloadName={beat.title}
          />
        </div>
      </motion.div>
    </div>
  );
}
