import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import {
  Play, Square, Circle, Volume2, ArrowLeft,
  Loader2, Pause, SkipBack, Mic,
} from "lucide-react";
import type { Video } from "@workspace/api-client-react";

const BEAT_KEY = "tubefeed-daw-beat";
const LANE_COLORS = ["#ef4444", "#22c55e", "#8b5cf6"];
const LANE_NAMES  = ["Vocal 1", "Vocal 2", "Vocal 3"];

// ── YouTube IFrame API bootstrap ──────────────────────────────────────────────
let _ytLoaded = false;
let _ytReady  = false;
const _ytCbs: (() => void)[] = [];
function loadYT(cb: () => void) {
  if (_ytReady) { cb(); return; }
  _ytCbs.push(cb);
  if (_ytLoaded) return;
  _ytLoaded = true;
  (window as any).onYouTubeIframeAPIReady = () => {
    _ytReady = true;
    _ytCbs.forEach((f) => f());
    _ytCbs.length = 0;
  };
  const s = document.createElement("script");
  s.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(s);
}

function fmtTime(sec: number) {
  const m   = Math.floor(sec / 60);
  const s   = Math.floor(sec % 60);
  const dec = Math.floor((sec % 1) * 10);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${dec}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Lane = {
  id: number;
  name: string;
  color: string;
  muted: boolean;
  volume: number;
  blobUrl: string | null;
  mime: string;
  waveform: number[];
  durationSec: number;
};

function makeLanes(): Lane[] {
  return LANE_NAMES.map((name, i) => ({
    id: i, name, color: LANE_COLORS[i],
    muted: false, volume: 80,
    blobUrl: null, mime: "audio/webm",
    waveform: [], durationSec: 0,
  }));
}

// ── Waveform canvas ───────────────────────────────────────────────────────────
function WaveCanvas({ data, color }: { data: number[]; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || data.length === 0) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const W = c.width, H = c.height, mid = H / 2;
    ctx.clearRect(0, 0, W, H);
    const bw = W / data.length;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    data.forEach((v, i) => {
      const h = Math.max(2, v * mid * 1.9);
      ctx.fillRect(i * bw, mid - h / 2, Math.max(1, bw - 0.5), h);
    });
  }, [data, color]);
  return <canvas ref={ref} width={1000} height={56} className="w-full h-full" />;
}

// ── Fake beat waveform bars (decorative) ──────────────────────────────────────
const BEAT_BARS = Array.from({ length: 160 }, (_, i) =>
  30 + Math.abs(Math.sin(i * 0.37) * 52 + Math.sin(i * 0.13 + 1) * 28)
);

