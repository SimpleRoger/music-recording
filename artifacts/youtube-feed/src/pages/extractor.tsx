import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "wouter";
import {
  Tv2, Music2, FileText, Mic, Bookmark, Wand2, Search, X,
  Download, Trash2, Loader2, Play, CheckCircle2, AlertCircle,
  Clock, Eye,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useSearchSongs, useExtractBeat, useExtractedBeats, useDeleteExtractedBeat,
  type SongSearchResult, type ExtractedBeat, type ExtractionProgress,
} from "../hooks/use-extracted-beats";

// ── Duration helpers ──────────────────────────────────────────────────────────
function parseDuration(iso: string | null): string {
  if (!iso) return "";
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return "";
  const h = Number(m[1] ?? 0);
  const min = Number(m[2] ?? 0);
  const sec = Number(m[3] ?? 0);
  if (h) return `${h}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${min}:${String(sec).padStart(2, "0")}`;
}
function fmtViews(v: string | null): string {
  if (!v) return "";
  const n = Number(v);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function formatSec(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

// ── Search result card ────────────────────────────────────────────────────────
interface SearchCardProps {
  song: SongSearchResult;
  extracting: boolean;
  done: boolean;
  progress: ExtractionProgress | null;
  error: string | null;
  onExtract: (song: SongSearchResult) => void;
}

function SearchCard({ song, extracting, done, progress, error, onExtract }: SearchCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 p-3 rounded-xl bg-surface border border-border hover:border-primary/20 transition-colors"
    >
      <div className="relative shrink-0">
        <img src={song.thumbnailUrl} alt={song.title} className="w-20 h-14 object-cover rounded-lg" />
        {song.duration && (
          <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] font-mono px-1 rounded">
            {parseDuration(song.duration)}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-text-main text-sm font-semibold line-clamp-2 leading-snug">{song.title}</p>
        <p className="text-text-muted text-xs mt-0.5 truncate">{song.channelName}</p>
        <div className="flex items-center gap-3 mt-1">
          {song.viewCount && (
            <span className="flex items-center gap-1 text-[10px] text-text-muted">
              <Eye className="w-2.5 h-2.5" />{fmtViews(song.viewCount)}
            </span>
          )}
        </div>

        {/* Status area */}
        {extracting && (
          <div className="mt-2 space-y-1">
            {/* Step pills */}
            <div className="flex items-center gap-1">
              {(["download", "extract", "upload"] as const).map((s) => {
                const labels = { download: "Download", extract: "AI Separation", upload: "Upload" };
                const stepOrder = { download: 0, extract: 1, upload: 2 };
                const currentOrder = progress ? stepOrder[progress.step] : -1;
                const thisOrder = stepOrder[s];
                const isActive = progress?.step === s;
                const isDone = currentOrder > thisOrder;
                return (
                  <span key={s} className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold border transition-colors ${
                    isActive ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
                    isDone ? "bg-green-500/10 text-green-400 border-green-500/20" :
                    "bg-surface text-text-muted/40 border-border"
                  }`}>
                    {isDone ? "✓" : ""}{labels[s]}
                  </span>
                );
              })}
            </div>
            {/* Progress bar */}
            <div className="h-1 bg-surface-hover rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full transition-all duration-700"
                style={{ width: `${progress?.pct ?? 10}%` }}
              />
            </div>
            {progress && (
              <p className="text-[10px] text-text-muted truncate">{progress.message}</p>
            )}
          </div>
        )}
        {done && (
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-green-400">
            <CheckCircle2 className="w-3 h-3" />Beat extracted!
          </div>
        )}
        {error && (
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-red-400">
            <AlertCircle className="w-3 h-3" />{error}
          </div>
        )}
      </div>

      <button
        onClick={() => !extracting && !done && onExtract(song)}
        disabled={extracting || done}
        className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
          done
            ? "bg-green-500/10 text-green-400 border-green-500/20 cursor-default"
            : extracting
            ? "bg-surface text-text-muted border-border cursor-not-allowed"
            : "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20"
        }`}
      >
        {extracting ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : done ? (
          <CheckCircle2 className="w-3 h-3" />
        ) : (
          <Wand2 className="w-3 h-3" />
        )}
        {done ? "Done" : extracting ? "Working…" : "Extract Beat"}
      </button>
    </motion.div>
  );
}

// ── Extracted beat card ───────────────────────────────────────────────────────
function ExtractedCard({ beat }: { beat: ExtractedBeat }) {
  const deleteBeat = useDeleteExtractedBeat();
  const servingUrl = `/api/storage${beat.objectPath}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3"
    >
      <div className="flex items-center gap-3">
        {beat.thumbnailUrl && (
          <img src={beat.thumbnailUrl} alt={beat.title} className="w-12 h-9 object-cover rounded-lg shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-text-main text-sm font-semibold truncate">{beat.title}</p>
          <p className="text-xs text-text-muted mt-0.5">{beat.channelName} · {fmtDate(beat.createdAt)}</p>
        </div>
        <span className="shrink-0 text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full font-semibold">
          Instrumental
        </span>
      </div>

      <audio src={servingUrl} controls className="w-full h-8" style={{ accentColor: "#ff3b30" }} />

      <div className="flex items-center gap-2">
        <a
          href={servingUrl}
          download={`${beat.title} - instrumental`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-text-muted hover:text-text-main border border-border hover:border-primary/30 transition-all"
        >
          <Download className="w-3.5 h-3.5" />Download WAV
        </a>
        <a
          href={`https://youtube.com/watch?v=${beat.videoId}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-text-muted hover:text-primary border border-border hover:border-primary/30 transition-all"
        >
          <Play className="w-3.5 h-3.5" />Original
        </a>
        <button
          onClick={() => deleteBeat.mutate(beat.id)}
          disabled={deleteBeat.isPending}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-text-muted hover:text-red-400 border border-border hover:border-red-500/20 transition-all"
        >
          {deleteBeat.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          Delete
        </button>
      </div>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Extractor() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data: results, isLoading: searching } = useSearchSongs(query);
  const { data: extracted } = useExtractedBeats();
  const extractBeat = useExtractBeat();

  // Per-song state keyed by videoId
  const [progressMap, setProgressMap] = useState<Record<string, ExtractionProgress>>({});
  const [doneSet, setDoneSet] = useState<Set<string>>(new Set());
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});
  const [extractingSet, setExtractingSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(input), 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [input]);

  const handleExtract = useCallback((song: SongSearchResult) => {
    setExtractingSet((s) => new Set(s).add(song.videoId));
    setErrorMap((m) => { const n = { ...m }; delete n[song.videoId]; return n; });

    extractBeat.mutate(
      {
        song,
        onProgress: (p) => setProgressMap((m) => ({ ...m, [song.videoId]: p })),
      },
      {
        onSuccess: () => {
          setDoneSet((s) => new Set(s).add(song.videoId));
          setExtractingSet((s) => { const n = new Set(s); n.delete(song.videoId); return n; });
        },
        onError: (e: any) => {
          setErrorMap((m) => ({ ...m, [song.videoId]: e.message }));
          setExtractingSet((s) => { const n = new Set(s); n.delete(song.videoId); return n; });
        },
      }
    );
  }, [extractBeat]);

  const isSearching = query.trim().length >= 2;

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <header className="h-16 border-b border-border glass-panel sticky top-0 z-40 flex items-center px-4 sm:px-6">
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
            <Link href="/"><span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer"><Tv2 className="w-3.5 h-3.5" />Feed</span></Link>
            <Link href="/beats"><span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer"><Music2 className="w-3.5 h-3.5" />Beats</span></Link>
            <Link href="/lyrics"><span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer"><FileText className="w-3.5 h-3.5" />Lyrics</span></Link>
            <Link href="/recordings"><span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer"><Mic className="w-3.5 h-3.5" />Recordings</span></Link>
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-semibold bg-primary/15 text-primary border border-primary/20"><Wand2 className="w-3.5 h-3.5" />Extractor</span>
            <Link href="/saved"><span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer"><Bookmark className="w-3.5 h-3.5" />Saved</span></Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-8">
        {/* Page title */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-text-main flex items-center gap-2">
            <Wand2 className="w-6 h-6 text-primary" />
            Beat Extractor
          </h2>
          <p className="text-text-muted text-sm mt-1">
            Search any song → AI strips the vocals and gives you a clean instrumental
          </p>
        </div>

        {/* Search box */}
        <div className="relative mb-6">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='Search a song — try "Blinding Lights" or "As It Was"'
            className="w-full h-12 pl-10 pr-10 bg-surface border border-border rounded-xl text-text-main placeholder-text-muted text-sm focus:outline-none focus:border-primary/50 transition-colors"
          />
          {input && (
            <button
              onClick={() => { setInput(""); setQuery(""); }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Search results */}
        <AnimatePresence mode="wait">
          {isSearching && (
            <motion.section
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mb-8"
            >
              <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted mb-3">
                Search Results
              </h3>
              {searching && (
                <div className="flex items-center gap-2 text-text-muted py-6">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Searching YouTube…</span>
                </div>
              )}
              {!searching && (!results || results.length === 0) && (
                <p className="text-text-muted text-sm py-6">No results found. Try a different search.</p>
              )}
              {!searching && results && results.length > 0 && (
                <div className="flex flex-col gap-2">
                  {results.map((song) => (
                    <SearchCard
                      key={song.videoId}
                      song={song}
                      extracting={extractingSet.has(song.videoId)}
                      done={doneSet.has(song.videoId)}
                      progress={progressMap[song.videoId] ?? null}
                      error={errorMap[song.videoId] ?? null}
                      onExtract={handleExtract}
                    />
                  ))}
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {/* Extraction note */}
        {!isSearching && (
          <div className="mb-8 p-4 rounded-xl bg-surface border border-border text-sm text-text-muted leading-relaxed">
            <p className="font-semibold text-text-main mb-1">How it works</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Search for any song above</li>
              <li>Click <strong className="text-text-main">Extract Beat</strong> — the audio downloads and runs through Demucs AI to separate vocals from the music</li>
              <li>The instrumental (drums + bass + everything except vocals) is saved to your library</li>
            </ol>
            <p className="mt-2 text-amber-400/80 text-xs flex items-center gap-1"><Clock className="w-3 h-3" />Extraction typically takes 1–3 minutes per song on first run</p>
          </div>
        )}

        {/* Library of extracted beats */}
        {extracted && extracted.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">
                Your Instrumentals
              </h3>
              <span className="text-xs text-text-muted bg-surface border border-border px-2 py-0.5 rounded-full">
                {extracted.length}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {extracted.map((beat) => <ExtractedCard key={beat.id} beat={beat} />)}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
