import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "wouter";
import {
  Tv2, Music2, FileText, ChevronDown, ChevronUp, ExternalLink,
  Trash2, PenLine, Play, Mic, Mic2, Bookmark, Wand2, Search, X,
  Download, BookOpen, Loader2, AlertCircle, Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { BeatPlayer } from "../components/beat-player";
import { KaraokePlayer } from "../components/karaoke-player";
import type { Video } from "@workspace/api-client-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface BeatMeta {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl?: string | null;
}

interface LyricEntry {
  id: string;        // videoId for beat-linked lyrics, lrclib-{id} for fetched
  source: "beat" | "fetched";
  title: string;
  artist: string;
  thumbnailUrl?: string | null;
  beatVideoId?: string;
  lyrics: string;
  syncedLyrics?: string;
  updatedAt: number;
}

interface LrclibResult {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  plainLyrics: string;
  syncedLyrics: string | null;
  duration: number;
}

// ── localStorage helpers ──────────────────────────────────────────────────────
const LS_PREFIX = "tubefeed-lyrics-v2-";

function saveEntry(entry: LyricEntry) {
  localStorage.setItem(LS_PREFIX + entry.id, JSON.stringify(entry));
}

function loadAllEntries(): LyricEntry[] {
  // Load v2 entries
  const v2: LyricEntry[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(LS_PREFIX)) continue;
    try {
      const entry = JSON.parse(localStorage.getItem(key)!) as LyricEntry;
      v2.push(entry);
    } catch { /* ignore */ }
  }

  // Migrate v1 beat-linked entries if any (tubefeed-lyrics-{videoId})
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("tubefeed-lyrics-") || key.startsWith(LS_PREFIX)) continue;
    const videoId = key.replace("tubefeed-lyrics-", "");
    if (v2.some((e) => e.id === videoId)) continue; // already migrated
    const lyrics = localStorage.getItem(key);
    if (!lyrics?.trim()) continue;
    const rawMeta = localStorage.getItem(`tubefeed-beat-meta-${videoId}`);
    let meta: BeatMeta = { videoId, title: videoId, channelName: "" };
    if (rawMeta) { try { meta = { ...meta, ...JSON.parse(rawMeta) }; } catch { /* ignore */ } }
    const rawTime = localStorage.getItem(`tubefeed-beat-time-${videoId}`);
    const entry: LyricEntry = {
      id: videoId,
      source: "beat",
      title: meta.title,
      artist: meta.channelName,
      thumbnailUrl: meta.thumbnailUrl,
      beatVideoId: videoId,
      lyrics,
      updatedAt: rawTime ? parseInt(rawTime, 10) : 0,
    };
    saveEntry(entry); // promote to v2
    v2.push(entry);
  }

  return v2.sort((a, b) => b.updatedAt - a.updatedAt);
}

function deleteEntry(id: string) {
  localStorage.removeItem(LS_PREFIX + id);
  // Also clean v1 keys if any
  localStorage.removeItem(`tubefeed-lyrics-${id}`);
  localStorage.removeItem(`tubefeed-beat-meta-${id}`);
  localStorage.removeItem(`tubefeed-beat-time-${id}`);
}

// ── LRC parser (returns array of {time, text}) ────────────────────────────────
function parseLrc(lrc: string): { time: number; text: string }[] {
  return lrc
    .split("\n")
    .map((line) => {
      const m = line.match(/^\[(\d+):(\d+\.\d+)\](.*)/);
      if (!m) return null;
      const time = parseInt(m[1]) * 60 + parseFloat(m[2]);
      return { time, text: m[3].trim() };
    })
    .filter(Boolean) as { time: number; text: string }[];
}

// ── Lyrics search hook ────────────────────────────────────────────────────────
async function searchLrclib(query: string): Promise<LrclibResult[]> {
  const url = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("lrclib search failed");
  return res.json();
}

