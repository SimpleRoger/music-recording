import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import {
  Play, Square, Circle, Volume2, ArrowLeft,
  Loader2, Pause, SkipBack, Mic, ZoomIn, ZoomOut,
  CloudUpload, FolderOpen, Trash2, X, Check,
} from "lucide-react";
import type { Video } from "@workspace/api-client-react";

const BEAT_KEY = "tubefeed-daw-beat";
const LANE_COLORS = ["#ef4444", "#22c55e", "#8b5cf6"];
const LANE_NAMES  = ["Vocal 1", "Vocal 2", "Vocal 3"];
const TIMELINE_SECS = 300;
const TRACK_H = 76, RULER_H = 24, LEFT_W = 208;

// ── YouTube IFrame API ────────────────────────────────────────────────────────
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

// ── Utils ─────────────────────────────────────────────────────────────────────
function fmtTime(sec: number) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60), d = Math.floor((sec % 1) * 10);
  return `${m.toString().padStart(2,"0")}:${s.toString().padStart(2,"0")}.${d}`;
}
function fmtRuler(sec: number) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m > 0 ? `${m}:${s.toString().padStart(2,"0")}` : `${s}s`;
}
function rulerInterval(zoom: number) {
  const nice = [0.5,1,2,5,10,15,30,60,120,300];
  return nice.find((v) => v >= 70 / zoom) ?? 300;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Lane = {
  id: number; name: string; color: string;
  muted: boolean; volume: number;
  blobUrl: string | null; mime: string;
  waveform: number[]; durationSec: number;
  startOffset: number;
  objectPath: string | null; // set after cloud save/load
};
function makeLanes(): Lane[] {
  return LANE_NAMES.map((name, i) => ({
    id: i, name, color: LANE_COLORS[i],
    muted: false, volume: 80,
    blobUrl: null, mime: "audio/webm",
    waveform: [], durationSec: 0, startOffset: 0, objectPath: null,
  }));
}

type SavedProject = {
  id: number; name: string;
  beatVideoId: string; beatTitle: string;
  beatChannelName: string; beatThumbnailUrl: string;
  lanes: Array<{
    id: number; name: string; color: string;
    muted: boolean; volume: number;
    startOffset: number; durationSec: number;
    objectPath: string | null; mime: string;
  }>;
  createdAt: string; updatedAt: string;
};

// ── Waveform canvas ───────────────────────────────────────────────────────────
function WaveCanvas({ data, color, widthPx }: { data: number[]; color: string; widthPx: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || data.length === 0) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const W = c.width, H = c.height, mid = H / 2;
    ctx.clearRect(0, 0, W, H);
    const bw = W / data.length;
    ctx.fillStyle = color; ctx.globalAlpha = 0.85;
    data.forEach((v, i) => {
      const h = Math.max(2, v * mid * 1.8);
      ctx.fillRect(i * bw, mid - h / 2, Math.max(1, bw - 0.5), h);
    });
  }, [data, color, widthPx]);
  return <canvas ref={ref} width={Math.max(1, Math.round(widthPx))} height={56} style={{ width: widthPx, height: "100%" }} />;
}

const BEAT_BARS = Array.from({ length: 200 }, (_, i) =>
  30 + Math.abs(Math.sin(i * 0.37) * 52 + Math.sin(i * 0.13 + 1) * 28)
);

