import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import {
  Tv2, Music2, FileText, Mic, Trash2, Download, Loader2,
  Cloud, Bookmark, Play, Pause, Volume2, Layers,
} from "lucide-react";
import { motion } from "framer-motion";
import { useRecordings, useDeleteRecording } from "../hooks/use-recordings";
import type { RecordingItem } from "@workspace/api-client-react";

function formatSeconds(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Ensure YouTube IFrame API script is loaded once
let ytApiLoaded = false;
let ytApiReady = false;
const ytReadyCallbacks: (() => void)[] = [];
function loadYTApi(cb: () => void) {
  if (ytApiReady) { cb(); return; }
  ytReadyCallbacks.push(cb);
  if (ytApiLoaded) return;
  ytApiLoaded = true;
  (window as any).onYouTubeIframeAPIReady = () => {
    ytApiReady = true;
    ytReadyCallbacks.forEach((fn) => fn());
    ytReadyCallbacks.length = 0;
  };
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
}

// ── Mix Player ────────────────────────────────────────────────────────────────
function MixPlayer({ rec }: { rec: RecordingItem }) {
  const ytDivId = `yt-mix-${rec.id}`;
  const ytPlayerRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [beatVol, setBeatVol] = useState(70);
  const [vocalVol, setVocalVol] = useState(85);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const servingUrl = `/api/storage${rec.objectPath}`;

  // Boot up YT player
  useEffect(() => {
    loadYTApi(() => {
      if (ytPlayerRef.current) return;
      ytPlayerRef.current = new (window as any).YT.Player(ytDivId, {
        videoId: rec.beatVideoId,
        playerVars: { autoplay: 0, controls: 0, modestbranding: 1, rel: 0 },
        events: {
          onReady: () => {
            ytPlayerRef.current.setVolume(70);
            setReady(true);
          },
        },
      });
    });
    return () => {
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch (_) {}
        ytPlayerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync beat volume
  useEffect(() => {
    if (ytPlayerRef.current && ready) ytPlayerRef.current.setVolume(beatVol);
  }, [beatVol, ready]);

  // Sync vocal volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = vocalVol / 100;
  }, [vocalVol]);

  const startTick = useCallback(() => {
    if (tickRef.current) return;
    tickRef.current = setInterval(() => {
      const a = audioRef.current;
      if (a) {
        setCurrentTime(a.currentTime);
        if (!duration && a.duration && isFinite(a.duration)) setDuration(a.duration);
      }
    }, 250);
  }, [duration]);

  const stopTick = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  const handlePlay = useCallback(() => {
    if (!ready) return;
    const a = audioRef.current;
    if (!a) return;
    ytPlayerRef.current.playVideo();
    a.play().catch(() => {});
    setPlaying(true);
    startTick();
  }, [ready, startTick]);

  const handlePause = useCallback(() => {
    ytPlayerRef.current?.pauseVideo?.();
    audioRef.current?.pause();
    setPlaying(false);
    stopTick();
  }, [stopTick]);

  const handleToggle = useCallback(() => {
    playing ? handlePause() : handlePlay();
  }, [playing, handlePlay, handlePause]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = t;
    ytPlayerRef.current?.seekTo?.(t, true);
    setCurrentTime(t);
  }, []);

  // Stop when vocal ends
  const handleEnded = useCallback(() => {
    ytPlayerRef.current?.pauseVideo?.();
    setPlaying(false);
    stopTick();
    setCurrentTime(0);
    if (audioRef.current) audioRef.current.currentTime = 0;
    ytPlayerRef.current?.seekTo?.(0, true);
  }, [stopTick]);

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex flex-col gap-3">
      <div className="flex items-center gap-2 mb-0.5">
        <Layers className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-bold uppercase tracking-widest text-primary">Mix Monitor</span>
        {!ready && <Loader2 className="w-3 h-3 animate-spin text-text-muted ml-auto" />}
      </div>

      {/* Hidden YT iframe + vocal audio */}
      <div id={ytDivId} className="hidden" />
      <audio
        ref={audioRef}
        src={servingUrl}
        onEnded={handleEnded}
        onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration)}
        preload="metadata"
      />

      {/* Playhead */}
      <div className="flex flex-col gap-1">
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1.5 rounded-full accent-primary cursor-pointer"
          style={{
            background: `linear-gradient(to right, var(--color-primary) ${pct}%, rgba(255,255,255,0.1) ${pct}%)`,
          }}
        />
        <div className="flex justify-between text-[10px] text-text-muted font-mono">
          <span>{formatSeconds(Math.floor(currentTime))}</span>
          <span>{duration ? formatSeconds(Math.floor(duration)) : "--:--"}</span>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleToggle}
          disabled={!ready}
          className="w-9 h-9 rounded-full bg-primary hover:bg-primary/80 disabled:opacity-40 flex items-center justify-center transition-all shrink-0 shadow-lg shadow-primary/25"
        >
          {playing
            ? <Pause className="w-4 h-4 text-white fill-white" />
            : <Play className="w-4 h-4 text-white fill-white translate-x-0.5" />}
        </button>

        {/* Beat volume */}
        <div className="flex items-center gap-1.5 flex-1">
          <Music2 className="w-3 h-3 text-primary shrink-0" />
          <span className="text-[10px] text-text-muted w-7 shrink-0">Beat</span>
          <input
            type="range" min={0} max={100} value={beatVol}
            onChange={(e) => setBeatVol(Number(e.target.value))}
            className="flex-1 h-1 accent-primary cursor-pointer"
          />
          <span className="text-[10px] text-text-muted font-mono w-7 text-right shrink-0">{beatVol}%</span>
        </div>
      </div>

      {/* Vocal volume */}
      <div className="flex items-center gap-1.5 pl-12">
        <Mic className="w-3 h-3 text-red-400 shrink-0" />
        <span className="text-[10px] text-text-muted w-7 shrink-0">Vocal</span>
        <input
          type="range" min={0} max={100} value={vocalVol}
          onChange={(e) => setVocalVol(Number(e.target.value))}
          className="flex-1 h-1 accent-red-500 cursor-pointer"
        />
        <Volume2 className="w-3 h-3 text-text-muted shrink-0" />
        <span className="text-[10px] text-text-muted font-mono w-7 text-right shrink-0">{vocalVol}%</span>
      </div>
    </div>
  );
}