// ── Search panel ──────────────────────────────────────────────────────────────
function LyricsFetcher({ onSave }: { onSave: (entry: LyricEntry) => void }) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LrclibResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(input), 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [input]);

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    setError(null);
    searchLrclib(query)
      .then(setResults)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [query]);

  const handleSave = (r: LrclibResult) => {
    const entry: LyricEntry = {
      id: `lrclib-${r.id}`,
      source: "fetched",
      title: r.trackName,
      artist: r.artistName,
      lyrics: r.plainLyrics || "",
      syncedLyrics: r.syncedLyrics ?? undefined,
      updatedAt: Date.now(),
    };
    saveEntry(entry);
    onSave(entry);
    setInput("");
    setQuery("");
    setResults([]);
    setPreviewId(null);
  };

  const preview = previewId !== null ? results.find((r) => r.id === previewId) : null;

  return (
    <div className="mb-8 bg-surface border border-border rounded-2xl overflow-hidden">
      {/* Search bar */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-xs font-bold uppercase tracking-widest text-text-muted">Fetch Lyrics</span>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='Search any song — try "As It Was Harry Styles" or "Drake Rich Flex"'
            className="w-full h-10 pl-9 pr-8 bg-background border border-border rounded-xl text-sm text-text-main placeholder-text-muted focus:outline-none focus:border-primary/50 transition-colors"
          />
          {input && (
            <button onClick={() => { setInput(""); setResults([]); setError(null); inputRef.current?.focus(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <AnimatePresence>
        {(loading || results.length > 0 || error) && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            {loading && (
              <div className="flex items-center gap-2 px-4 py-4 text-text-muted text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />Searching lrclib…
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />{error}
              </div>
            )}
            {!loading && results.length === 0 && query.length >= 2 && !error && (
              <p className="px-4 py-4 text-sm text-text-muted">No results found — try adding the artist name</p>
            )}
            {!loading && results.length > 0 && (
              <div className="divide-y divide-border">
                {results.slice(0, 8).map((r) => (
                  <div key={r.id}>
                    <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text-main truncate">{r.trackName}</p>
                        <p className="text-xs text-text-muted truncate">{r.artistName}{r.albumName ? ` · ${r.albumName}` : ""}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {r.syncedLyrics && (
                            <span className="text-[10px] text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded-full font-semibold">
                              Synced
                            </span>
                          )}
                          {r.plainLyrics && (
                            <span className="text-[10px] text-text-muted">
                              {r.plainLyrics.split("\n").length} lines
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {r.plainLyrics && (
                          <button
                            onClick={() => setPreviewId(previewId === r.id ? null : r.id)}
                            className="px-2.5 py-1 rounded-lg text-xs text-text-muted hover:text-text-main border border-border hover:border-white/20 transition-all"
                          >
                            {previewId === r.id ? "Hide" : "Preview"}
                          </button>
                        )}
                        <button
                          onClick={() => handleSave(r)}
                          disabled={!r.plainLyrics}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-primary border border-primary/30 bg-primary/10 hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                    {/* Inline preview */}
                    <AnimatePresence>
                      {previewId === r.id && r.plainLyrics && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <pre className="px-6 pb-3 text-xs text-text-muted font-mono leading-relaxed whitespace-pre-wrap max-h-52 overflow-y-auto border-t border-border/50 pt-3 bg-background/50">
                            {r.plainLyrics}
                          </pre>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Synced lyrics display (LRC karaoke) ──────────────────────────────────────
function SyncedLyricsView({ lrc }: { lrc: string }) {
  const lines = parseLrc(lrc);
  // Strip timestamps for a clean display; full karaoke sync is a future enhancement
  return (
    <div className="space-y-0.5 max-h-[360px] overflow-y-auto pr-1">
      {lines.map((line, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-[9px] font-mono text-text-muted/50 pt-0.5 shrink-0 w-10 text-right">
            {Math.floor(line.time / 60).toString().padStart(2, "0")}:{(line.time % 60).toFixed(1).padStart(4, "0")}
          </span>
          <span className="text-sm text-text-main leading-relaxed">{line.text || "\u00A0"}</span>
        </div>
      ))}
    </div>
  );
}

// ── Helper: beat meta → Video ─────────────────────────────────────────────────
function entryToVideo(entry: LyricEntry): Video | null {
  if (!entry.beatVideoId) return null;
  return {
    videoId: entry.beatVideoId,
    title: entry.title,
    description: "",
    thumbnailUrl: entry.thumbnailUrl ?? `https://img.youtube.com/vi/${entry.beatVideoId}/mqdefault.jpg`,
    publishedAt: new Date(0).toISOString(),
    viewCount: null,
    channelId: "",
    channelName: entry.artist,
    channelThumbnailUrl: null,
    duration: null,
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Lyrics() {
  const [entries, setEntries] = useState<LyricEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLyrics, setDraftLyrics] = useState("");
  const [syncView, setSyncView] = useState<Set<string>>(new Set());
  const [activeBeat, setActiveBeat] = useState<Video | null>(null);
  const [karaokeEntry, setKaraokeEntry] = useState<{ id: string; title: string; artist: string; syncedLyrics: string; beatVideoId?: string } | null>(null);

  useEffect(() => { setEntries(loadAllEntries()); }, []);

  const handleFetched = useCallback((entry: LyricEntry) => {
    setEntries((prev) => {
      const without = prev.filter((e) => e.id !== entry.id);
      return [entry, ...without];
    });
    setExpandedId(entry.id);
  }, []);

  const handleDelete = (id: string) => {
    deleteEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const startEdit = (entry: LyricEntry) => {
    setEditingId(entry.id);
    setDraftLyrics(entry.lyrics);
    setExpandedId(entry.id);
  };

  const saveEdit = (entry: LyricEntry) => {
    const updated = { ...entry, lyrics: draftLyrics, updatedAt: Date.now() };
    saveEntry(updated);
    setEntries((prev) => prev.map((e) => e.id === entry.id ? updated : e));
    setEditingId(null);
  };

  const downloadLyrics = (entry: LyricEntry) => {
    const blob = new Blob([`${entry.title}\n${entry.artist}\n\n${entry.lyrics}`], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${entry.title} - lyrics.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
  const lineCount = (text: string) => text.split("\n").filter((l) => l.trim()).length;

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <header className="h-16 border-b border-border glass-panel sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} className="w-9 h-9 rounded-xl shadow-lg" alt="Logo"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <h1 className="font-display font-bold text-xl sm:text-2xl tracking-tight text-white flex items-center">
              Tube<span className="text-primary ml-0.5">Feed</span>
            </h1>
          </div>
          <nav className="flex items-center gap-1 bg-surface/60 border border-border rounded-xl px-1.5 py-1">
            <Link href="/"><span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer"><Tv2 className="w-3.5 h-3.5" />Feed</span></Link>
            <Link href="/beats"><span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer"><Music2 className="w-3.5 h-3.5" />Beats</span></Link>
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-semibold bg-primary/15 text-primary border border-primary/20"><FileText className="w-3.5 h-3.5" />Lyrics</span>
            <Link href="/recordings"><span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer"><Mic className="w-3.5 h-3.5" />Recordings</span></Link>
            <Link href="/extractor"><span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer"><Wand2 className="w-3.5 h-3.5" />Extractor</span></Link>
            <Link href="/saved"><span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer"><Bookmark className="w-3.5 h-3.5" />Saved</span></Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-3xl font-display font-bold text-text-main flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-primary" />Lyrics Library
          </h2>
          <p className="text-text-muted mt-1 text-sm">
            Fetch lyrics from any song or write your own on a beat
          </p>
        </div>

        {/* Fetch panel */}
        <LyricsFetcher onSave={handleFetched} />

        {/* Empty state */}
        {entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-surface border border-border flex items-center justify-center mb-6">
              <FileText className="w-9 h-9 text-text-muted/40" />
            </div>
            <h3 className="text-xl font-bold text-text-main mb-2">No lyrics saved yet</h3>
            <p className="text-text-muted max-w-sm mb-6 text-sm leading-relaxed">
              Search any song above to fetch and save lyrics, or head to the Beats tab to write your own.
            </p>
            <Link href="/beats">
              <span className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all shadow-lg shadow-primary/20 cursor-pointer">
                <Music2 className="w-4 h-4" />Go to Beats
              </span>
            </Link>
          </div>
        )}

        {/* Lyrics list */}
        <div className="flex flex-col gap-4">
          {entries.map((entry, index) => {
            const isExpanded = expandedId === entry.id;
            const isEditing = editingId === entry.id;
            const isSynced = syncView.has(entry.id);
            const video = entryToVideo(entry);

            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.05, 0.4) }}
                className="bg-surface border border-border rounded-2xl overflow-hidden"
              >
                {/* Card header */}
                <div className="flex items-center gap-3 p-4">
                  {/* Thumbnail / source badge */}
                  {entry.source === "beat" && entry.beatVideoId ? (
                    <button
                      onClick={() => video && setActiveBeat(video)}
                      className="group relative shrink-0 w-14 h-10 rounded-lg overflow-hidden border border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <img
                        src={entry.thumbnailUrl ?? `https://img.youtube.com/vi/${entry.beatVideoId}/mqdefault.jpg`}
                        alt={entry.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="w-4 h-4 text-white" fill="currentColor" />
                      </div>
                    </button>
                  ) : (
                    <div className="shrink-0 w-14 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-primary/70" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-main truncate">{entry.title}</p>
                    <p className="text-xs text-text-muted truncate">{entry.artist}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${
                        entry.source === "fetched"
                          ? "text-violet-400 bg-violet-500/10 border-violet-500/20"
                          : "text-primary bg-primary/10 border-primary/20"
                      }`}>
                        {entry.source === "fetched" ? "Fetched" : "Written"}
                      </span>
                      {entry.syncedLyrics && (
                        <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full font-semibold">
                          Synced
                        </span>
                      )}
                      <span className="text-[10px] text-text-muted">
                        {wordCount(entry.lyrics)}w · {lineCount(entry.lyrics)}L
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Karaoke button — only for synced lyrics */}
                    {entry.syncedLyrics && (
                      <button
                        onClick={() => setKaraokeEntry({
                          id: entry.id,
                          title: entry.title,
                          artist: entry.artist,
                          syncedLyrics: entry.syncedLyrics!,
                          beatVideoId: entry.beatVideoId,
                        })}
                        className="p-2 rounded-lg text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-colors"
                        title="Karaoke mode"
                      >
                        <Mic2 className="w-4 h-4" />
                      </button>
                    )}
                    {entry.beatVideoId && (
                      <a href={`https://youtube.com/watch?v=${entry.beatVideoId}`} target="_blank" rel="noopener noreferrer"
                        className="p-2 rounded-lg text-text-muted hover:text-primary hover:bg-surface-hover transition-colors" title="Open on YouTube">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    <button onClick={() => downloadLyrics(entry)}
                      className="p-2 rounded-lg text-text-muted hover:text-primary hover:bg-surface-hover transition-colors" title="Download .txt">
                      <Download className="w-4 h-4" />
                    </button>
                    <button onClick={() => startEdit(entry)}
                      className="p-2 rounded-lg text-text-muted hover:text-primary hover:bg-surface-hover transition-colors" title="Edit lyrics">
                      <PenLine className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(entry.id)}
                      className="p-2 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      className="p-2 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors ml-1"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Collapsed preview */}
                {!isExpanded && (
                  <div className="px-4 pb-4 cursor-pointer" onClick={() => setExpandedId(entry.id)}>
                    <pre className="text-text-muted text-xs font-mono leading-relaxed whitespace-pre-wrap line-clamp-3 bg-background rounded-xl px-3 py-2 border border-border">
                      {entry.lyrics.split("\n").slice(0, 3).join("\n")}
                      {lineCount(entry.lyrics) > 3 && "\n…"}
                    </pre>
                  </div>
                )}

                {/* Expanded view */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4">
                        {/* Synced/plain toggle */}
                        {entry.syncedLyrics && !isEditing && (
                          <div className="flex gap-1 mb-3">
                            <button
                              onClick={() => setSyncView((s) => { const n = new Set(s); n.delete(entry.id); return n; })}
                              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${!isSynced ? "bg-primary/10 text-primary border-primary/30" : "text-text-muted border-border hover:border-white/20"}`}
                            >
                              Plain
                            </button>
                            <button
                              onClick={() => setSyncView((s) => new Set(s).add(entry.id))}
                              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${isSynced ? "bg-amber-500/10 text-amber-400 border-amber-500/30" : "text-text-muted border-border hover:border-white/20"}`}
                            >
                              Synced ♪
                            </button>
                          </div>
                        )}

                        {isEditing ? (
                          <>
                            <textarea
                              value={draftLyrics}
                              onChange={(e) => setDraftLyrics(e.target.value)}
                              className="w-full min-h-[280px] bg-background border border-primary/40 rounded-xl p-4 text-text-main text-sm font-mono leading-relaxed resize-y focus:outline-none focus:border-primary/70 transition-colors"
                              spellCheck={false}
                              autoFocus
                            />
                            <div className="flex gap-2 mt-2">
                              <button onClick={() => saveEdit(entry)}
                                className="px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-xl transition-colors">
                                Save
                              </button>
                              <button onClick={() => { setEditingId(null); setDraftLyrics(""); }}
                                className="px-4 py-2 bg-surface-hover text-text-muted text-sm rounded-xl transition-colors">
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : isSynced && entry.syncedLyrics ? (
                          <div className="bg-background rounded-xl p-4 border border-border">
                            <SyncedLyricsView lrc={entry.syncedLyrics} />
                          </div>
                        ) : (
                          <pre className="text-text-main text-sm font-mono leading-relaxed whitespace-pre-wrap bg-background rounded-xl px-4 py-3 border border-border max-h-[420px] overflow-y-auto">
                            {entry.lyrics}
                          </pre>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </main>

      <BeatPlayer
        beat={activeBeat}
        onClose={() => setActiveBeat(null)}
        onBeatSelect={(beat) => setActiveBeat(beat)}
      />

      {karaokeEntry && (
        <KaraokePlayer
          entry={karaokeEntry}
          onClose={() => setKaraokeEntry(null)}
        />
      )}
    </div>
  );
}
