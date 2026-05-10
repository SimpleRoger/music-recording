import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import {
  FolderOpen, Music2, FileText, Mic, Wand2, Bookmark,
  Sliders, Plus, Loader2, Trash2, CloudUpload, Calendar, Layers,
  Play, Pause, SkipBack, X, ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ── YouTube IFrame API ─────────────────────────────────────────────────────────
let _ytLoaded = false, _ytReady = false;
const _ytCbs: (() => void)[] = [];
function loadYT(cb: () => void) {
  if ((window as any).YT?.Player) { cb(); return; }
  if (_ytReady) { cb(); return; }
  _ytCbs.push(cb);
  if (_ytLoaded) return;
  _ytLoaded = true;
  const prev = (window as any).onYouTubeIframeAPIReady;
  (window as any).onYouTubeIframeAPIReady = () => {
    _ytReady = true;
    if (typeof prev === "function") prev();
    _ytCbs.forEach((f) => f()); _ytCbs.length = 0;
  };
  if (document.querySelector('script[src*="youtube.com/iframe_api"]')) return;
  const s = document.createElement("script");
  s.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(s);
}

const LANE_COLORS = ["#ef4444", "#22c55e", "#8b5cf6"];

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────
type ProjectLane = {
  id: number;
  name: string;
  color: string;
  muted: boolean;
  volume: number;
  startOffset: number;
  durationSec: number;
  objectPath: string | null;
  mime: string;
};

type SavedProject = {
  id: number;
  name: string;
  beatVideoId: string;
  beatTitle: string;
  beatChannelName: string;
  beatThumbnailUrl: string;
  lanes: ProjectLane[];
  createdAt: string;
  updatedAt: string;
};

// ── Preview Modal ─────────────────────────────────────────────────────────────
function ProjectPreviewModal({ project, onClose }: { project: SavedProject; onClose: () => void }) {
  const ytRef = useRef<any>(null);
  const audioRefs = useRef<HTMLAudioElement[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const baseRef = useRef(0);
  const timeRef = useRef(0);
  const schedRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [ytReady, setYtReady] = useState(false);
  const [time, setTime] = useState(0);

  const activeLanes = project.lanes.filter((l) => l.objectPath);

  useEffect(() => {
    loadYT(() => {
      ytRef.current = new (window as any).YT.Player("preview-yt-player", {
        videoId: project.beatVideoId,
        playerVars: { autoplay: 0, controls: 0, modestbranding: 1, rel: 0 },
        events: { onReady: () => setYtReady(true) },
      });
    });
    return () => {
      stopAll(false);
      try { ytRef.current?.destroy?.(); } catch {}
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function stopAll(resetTime = true) {
    schedRefs.current.forEach(clearTimeout);
    schedRefs.current = [];
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { ytRef.current?.pauseVideo?.(); if (resetTime) ytRef.current?.seekTo?.(0, true); } catch {}
    audioRefs.current.forEach((a) => { if (a) { a.pause(); if (resetTime) a.currentTime = 0; } });
    if (resetTime) { setTime(0); timeRef.current = 0; }
    setIsPlaying(false);
  }

  function handlePlay() {
    if (isPlaying) return;
    const t = timeRef.current;
    try { ytRef.current?.seekTo?.(t, true); ytRef.current?.playVideo?.(); } catch {}
    activeLanes.forEach((lane, i) => {
      const delay = Math.max(0, (lane.startOffset ?? 0) - t) * 1000;
      const audioStart = Math.max(0, t - (lane.startOffset ?? 0));
      const id = setTimeout(() => {
        const el = audioRefs.current[i];
        if (el) {
          el.currentTime = audioStart;
          el.volume = lane.muted ? 0 : (lane.volume ?? 80) / 100;
          el.play().catch(() => {});
        }
      }, delay);
      schedRefs.current.push(id);
    });
    baseRef.current = Date.now() - t * 1000;
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - baseRef.current) / 1000;
      timeRef.current = elapsed;
      setTime(elapsed);
    }, 50);
    setIsPlaying(true);
  }

  function handlePause() {
    stopAll(false);
  }

  function handleStop() {
    stopAll(true);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        className="bg-[#111] border border-[#2a2a2a] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hidden YT player - replaced by iframe by the API */}
        <div
          id="preview-yt-player"
          style={{ width: 1, height: 1, position: "absolute", top: -9999, left: -9999, opacity: 0, pointerEvents: "none" }}
        />

        {/* Preloaded audio elements */}
        {activeLanes.map((lane, i) => (
          <audio
            key={lane.id}
            ref={(el) => { if (el) audioRefs.current[i] = el; }}
            src={`/api/storage${lane.objectPath}`}
            preload="auto"
          />
        ))}

        {/* Thumbnail header */}
        <div className="relative">
          <img
            src={project.beatThumbnailUrl}
            alt={project.name}
            className="w-full aspect-video object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-black/60 hover:bg-black/90 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Giant play/pause button overlaid on thumbnail */}
          <div className="absolute inset-0 flex items-center justify-center">
            {isPlaying ? (
              <button
                onClick={handlePause}
                className="p-4 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all backdrop-blur-sm border border-white/10"
              >
                <Pause className="w-8 h-8" />
              </button>
            ) : (
              <button
                onClick={handlePlay}
                disabled={!ytReady}
                className="p-4 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all backdrop-blur-sm border border-white/10 disabled:opacity-40"
              >
                {ytReady
                  ? <Play className="w-8 h-8" fill="currentColor" style={{ transform: "translateX(2px)" }} />
                  : <Loader2 className="w-8 h-8 animate-spin" />
                }
              </button>
            )}
          </div>

          {/* Title overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <p className="font-bold text-white text-sm leading-tight truncate mb-0.5">{project.name}</p>
            <p className="text-gray-400 text-xs truncate">{project.beatChannelName}</p>
          </div>
        </div>

        {/* Controls bar */}
        <div className="px-4 pt-3 pb-1 flex items-center gap-2 border-b border-[#1e1e1e]">
          <button
            onClick={handleStop}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-600 hover:text-white transition-colors"
            title="Stop & rewind"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-sm text-gray-400 tabular-nums">{fmtTime(time)}</span>
          <div className="flex-1" />
          <Link href={`/daw?project=${project.id}`}>
            <span
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2a2a2a] hover:border-primary/40 text-xs text-gray-500 hover:text-white transition-colors cursor-pointer"
              onClick={onClose}
            >
              <ExternalLink className="w-3 h-3" />
              Open in DAW
            </span>
          </Link>
        </div>

        {/* Lane progress bars */}
        <div className="p-4">
          {activeLanes.length > 0 ? (
            <div className="space-y-3">
              {activeLanes.map((lane, i) => {
                const laneStart = lane.startOffset ?? 0;
                const laneDur = lane.durationSec ?? 0;
                const laneActive = isPlaying && time >= laneStart;
                const progress = laneDur > 0
                  ? Math.min(1, Math.max(0, (time - laneStart) / laneDur))
                  : 0;
                const laneColor = lane.color || LANE_COLORS[lane.id % 3];

                return (
                  <div key={lane.id} className="flex items-center gap-2.5">
                    <div
                      className="w-2 h-2 rounded-full shrink-0 transition-opacity"
                      style={{ backgroundColor: laneColor, opacity: laneActive ? 1 : 0.3 }}
                    />
                    <span className="text-[11px] text-gray-500 w-16 shrink-0 truncate">{lane.name}</span>
                    <div className="flex-1 h-1.5 bg-[#222] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          backgroundColor: laneColor,
                          width: `${progress * 100}%`,
                          opacity: laneActive ? 0.8 : 0,
                          transition: laneActive ? "width 0.05s linear" : "none",
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-700 shrink-0 tabular-nums w-7 text-right">
                      {Math.round(laneDur)}s
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-2 text-gray-700 text-xs">
              <Mic className="w-3.5 h-3.5" />
              Beat only — no vocals recorded yet
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Home Page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [previewProject, setPreviewProject] = useState<SavedProject | null>(null);

  useEffect(() => {
    fetch("/api/daw/projects")
      .then((r) => r.json())
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await fetch(`/api/daw/projects/${id}`, { method: "DELETE" });
      setProjects((p) => p.filter((proj) => proj.id !== id));
      if (previewProject?.id === id) setPreviewProject(null);
    } catch { /* ignore */ }
    setDeletingId(null);
  }

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      {/* Topbar */}
      <header className="h-16 border-b border-border glass-panel sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6 gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-3 shrink-0">
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
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-semibold bg-primary/15 text-primary border border-primary/20">
              <FolderOpen className="w-3.5 h-3.5" />Projects
            </span>
            <Link href="/beats">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer">
                <Music2 className="w-3.5 h-3.5" />Beats
              </span>
            </Link>
            <Link href="/daw">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer">
                <Sliders className="w-3.5 h-3.5" />DAW
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
            <Link href="/saved">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer">
                <Bookmark className="w-3.5 h-3.5" />Saved
              </span>
            </Link>
          </nav>
        </div>

        <Link href="/beats">
          <span className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg font-medium text-sm transition-all shadow-[0_0_15px_rgba(255,0,0,0.3)] hover:shadow-[0_0_20px_rgba(255,0,0,0.5)] cursor-pointer">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Project</span>
          </span>
        </Link>
      </header>

      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1800px] w-full mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-2xl font-display font-bold text-text-main flex items-center gap-3">
            <FolderOpen className="w-6 h-6 text-primary" />
            DAW Projects
          </h2>
          {projects.length > 0 && (
            <span className="text-sm text-text-muted">{projects.length} project{projects.length !== 1 ? "s" : ""}</span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64 gap-3 text-text-muted">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading projects…</span>
          </div>
        ) : projects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center px-4"
          >
            <div className="w-24 h-24 bg-surface rounded-full flex items-center justify-center mb-6 shadow-2xl border border-border">
              <CloudUpload className="w-12 h-12 text-border-hover" />
            </div>
            <h2 className="text-3xl font-display font-bold text-text-main mb-3">No projects yet</h2>
            <p className="text-text-muted max-w-md mb-8 text-lg">
              Pick a beat, record your vocals in the DAW, and save your project — it'll show up here.
            </p>
            <Link href="/beats">
              <span className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 cursor-pointer">
                <Music2 className="w-5 h-5" />
                Browse Beats
              </span>
            </Link>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-6">
            {projects.map((proj, index) => {
              const recordedCount = proj.lanes.filter((l) => l.objectPath).length;
              return (
                <motion.div
                  key={proj.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: Math.min(index * 0.05, 0.4), ease: "easeOut" }}
                  className="group bg-surface border border-border rounded-2xl overflow-hidden hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all"
                >
                  {/* Thumbnail — click to preview */}
                  <button
                    className="relative w-full aspect-video bg-background overflow-hidden block"
                    onClick={() => setPreviewProject(proj)}
                  >
                    <img
                      src={proj.beatThumbnailUrl}
                      alt={proj.beatTitle}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                    {/* Play overlay on hover */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="p-3 rounded-full bg-black/60 backdrop-blur-sm border border-white/20">
                        <Play className="w-6 h-6 text-white" fill="currentColor" style={{ transform: "translateX(1px)" }} />
                      </div>
                    </div>

                    {recordedCount > 0 && (
                      <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/70 text-white text-xs font-bold px-2 py-1 rounded-lg backdrop-blur-sm">
                        <Layers className="w-3 h-3 text-primary" />
                        {recordedCount} track{recordedCount !== 1 ? "s" : ""}
                      </div>
                    )}
                  </button>

                  {/* Info */}
                  <div className="p-4">
                    <p className="font-bold text-text-main text-sm truncate mb-0.5">{proj.name}</p>
                    <p className="text-xs text-text-muted truncate mb-1">{proj.beatChannelName}</p>
                    <div className="flex items-center gap-1 text-[11px] text-text-muted/60 mb-4">
                      <Calendar className="w-3 h-3" />
                      {fmtDate(proj.updatedAt ?? proj.createdAt)}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setPreviewProject(proj)}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-surface-hover hover:bg-border text-text-muted hover:text-white text-xs font-medium transition-colors border border-border"
                        title="Preview"
                      >
                        <Play className="w-3.5 h-3.5" fill="currentColor" />
                        Play
                      </button>
                      <Link href={`/daw?project=${proj.id}`} className="flex-1">
                        <span className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold transition-colors cursor-pointer">
                          <FolderOpen className="w-3.5 h-3.5" />
                          Open
                        </span>
                      </Link>
                      <button
                        onClick={() => handleDelete(proj.id)}
                        disabled={deletingId === proj.id}
                        className="w-9 flex items-center justify-center rounded-xl border border-border hover:bg-red-900/30 hover:border-red-600/40 text-text-muted hover:text-red-400 disabled:opacity-50 transition-colors"
                        title="Delete project"
                      >
                        {deletingId === proj.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>

      {/* Preview Modal */}
      <AnimatePresence>
        {previewProject && (
          <ProjectPreviewModal
            project={previewProject}
            onClose={() => setPreviewProject(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