// ── Recording Card ────────────────────────────────────────────────────────────
function RecordingCard({ rec }: { rec: RecordingItem }) {
  const [mixOpen, setMixOpen] = useState(false);
  const deleteRecording = useDeleteRecording();
  const servingUrl = `/api/storage${rec.objectPath}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3"
    >
      {/* Beat info */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-border">
          <img src={rec.beatThumbnailUrl} alt={rec.beatTitle} className="w-full h-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-text-main text-sm font-semibold truncate">{rec.beatTitle}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Music2 className="w-3 h-3 text-primary shrink-0" />
            <p className="text-xs text-text-muted truncate">{rec.beatChannelName}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-text-muted">{formatDate(rec.createdAt)}</p>
          <p className="text-xs text-text-muted mt-0.5 font-mono">{formatSeconds(rec.durationSeconds)}</p>
        </div>
      </div>

      {/* Vocal-only playback */}
      <div className="rounded-xl p-3 border bg-background border-border">
        <div className="flex items-center gap-2 mb-2">
          <Mic className="w-3 h-3 text-red-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Vocal only</span>
        </div>
        <audio
          src={servingUrl}
          controls
          className="w-full h-8"
          style={{ accentColor: "#ef4444" }}
        />
      </div>

      {/* Mix monitor toggle */}
      <button
        onClick={() => setMixOpen((v) => !v)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
          mixOpen
            ? "bg-primary/10 text-primary border-primary/30"
            : "bg-surface hover:bg-surface-hover text-text-muted hover:text-text-main border-border hover:border-primary/30"
        }`}
      >
        <Layers className="w-3.5 h-3.5" />
        {mixOpen ? "Hide Mix Monitor" : "Play with Beat"}
      </button>

      {mixOpen && <MixPlayer rec={rec} />}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <a
          href={servingUrl}
          download={`${rec.beatTitle} - freestyle`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-text-muted hover:text-text-main border border-border hover:border-primary/30 transition-all"
        >
          <Download className="w-3.5 h-3.5" />
          Download
        </a>
        <a
          href={`https://youtube.com/watch?v=${rec.beatVideoId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-text-muted hover:text-primary border border-border hover:border-primary/30 transition-all"
        >
          <Play className="w-3.5 h-3.5" />
          Open beat
        </a>
        <button
          onClick={() => deleteRecording.mutate(rec.id)}
          disabled={deleteRecording.isPending}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-text-muted hover:text-red-400 border border-border hover:border-red-500/20 transition-all disabled:opacity-50"
        >
          {deleteRecording.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
          Delete
        </button>
      </div>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Recordings() {
  const { data: recordings, isLoading } = useRecordings();

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
            <Link href="/">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer">
                <Tv2 className="w-3.5 h-3.5" />Feed
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
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-semibold bg-primary/15 text-primary border border-primary/20">
              <Mic className="w-3.5 h-3.5" />Recordings
            </span>
            <Link href="/saved">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer">
                <Bookmark className="w-3.5 h-3.5" />Saved
              </span>
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-text-main flex items-center gap-2">
              <Cloud className="w-6 h-6 text-blue-400" />
              Cloud Recordings
            </h2>
            <p className="text-text-muted text-sm mt-1">
              Your freestyle recordings — hit "Play with Beat" to hear the mix
            </p>
          </div>
          {recordings && recordings.length > 0 && (
            <span className="text-xs text-text-muted bg-surface border border-border px-2.5 py-1 rounded-full">
              {recordings.length} recording{recordings.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20 gap-3 text-text-muted">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading recordings…</span>
          </div>
        )}

        {!isLoading && (!recordings || recordings.length === 0) && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-full bg-surface border border-border flex items-center justify-center mb-6">
              <Mic className="w-9 h-9 text-text-muted/40" />
            </div>
            <h3 className="text-xl font-bold text-text-main mb-2">No recordings yet</h3>
            <p className="text-text-muted max-w-sm text-sm leading-relaxed mb-6">
              Open any beat, hit Record, freestyle over it, then tap "Save to cloud" to store it here.
            </p>
            <Link href="/beats">
              <span className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all shadow-lg shadow-primary/20 cursor-pointer">
                <Music2 className="w-4 h-4" />
                Go to Beats
              </span>
            </Link>
          </div>
        )}

        {!isLoading && recordings && recordings.length > 0 && (
          <div className="flex flex-col gap-4">
            {recordings.map((rec) => (
              <RecordingCard key={rec.id} rec={rec} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