// ── Main DAW page ─────────────────────────────────────────────────────────────
export default function DawPage() {
  const [beat, setBeat]           = useState<Video | null>(null);
  const [lanes, setLanes]         = useState<Lane[]>(makeLanes);
  const [armedLane, setArmedLane] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [time, setTime]           = useState(0);
  const [ytReady, setYtReady]     = useState(false);
  const [micError, setMicError]   = useState(false);

  const ytRef         = useRef<any>(null);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const baseRef       = useRef(0);   // Date.now() when clock started
  const timeRef       = useRef(0);   // last known time (seconds)
  const mrRef         = useRef<MediaRecorder | null>(null);
  const chunksRef     = useRef<Blob[]>([]);
  const recLaneRef    = useRef(-1);
  const audioEls      = useRef<(HTMLAudioElement | null)[]>([null, null, null]);

  // ── Load beat from sessionStorage ──
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(BEAT_KEY);
      if (raw) { sessionStorage.removeItem(BEAT_KEY); setBeat(JSON.parse(raw)); }
    } catch { /* ignore */ }
  }, []);

  // ── Boot YouTube player ──
  useEffect(() => {
    if (!beat) return;
    loadYT(() => {
      if (ytRef.current) return;
      ytRef.current = new (window as any).YT.Player("daw-yt-player", {
        videoId: beat.videoId,
        playerVars: { autoplay: 0, controls: 0, modestbranding: 1, rel: 0 },
        events: { onReady: () => setYtReady(true) },
      });
    });
    return () => {
      try { ytRef.current?.destroy?.(); } catch (_) {}
      ytRef.current = null;
      setYtReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat?.videoId]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      try { ytRef.current?.destroy?.(); } catch (_) {}
    };
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function stopClock() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function startClock(fromSec = 0) {
    stopClock();
    baseRef.current = Date.now() - fromSec * 1000;
    timerRef.current = setInterval(() => {
      const t = (Date.now() - baseRef.current) / 1000;
      setTime(t);
      timeRef.current = t;
    }, 50);
  }

  function stopAll() {
    stopClock();
    try { ytRef.current?.stopVideo?.(); } catch (_) {}
    audioEls.current.forEach((a) => { if (a) { a.pause(); a.currentTime = 0; } });
    if (mrRef.current?.state === "recording") mrRef.current.stop();
    setIsPlaying(false);
    setIsRecording(false);
    setTime(0);
    timeRef.current = 0;
  }

  async function decodeWaveform(blob: Blob, laneId: number, durSec: number) {
    try {
      const ac  = new AudioContext();
      const buf = await ac.decodeAudioData(await blob.arrayBuffer());
      const raw = buf.getChannelData(0);
      const N   = 200;
      const block = Math.floor(raw.length / N);
      const wf: number[] = [];
      for (let i = 0; i < N; i++) {
        let s = 0;
        for (let j = 0; j < block; j++) s += Math.abs(raw[i * block + j] || 0);
        wf.push(Math.min(1, (s / block) * 6));
      }
      await ac.close();
      setLanes((p) => p.map((l) => l.id === laneId ? { ...l, waveform: wf, durationSec: buf.duration || durSec } : l));
    } catch { /* ignore */ }
  }

  // ── Transport actions ─────────────────────────────────────────────────────────
  async function handleRecord() {
    if (armedLane < 0 || !ytReady) return;
    stopAll();
    setMicError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime   = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      mrRef.current  = mr;
      chunksRef.current = [];
      recLaneRef.current = armedLane;

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        const url  = URL.createObjectURL(blob);
        const lid  = recLaneRef.current;
        const durSec = (Date.now() - baseRef.current) / 1000;
        setLanes((p) => p.map((l) => l.id === lid ? { ...l, blobUrl: url, mime } : l));
        stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);
        decodeWaveform(blob, lid, durSec);
      };

      mr.start(100);
      ytRef.current.seekTo(0, true);
      ytRef.current.playVideo();
      startClock(0);
      setIsRecording(true);
      setIsPlaying(true);
    } catch {
      setMicError(true);
    }
  }

  function handlePlay() {
    if (isPlaying) return;
    const t = timeRef.current;
    try { ytRef.current?.seekTo?.(t, true); ytRef.current?.playVideo?.(); } catch (_) {}
    lanes.forEach((lane, i) => {
      const a = audioEls.current[i];
      if (a && lane.blobUrl && !lane.muted) {
        a.volume = lane.volume / 100;
        a.currentTime = Math.min(t, a.duration || 0);
        a.play().catch(() => {});
      }
    });
    startClock(t);
    setIsPlaying(true);
  }

  function handlePause() {
    stopClock();
    try { ytRef.current?.pauseVideo?.(); } catch (_) {}
    audioEls.current.forEach((a) => { if (a) a.pause(); });
    setIsPlaying(false);
  }

  // ── No beat loaded ────────────────────────────────────────────────────────────
  if (!beat) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex flex-col items-center justify-center gap-4 text-white">
        <Mic className="w-12 h-12 text-gray-600" />
        <p className="text-gray-400 text-sm">No beat loaded.</p>
        <p className="text-gray-600 text-xs">Go to Beats, open a beat, then click "Open DAW".</p>
        <Link href="/beats">
          <span className="mt-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-sm cursor-pointer transition-colors">
            Back to Beats
          </span>
        </Link>
      </div>
    );
  }

  // ── DAW layout ────────────────────────────────────────────────────────────────
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

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={stopAll}
            title="Stop / Rewind to start"
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <SkipBack className="w-4 h-4 text-gray-400" />
          </button>

          {isPlaying ? (
            <button onClick={handlePause} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
              <Pause className="w-4 h-4 text-white" />
            </button>
          ) : (
            <button
              onClick={handlePlay}
              disabled={!ytReady}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-40"
            >
              <Play className="w-4 h-4 text-white" />
            </button>
          )}

          <button onClick={stopAll} className="p-2 rounded-lg hover:bg-white/10 transition-colors" title="Stop">
            <Square className="w-4 h-4 text-gray-400" />
          </button>

          <button
            onClick={handleRecord}
            disabled={armedLane < 0 || !ytReady}
            title={armedLane < 0 ? "Arm a lane first (click ● on a lane)" : "Record"}
            className={`p-2 rounded-lg transition-colors disabled:opacity-40 ${
              isRecording ? "bg-red-600 shadow-lg shadow-red-900/50" : "bg-red-900/30 hover:bg-red-600/50"
            }`}
          >
            <Circle
              className="w-4 h-4 text-red-400"
              fill={isRecording ? "currentColor" : "none"}
            />
          </button>
        </div>

        {/* Time counter */}
        <div className="font-mono text-lg text-white tabular-nums bg-black/40 px-3 py-1 rounded-lg border border-[#2a2a2a] min-w-[90px] text-center">
          {fmtTime(time)}
        </div>

        {/* Beat info */}
        <div className="flex items-center gap-2 ml-1 min-w-0 flex-1">
          <img src={beat.thumbnailUrl} className="w-8 h-8 rounded object-cover shrink-0 border border-[#333]" alt="" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white/90 truncate leading-tight">{beat.title}</p>
            <p className="text-[10px] text-gray-500 truncate">{beat.channelName}</p>
          </div>
        </div>

        {/* Status badges */}
        <div className="shrink-0 flex items-center gap-2 text-xs">
          {!ytReady && (
            <span className="flex items-center gap-1 text-gray-500">
              <Loader2 className="w-3 h-3 animate-spin" />Loading beat…
            </span>
          )}
          {micError && <span className="text-red-400">Mic access denied</span>}
          {isRecording && (
            <span className="flex items-center gap-1.5 text-red-400 font-bold animate-pulse">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />REC
            </span>
          )}
          {armedLane >= 0 && !isRecording && (
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-red-600/40 text-red-400/80">
              {LANE_NAMES[armedLane]} armed
            </span>
          )}
        </div>
      </div>

      {/* ── Track labels header ── */}
      <div className="flex h-7 bg-[#161616] border-b border-[#2a2a2a] shrink-0">
        <div className="w-52 shrink-0 border-r border-[#2a2a2a] flex items-center px-3">
          <span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">Track</span>
        </div>
        <div className="flex-1 flex items-center px-4">
          <span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">Clip</span>
        </div>
      </div>

      {/* ── Track area ── */}
      <div className="flex-1 flex flex-col overflow-y-auto">

        {/* Beat track */}
        <div className="flex shrink-0 border-b border-[#2a2a2a]" style={{ height: 80 }}>
          {/* Left panel */}
          <div className="w-52 shrink-0 flex items-center gap-3 px-3 border-r border-[#2a2a2a] bg-[#1a1a1a]">
            <img
              src={beat.thumbnailUrl}
              className="w-9 h-9 rounded-lg object-cover shrink-0 border border-[#333]"
              alt=""
            />
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-gray-300 truncate">Beat</p>
              <p className="text-[10px] text-gray-600 truncate">{beat.channelName}</p>
              <div className="mt-1">
                <Volume2 className="w-3 h-3 text-gray-600 inline" />
              </div>
            </div>
          </div>

          {/* Beat waveform (decorative — plays via YouTube) */}
          <div className="flex-1 relative overflow-hidden bg-red-950/20">
            {/* Hidden YouTube player */}
            <div id="daw-yt-player" className="hidden absolute" />
            <div className="absolute inset-0 flex items-center px-3">
              <div className="flex w-full items-center gap-[1.5px]" style={{ height: 52 }}>
                {BEAT_BARS.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-[1px]"
                    style={{
                      height: `${h}%`,
                      backgroundColor: isPlaying
                        ? `rgba(239,68,68,${0.4 + Math.sin(i * 0.5 + time * 8) * 0.1})`
                        : "rgba(239,68,68,0.45)",
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="absolute top-1.5 left-3 flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-red-400 bg-black/40 px-1.5 py-0.5 rounded">
                Beat
              </span>
              <span className="text-[10px] text-gray-500 truncate max-w-[200px]">{beat.title}</span>
            </div>
          </div>
        </div>

        {/* Recording lanes */}
        {lanes.map((lane, i) => (
          <div
            key={lane.id}
            className="flex shrink-0 border-b border-[#222] transition-colors"
            style={{
              height: 80,
              backgroundColor: armedLane === lane.id ? `${lane.color}0a` : "#141414",
            }}
          >
            {/* Left panel */}
            <div className="w-52 shrink-0 flex items-center gap-2 px-3 border-r border-[#222] bg-[#181818]">
              {/* Arm button */}
              <button
                onClick={() => setArmedLane((p) => p === lane.id ? -1 : lane.id)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0 border"
                style={
                  armedLane === lane.id
                    ? { backgroundColor: "#dc2626", borderColor: "#ef4444" }
                    : { borderColor: "#2a2a2a", color: "#666" }
                }
                title="Arm for recording"
              >
                <Circle
                  className="w-3 h-3"
                  style={{ color: armedLane === lane.id ? "white" : "#666" }}
                  fill={armedLane === lane.id ? "white" : "none"}
                />
              </button>

              <div className="flex-1 min-w-0">
                <p
                  className="text-[11px] font-bold truncate mb-1"
                  style={{ color: lane.blobUrl ? lane.color : "#ccc" }}
                >
                  {lane.name}
                </p>
                {/* Volume */}
                <div className="flex items-center gap-1">
                  <Volume2 className="w-2.5 h-2.5 text-gray-700 shrink-0" />
                  <input
                    type="range" min={0} max={100} value={lane.volume}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setLanes((p) => p.map((l) => l.id === lane.id ? { ...l, volume: v } : l));
                      const a = audioEls.current[i];
                      if (a) a.volume = v / 100;
                    }}
                    className="flex-1 h-1 cursor-pointer min-w-0"
                    style={{ accentColor: lane.color }}
                  />
                  <span className="text-[9px] text-gray-600 w-6 text-right shrink-0">{lane.volume}</span>
                </div>
              </div>

              {/* Mute button */}
              <button
                onClick={() => setLanes((p) => p.map((l) => l.id === lane.id ? { ...l, muted: !l.muted } : l))}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all shrink-0 border"
                style={
                  lane.muted
                    ? { backgroundColor: "rgba(234,179,8,0.15)", borderColor: "rgba(234,179,8,0.4)", color: "#eab308" }
                    : { borderColor: "#2a2a2a", color: "#555" }
                }
                title={lane.muted ? "Unmute" : "Mute"}
              >
                M
              </button>
            </div>

            {/* Clip area */}
            <div className="flex-1 relative overflow-hidden">
              {lane.blobUrl ? (
                <>
                  <div
                    className="absolute inset-2 rounded-lg overflow-hidden flex items-center px-3"
                    style={{
                      backgroundColor: `${lane.color}12`,
                      border: `1px solid ${lane.color}35`,
                    }}
                  >
                    <WaveCanvas data={lane.waveform} color={lane.color} />
                  </div>
                  <div className="absolute top-3 left-4 flex items-center gap-1.5">
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ color: lane.color, backgroundColor: `${lane.color}20` }}
                    >
                      {lane.name}
                    </span>
                    {lane.durationSec > 0 && (
                      <span className="text-[10px] text-gray-600">
                        {lane.durationSec.toFixed(1)}s
                      </span>
                    )}
                  </div>
                  <audio
                    ref={(el) => { audioEls.current[i] = el; }}
                    src={lane.blobUrl}
                    preload="auto"
                  />
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  {armedLane === lane.id ? (
                    <p className="text-xs font-semibold" style={{ color: lane.color }}>
                      {isRecording ? "● Recording…" : "Armed — press ● Record in transport"}
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-700">Click ● to arm this lane</p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Hint bar ── */}
      <div className="h-7 bg-[#111] border-t border-[#1e1e1e] flex items-center px-4 text-[10px] text-gray-700 gap-4 shrink-0">
        <span>● Arm a lane</span>
        <span className="text-gray-800">→</span>
        <span>● Record (transport)</span>
        <span className="text-gray-800">→</span>
        <span>▶ Play to hear mix</span>
        <span className="text-gray-800">→</span>
        <span>M to mute a lane</span>
      </div>
    </div>
  );
}