// ── Main DAW page ─────────────────────────────────────────────────────────────
export default function DawPage() {
  const [beat, setBeat]               = useState<Video | null>(null);
  const [lanes, setLanes]             = useState<Lane[]>(makeLanes);
  const [armedLane, setArmedLane]     = useState(-1);
  const [isPlaying, setIsPlaying]     = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [time, setTime]               = useState(0);
  const [ytReady, setYtReady]         = useState(false);
  const [micError, setMicError]       = useState(false);
  const [beatMuted, setBeatMuted]     = useState(false);
  const [zoom, setZoom]               = useState(50);
  // Save / Projects
  const [saveState, setSaveState]     = useState<"idle"|"saving"|"saved"|"error">("idle");
  const [showProjects, setShowProjects] = useState(false);
  const [projects, setProjects]       = useState<SavedProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [deletingId, setDeletingId]   = useState<number | null>(null);
  const [loadingId, setLoadingId]     = useState<number | null>(null);

  const ytRef      = useRef<any>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const baseRef    = useRef(0);
  const timeRef    = useRef(0);
  const mrRef      = useRef<MediaRecorder | null>(null);
  const chunksRef  = useRef<Blob[]>([]);
  const recLaneRef = useRef(-1);
  const audioEls   = useRef<(HTMLAudioElement | null)[]>([null, null, null]);
  const tlRef      = useRef<HTMLDivElement>(null);
  const zoomRef    = useRef(50);
  const lanesRef   = useRef(lanes);
  const schedules  = useRef<ReturnType<typeof setTimeout>[]>([]);
  const dragRef    = useRef<{ laneId: number; startX: number; origOffset: number } | null>(null);

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { lanesRef.current = lanes; }, [lanes]);

  // ── Load beat from sessionStorage on mount ──
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(BEAT_KEY);
      if (raw) { sessionStorage.removeItem(BEAT_KEY); setBeat(JSON.parse(raw)); }
    } catch { /* ignore */ }
  }, []);

  // ── Boot YouTube player whenever beat changes ──
  useEffect(() => {
    if (!beat) return;
    setYtReady(false);
    if (ytRef.current) {
      try { ytRef.current.destroy(); } catch (_) {}
      ytRef.current = null;
    }
    loadYT(() => {
      ytRef.current = new (window as any).YT.Player("daw-yt-player", {
        videoId: beat.videoId,
        playerVars: { autoplay: 0, controls: 0, modestbranding: 1, rel: 0 },
        events: { onReady: () => setYtReady(true) },
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat?.videoId]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    schedules.current.forEach(clearTimeout);
    try { ytRef.current?.destroy?.(); } catch (_) {}
  }, []);

  // ── Auto-scroll playhead ──
  useEffect(() => {
    const el = tlRef.current;
    if (!el || !isPlaying) return;
    const px = timeRef.current * zoom;
    if (px > el.scrollLeft + el.clientWidth - 60) el.scrollLeft = px - el.clientWidth / 3;
  }, [time, zoom, isPlaying]);

  // ── Drag handlers (global) ──
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const newOffset = Math.max(0, d.origOffset + dx / zoomRef.current);
      setLanes((p) => p.map((l) => l.id === d.laneId ? { ...l, startOffset: newOffset } : l));
    }
    function onUp() { dragRef.current = null; }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function clearSchedules() {
    schedules.current.forEach(clearTimeout); schedules.current = [];
  }
  function stopClock() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }
  function startClock(fromSec = 0) {
    stopClock();
    baseRef.current = Date.now() - fromSec * 1000;
    timerRef.current = setInterval(() => {
      const t = (Date.now() - baseRef.current) / 1000;
      setTime(t); timeRef.current = t;
    }, 16);
  }

  function stopAll() {
    clearSchedules(); stopClock();
    try { ytRef.current?.stopVideo?.(); } catch (_) {}
    audioEls.current.forEach((a) => { if (a) { a.pause(); a.currentTime = 0; } });
    if (mrRef.current?.state === "recording") {
      try { mrRef.current.stop(); } catch (_) {}
    }
    mrRef.current = null;
    setIsPlaying(false); setIsRecording(false);
    setTime(0); timeRef.current = 0;
  }

  function scheduleLanes(t: number, ls: Lane[]) {
    clearSchedules();
    ls.forEach((lane, i) => {
      const a = audioEls.current[i];
      if (!a || !lane.blobUrl || lane.muted) return;
      a.volume = lane.volume / 100;
      const delayMs = Math.max(0, (lane.startOffset - t) * 1000);
      const audioPos = Math.max(0, t - lane.startOffset);
      if (t < lane.startOffset) {
        a.pause();
        const tid = setTimeout(() => { a.currentTime = 0; a.play().catch(() => {}); }, delayMs);
        schedules.current.push(tid);
      } else {
        a.currentTime = Math.min(audioPos, a.duration || 0);
        a.play().catch(() => {});
      }
    });
  }

  async function decodeWaveform(blob: Blob, laneId: number) {
    try {
      const ac = new AudioContext();
      const buf = await ac.decodeAudioData(await blob.arrayBuffer());
      const raw = buf.getChannelData(0);
      const N = 300, blk = Math.floor(raw.length / N);
      const wf: number[] = [];
      for (let i = 0; i < N; i++) {
        let s = 0;
        for (let j = 0; j < blk; j++) s += Math.abs(raw[i * blk + j] || 0);
        wf.push(Math.min(1, (s / blk) * 6));
      }
      await ac.close();
      setLanes((p) => p.map((l) => l.id === laneId
        ? { ...l, waveform: wf, durationSec: buf.duration }
        : l
      ));
    } catch { /* ignore */ }
  }

  async function decodeWaveformFromUrl(url: string, laneId: number) {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      decodeWaveform(blob, laneId);
    } catch { /* ignore */ }
  }

  // ── Cloud save ───────────────────────────────────────────────────────────────
  async function uploadBlob(blobUrl: string, mime: string): Promise<string> {
    const resp = await fetch(blobUrl);
    const blob = await resp.blob();
    // Step 1: request presigned URL
    const urlRes = await fetch("/api/storage/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "vocal.webm", size: blob.size, contentType: mime }),
    });
    const { uploadURL, objectPath } = await urlRes.json();
    // Step 2: PUT directly to GCS
    await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": mime }, body: blob });
    return objectPath as string;
  }

  async function handleSave() {
    if (!beat) return;
    setSaveState("saving");
    try {
      // Upload all recorded lanes in parallel
      const lanesSave = await Promise.all(
        lanesRef.current.map(async (lane) => {
          let objectPath = lane.objectPath;
          if (lane.blobUrl && lane.blobUrl.startsWith("blob:")) {
            objectPath = await uploadBlob(lane.blobUrl, lane.mime);
          }
          return {
            id: lane.id,
            name: lane.name,
            color: lane.color,
            muted: lane.muted,
            volume: lane.volume,
            startOffset: lane.startOffset,
            durationSec: lane.durationSec,
            objectPath: objectPath ?? null,
            mime: lane.mime,
          };
        })
      );
      // Persist objectPaths back to state so subsequent saves skip re-upload
      setLanes((p) => p.map((l) => {
        const saved = lanesSave.find((s) => s.id === l.id);
        return saved ? { ...l, objectPath: saved.objectPath } : l;
      }));
      const name = `${beat.title.slice(0, 40)} | ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
      await fetch("/api/daw/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          beatVideoId: beat.videoId,
          beatTitle: beat.title,
          beatChannelName: beat.channelName,
          beatThumbnailUrl: beat.thumbnailUrl,
          lanes: lanesSave,
        }),
      });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 3000);
      // Refresh projects list if panel is open
      if (showProjects) fetchProjects();
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    }
  }

  // ── Projects panel ───────────────────────────────────────────────────────────
  async function fetchProjects() {
    setProjectsLoading(true);
    try {
      const res = await fetch("/api/daw/projects");
      setProjects(await res.json());
    } catch { /* ignore */ }
    setProjectsLoading(false);
  }

  function openProjects() {
    setShowProjects(true);
    fetchProjects();
  }

  async function handleLoadProject(project: SavedProject) {
    setLoadingId(project.id);
    stopAll();
    // Restore beat
    const newBeat: Video = {
      videoId: project.beatVideoId,
      title: project.beatTitle,
      channelName: project.beatChannelName,
      thumbnailUrl: project.beatThumbnailUrl,
      description: "",
      publishedAt: new Date().toISOString(),
      channelId: "",
    };
    setBeat(newBeat);
    setArmedLane(-1);
    // Restore lanes (objectPaths → blobUrls)
    const restoredLanes: Lane[] = LANE_NAMES.map((name, i) => {
      const saved = project.lanes.find((l) => l.id === i);
      const audioUrl = saved?.objectPath ? `/api/storage${saved.objectPath}` : null;
      return {
        id: i, name: saved?.name ?? name, color: saved?.color ?? LANE_COLORS[i],
        muted: saved?.muted ?? false, volume: saved?.volume ?? 80,
        blobUrl: audioUrl,
        mime: saved?.mime ?? "audio/webm",
        waveform: [], durationSec: saved?.durationSec ?? 0,
        startOffset: saved?.startOffset ?? 0,
        objectPath: saved?.objectPath ?? null,
      };
    });
    setLanes(restoredLanes);
    // Decode waveforms in background
    restoredLanes.forEach((lane) => {
      if (lane.blobUrl) decodeWaveformFromUrl(lane.blobUrl, lane.id);
    });
    setLoadingId(null);
    setShowProjects(false);
  }

  async function handleDeleteProject(id: number) {
    setDeletingId(id);
    try {
      await fetch(`/api/daw/projects/${id}`, { method: "DELETE" });
      setProjects((p) => p.filter((proj) => proj.id !== id));
    } catch { /* ignore */ }
    setDeletingId(null);
  }

  // ── Transport ─────────────────────────────────────────────────────────────────
  async function handleRecord() {
    if (armedLane < 0 || !ytReady) return;
    stopAll(); setMicError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime   = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const mr     = new MediaRecorder(stream, { mimeType: mime });
      mrRef.current = mr; chunksRef.current = []; recLaneRef.current = armedLane;
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        const url  = URL.createObjectURL(blob);
        const lid  = recLaneRef.current;
        setLanes((p) => p.map((l) => l.id === lid
          ? { ...l, blobUrl: url, mime, startOffset: 0, objectPath: null }
          : l
        ));
        stream.getTracks().forEach((t) => t.stop());
        decodeWaveform(blob, lid);
      };
      mr.start(100);
      ytRef.current.seekTo(0, true); ytRef.current.playVideo();
      if (beatMuted) ytRef.current.mute();
      startClock(0);
      setIsRecording(true); setIsPlaying(true);
    } catch { setMicError(true); }
  }

  function handlePlay() {
    if (isPlaying) return;
    const t = timeRef.current;
    try { ytRef.current?.seekTo?.(t, true); ytRef.current?.playVideo?.(); } catch (_) {}
    scheduleLanes(t, lanesRef.current);
    startClock(t); setIsPlaying(true);
  }

  function handlePause() {
    clearSchedules(); stopClock();
    try { ytRef.current?.pauseVideo?.(); } catch (_) {}
    audioEls.current.forEach((a) => { if (a) a.pause(); });
    setIsPlaying(false);
  }

  function seekTo(sec: number) {
    const t = Math.max(0, Math.min(sec, TIMELINE_SECS));
    setTime(t); timeRef.current = t;
    if (isPlaying) {
      try { ytRef.current?.seekTo?.(t, true); } catch (_) {}
      scheduleLanes(t, lanesRef.current);
      baseRef.current = Date.now() - t * 1000;
    }
  }

  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    if (isRecording) return;
    const el = tlRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    seekTo((e.clientX - rect.left + el.scrollLeft) / zoom);
  }

  // ── Ruler ────────────────────────────────────────────────────────────────────
  const interval   = rulerInterval(zoom);
  const tickCount  = Math.ceil(TIMELINE_SECS / interval) + 1;
  const ticks      = Array.from({ length: tickCount }, (_, i) => i * interval);
  const totalWidth = TIMELINE_SECS * zoom;
  const playheadPx = time * zoom;

  const hasAnyRecording = lanes.some((l) => l.blobUrl !== null);

  if (!beat) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex flex-col items-center justify-center gap-4 text-white">
        <Mic className="w-12 h-12 text-gray-600" />
        <p className="text-gray-400 text-sm">No beat loaded.</p>
        <p className="text-gray-600 text-xs">Go to Beats, open a beat, then click "Open DAW".</p>
        <div className="flex gap-3 mt-2">
          <Link href="/beats">
            <span className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-sm cursor-pointer transition-colors">
              Browse Beats
            </span>
          </Link>
          <button
            onClick={openProjects}
            className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-sm transition-colors flex items-center gap-2"
          >
            <FolderOpen className="w-4 h-4" /> Open Saved Project
          </button>
        </div>
        {/* Projects panel (no-beat state) */}
        {showProjects && (
          <ProjectsPanel
            projects={projects} loading={projectsLoading}
            deletingId={deletingId} loadingId={loadingId}
            onClose={() => setShowProjects(false)}
            onLoad={handleLoadProject} onDelete={handleDeleteProject}
          />
        )}
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0e0e0e] flex flex-col font-sans text-white select-none overflow-hidden">

      {/* ── Transport bar ── */}
      <div className="h-14 bg-[#1c1c1c] border-b border-[#333] flex items-center px-4 gap-3 shrink-0">
        <Link href="/beats">
          <span className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors cursor-pointer">
            <ArrowLeft className="w-3.5 h-3.5" />Beats
          </span>
        </Link>
        <div className="w-px h-5 bg-[#333]" />

        {/* Playback controls */}
        <div className="flex items-center gap-1">
          <button onClick={stopAll} title="Stop / Rewind" className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <SkipBack className="w-4 h-4 text-gray-400" />
          </button>
          {isPlaying ? (
            <button onClick={handlePause} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
              <Pause className="w-4 h-4 text-white" />
            </button>
          ) : (
            <button onClick={handlePlay} disabled={!ytReady} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-40">
              <Play className="w-4 h-4 text-white" />
            </button>
          )}
          <button onClick={stopAll} className="p-2 rounded-lg hover:bg-white/10 transition-colors" title="Stop">
            <Square className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={handleRecord}
            disabled={armedLane < 0 || !ytReady}
            title={armedLane < 0 ? "Arm a lane first" : "Record"}
            className={`p-2 rounded-lg transition-colors disabled:opacity-40 ${
              isRecording ? "bg-red-600 shadow-lg shadow-red-900/50" : "bg-red-900/30 hover:bg-red-600/50"
            }`}
          >
            <Circle className="w-4 h-4 text-red-400" fill={isRecording ? "currentColor" : "none"} />
          </button>
        </div>

        {/* Time display */}
        <div className="font-mono text-lg text-white tabular-nums bg-black/40 px-3 py-1 rounded-lg border border-[#2a2a2a] min-w-[90px] text-center">
          {fmtTime(time)}
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom((z) => Math.max(8, z * 0.6))} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <ZoomOut className="w-4 h-4 text-gray-400" />
          </button>
          <span className="text-[10px] text-gray-600 w-12 text-center tabular-nums">{Math.round(zoom)}px/s</span>
          <button onClick={() => setZoom((z) => Math.min(400, z * 1.667))} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <ZoomIn className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Beat info */}
        <div className="flex items-center gap-2 ml-1 min-w-0 flex-1">
          <img src={beat.thumbnailUrl} className="w-8 h-8 rounded object-cover shrink-0 border border-[#333]" alt="" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white/90 truncate leading-tight">{beat.title}</p>
            <p className="text-[10px] text-gray-500 truncate">{beat.channelName}</p>
          </div>
        </div>

        {/* Status + Save + Projects */}
        <div className="shrink-0 flex items-center gap-2">
          {!ytReady && <span className="flex items-center gap-1 text-gray-500 text-xs"><Loader2 className="w-3 h-3 animate-spin" />Loading…</span>}
          {micError && <span className="text-red-400 text-xs">Mic denied</span>}
          {isRecording && <span className="flex items-center gap-1.5 text-red-400 font-bold text-xs animate-pulse"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />REC</span>}

          {/* Projects button */}
          <button
            onClick={openProjects}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-white/10 border border-[#2a2a2a] text-gray-400 hover:text-white transition-colors text-xs"
          >
            <FolderOpen className="w-3.5 h-3.5" />Projects
          </button>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={!hasAnyRecording || saveState === "saving"}
            title={!hasAnyRecording ? "Record something first" : "Save project to cloud"}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs transition-colors disabled:opacity-40 ${
              saveState === "saved" ? "bg-green-600 text-white" :
              saveState === "error" ? "bg-red-600 text-white" :
              saveState === "saving" ? "bg-blue-600/50 text-blue-300" :
              "bg-blue-600 hover:bg-blue-500 text-white"
            }`}
          >
            {saveState === "saving" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
             saveState === "saved"  ? <Check className="w-3.5 h-3.5" /> :
             <CloudUpload className="w-3.5 h-3.5" />}
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved!" : saveState === "error" ? "Error" : "Save"}
          </button>
        </div>
      </div>

      {/* ── Main track area ── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Left panels */}
        <div className="shrink-0 flex flex-col border-r border-[#2a2a2a] bg-[#161616]" style={{ width: LEFT_W }}>
          <div className="shrink-0 border-b border-[#2a2a2a] flex items-center px-3" style={{ height: RULER_H }}>
            <span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">Track</span>
          </div>

          {/* Beat panel */}
          <div className="shrink-0 flex items-center gap-2 px-3 bg-[#1a1a1a] border-b border-[#2a2a2a]" style={{ height: TRACK_H }}>
            <img src={beat.thumbnailUrl} className="w-9 h-9 rounded-lg object-cover shrink-0 border border-[#333]" alt="" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-gray-300 truncate">Beat</p>
              <p className="text-[10px] text-gray-600 truncate">{beat.channelName}</p>
            </div>
            <button
              onClick={() => {
                const next = !beatMuted; setBeatMuted(next);
                try { next ? ytRef.current?.mute?.() : ytRef.current?.unMute?.(); } catch (_) {}
              }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all shrink-0 border"
              style={beatMuted
                ? { backgroundColor: "rgba(234,179,8,0.15)", borderColor: "rgba(234,179,8,0.4)", color: "#eab308" }
                : { borderColor: "#2a2a2a", color: "#555" }}
            >M</button>
          </div>

          {/* Lane panels */}
          {lanes.map((lane) => (
            <div
              key={lane.id}
              className="shrink-0 flex items-center gap-2 px-3 border-b border-[#222] transition-colors"
              style={{ height: TRACK_H, backgroundColor: armedLane === lane.id ? `${lane.color}0a` : "#181818" }}
            >
              <button
                onClick={() => setArmedLane((p) => p === lane.id ? -1 : lane.id)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0 border"
                style={armedLane === lane.id ? { backgroundColor: "#dc2626", borderColor: "#ef4444" } : { borderColor: "#2a2a2a", color: "#666" }}
              >
                <Circle className="w-3 h-3" style={{ color: armedLane === lane.id ? "white" : "#666" }} fill={armedLane === lane.id ? "white" : "none"} />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold truncate mb-1" style={{ color: lane.blobUrl ? lane.color : "#ccc" }}>{lane.name}</p>
                <div className="flex items-center gap-1">
                  <Volume2 className="w-2.5 h-2.5 text-gray-700 shrink-0" />
                  <input
                    type="range" min={0} max={100} value={lane.volume}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setLanes((p) => p.map((l) => l.id === lane.id ? { ...l, volume: v } : l));
                      const a = audioEls.current[lane.id]; if (a) a.volume = v / 100;
                    }}
                    className="flex-1 h-1 cursor-pointer min-w-0" style={{ accentColor: lane.color }}
                  />
                  <span className="text-[9px] text-gray-600 w-6 text-right shrink-0">{lane.volume}</span>
                </div>
              </div>
              <button
                onClick={() => setLanes((p) => p.map((l) => l.id === lane.id ? { ...l, muted: !l.muted } : l))}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all shrink-0 border"
                style={lane.muted
                  ? { backgroundColor: "rgba(234,179,8,0.15)", borderColor: "rgba(234,179,8,0.4)", color: "#eab308" }
                  : { borderColor: "#2a2a2a", color: "#555" }}
              >M</button>
            </div>
          ))}
        </div>

        {/* Scrollable timeline */}
        <div
          ref={tlRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative"
          style={{ cursor: isRecording ? "not-allowed" : "crosshair" }}
        >
          <div style={{ width: totalWidth, position: "relative", minHeight: "100%" }}>

            {/* Ruler */}
            <div
              className="sticky top-0 z-20 bg-[#161616] border-b border-[#2a2a2a] overflow-hidden"
              style={{ height: RULER_H }}
              onClick={handleTimelineClick}
            >
              {ticks.map((sec) => (
                <div key={sec} className="absolute top-0" style={{ left: sec * zoom }}>
                  <div className="w-px bg-[#3a3a3a]" style={{ height: RULER_H }} />
                  <span className="text-[9px] text-gray-500 absolute top-1" style={{ left: 2 }}>{fmtRuler(sec)}</span>
                </div>
              ))}
              {interval >= 2 && ticks.flatMap((sec) =>
                Array.from({ length: 4 }, (_, j) => sec + interval * (j + 1) / 5)
                  .filter((s) => s < TIMELINE_SECS)
                  .map((s) => (
                    <div key={`sub-${s}`} className="absolute bottom-0 w-px bg-[#2a2a2a]" style={{ left: s * zoom, height: 6 }} />
                  ))
              )}
            </div>

            {/* Click-to-seek overlay */}
            <div className="absolute z-10" style={{ top: RULER_H, left: 0, right: 0, bottom: 0 }} onClick={handleTimelineClick} />

            {/* Beat clip row */}
            <div className="relative border-b border-[#2a2a2a] overflow-hidden" style={{ height: TRACK_H, backgroundColor: "rgba(127,29,29,0.2)" }}>
              <div id="daw-yt-player" className="hidden absolute" />
              <div className="absolute inset-0 flex items-center px-2">
                <div className="flex w-full items-center gap-[1px]" style={{ height: 52 }}>
                  {BEAT_BARS.map((h, i) => (
                    <div key={i} className="flex-1 rounded-[1px]" style={{
                      height: `${h}%`, minWidth: 1,
                      backgroundColor: `rgba(239,68,68,${isPlaying ? 0.45 + Math.sin(i * 0.5 + time * 6) * 0.08 : 0.4})`,
                    }} />
                  ))}
                </div>
              </div>
              <div className="absolute top-1.5 left-3 z-10 flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-red-400 bg-black/50 px-1.5 py-0.5 rounded">Beat</span>
                <span className="text-[10px] text-gray-500 truncate max-w-[180px]">{beat.title}</span>
              </div>
            </div>

            {/* Lane clip rows */}
            {lanes.map((lane, i) => {
              const clipW = lane.durationSec > 0 ? lane.durationSec * zoom : 120;
              const clipLeft = lane.startOffset * zoom;
              return (
                <div
                  key={lane.id}
                  className="relative border-b border-[#1e1e1e]"
                  style={{ height: TRACK_H, backgroundColor: armedLane === lane.id ? `${lane.color}06` : "#141414" }}
                >
                  {lane.blobUrl ? (
                    <>
                      <div
                        className="absolute z-20"
                        style={{ top: 8, bottom: 8, left: clipLeft, width: clipW }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          dragRef.current = { laneId: lane.id, startX: e.clientX, origOffset: lane.startOffset };
                        }}
                      >
                        <div
                          className="w-full h-full rounded-lg overflow-hidden flex items-center px-2"
                          style={{
                            backgroundColor: `${lane.color}14`,
                            border: `1px solid ${lane.color}40`,
                            cursor: "grab",
                          }}
                        >
                          <WaveCanvas data={lane.waveform} color={lane.color} widthPx={Math.max(1, clipW - 16)} />
                        </div>
                        <div className="absolute top-1.5 left-2.5 flex items-center gap-1 z-10 pointer-events-none">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: lane.color, backgroundColor: `${lane.color}25` }}>
                            {lane.name}
                          </span>
                          {lane.durationSec > 0 && <span className="text-[10px] text-gray-600">{lane.durationSec.toFixed(1)}s</span>}
                          {lane.objectPath && <span className="text-[9px] text-blue-400/60">☁</span>}
                        </div>
                      </div>
                      <audio ref={(el) => { audioEls.current[i] = el; }} src={lane.blobUrl} preload="auto" />
                    </>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      {armedLane === lane.id ? (
                        <p className="text-xs font-semibold" style={{ color: lane.color }}>
                          {isRecording ? "● Recording…" : "Armed — press ● Record"}
                        </p>
                      ) : (
                        <p className="text-[11px] text-gray-800">Click ● on left to arm</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Playhead */}
            <div className="absolute top-0 bottom-0 z-30 pointer-events-none" style={{ left: playheadPx, width: 2 }}>
              <div className="absolute inset-0 bg-white/80" style={{ top: RULER_H }} />
              <div className="absolute" style={{
                top: RULER_H - 10, left: -5, width: 0, height: 0,
                borderLeft: "6px solid transparent", borderRight: "6px solid transparent",
                borderTop: "10px solid rgba(255,255,255,0.9)",
              }} />
              <div className="absolute text-[9px] font-mono text-white/80 bg-black/60 px-1 rounded" style={{ top: RULER_H - 22, left: 4, whiteSpace: "nowrap" }}>
                {fmtTime(time)}
              </div>
            </div>
          </div>
        </div>

        {/* Projects slide panel */}
        {showProjects && (
          <ProjectsPanel
            projects={projects} loading={projectsLoading}
            deletingId={deletingId} loadingId={loadingId}
            onClose={() => setShowProjects(false)}
            onLoad={handleLoadProject} onDelete={handleDeleteProject}
          />
        )}
      </div>

      {/* Hint bar */}
      <div className="h-7 bg-[#111] border-t border-[#1e1e1e] flex items-center px-4 text-[10px] text-gray-700 gap-4 shrink-0">
        <span>Click timeline to seek</span><span className="text-gray-800">·</span>
        <span>Drag clips to reposition</span><span className="text-gray-800">·</span>
        <span>● Arm → ● Record</span><span className="text-gray-800">·</span>
        <span>Save uploads to cloud · ☁ = saved</span>
      </div>
    </div>
  );
}

// ── Projects Panel ────────────────────────────────────────────────────────────
function ProjectsPanel({
  projects, loading, deletingId, loadingId, onClose, onLoad, onDelete,
}: {
  projects: SavedProject[];
  loading: boolean;
  deletingId: number | null;
  loadingId: number | null;
  onClose: () => void;
  onLoad: (p: SavedProject) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div className="absolute inset-0 z-40 bg-black/50" onClick={onClose} />
      {/* Panel */}
      <div className="absolute right-0 top-0 bottom-0 z-50 w-80 bg-[#1a1a1a] border-l border-[#2a2a2a] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a] shrink-0">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-bold text-white">Saved Projects</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-600 text-sm">
              <CloudUpload className="w-8 h-8 text-gray-700" />
              <p>No saved projects yet.</p>
              <p className="text-xs">Record something and hit Save.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#222]">
              {projects.map((proj) => {
                const recordedCount = proj.lanes.filter((l) => l.objectPath).length;
                return (
                  <div key={proj.id} className="px-4 py-3 hover:bg-white/5 transition-colors group">
                    <div className="flex items-start gap-3">
                      <img src={proj.beatThumbnailUrl} className="w-10 h-10 rounded-lg object-cover shrink-0 border border-[#333]" alt="" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">{proj.name}</p>
                        <p className="text-[10px] text-gray-500 truncate">{proj.beatChannelName}</p>
                        <p className="text-[10px] text-gray-700 mt-0.5">
                          {recordedCount} vocal track{recordedCount !== 1 ? "s" : ""} · {fmtDate(proj.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2.5">
                      <button
                        onClick={() => onLoad(proj)}
                        disabled={loadingId === proj.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition-colors"
                      >
                        {loadingId === proj.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FolderOpen className="w-3 h-3" />}
                        {loadingId === proj.id ? "Loading…" : "Open"}
                      </button>
                      <button
                        onClick={() => onDelete(proj.id)}
                        disabled={deletingId === proj.id}
                        className="w-8 flex items-center justify-center rounded-lg border border-[#2a2a2a] hover:bg-red-900/30 hover:border-red-600/40 text-gray-600 hover:text-red-400 disabled:opacity-50 transition-colors"
                      >
                        {deletingId === proj.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
