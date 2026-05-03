import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import {
  Tv2, Music2, FileText, Mic, Trash2, Download, Loader2,
  Cloud, Bookmark, Play, Pause, Volume2, Layers, Sliders,
} from "lucide-react";
import { motion } from "framer-motion";
import { useRecordings, useDeleteRecording } from "../hooks/use-recordings";
import type { RecordingItem, Video } from "@workspace/api-client-react";
import { BeatPlayer } from "../components/beat-player";

function formatSeconds(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Load YouTube IFrame API once across all MixPlayer instances
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

// ── Effects presets ───────────────────────────────────────────────────────────
type EffectPreset = "dry" | "booth" | "punchy" | "warm" | "lofi" | "bright";
interface PresetDef {
  label: string;
  color: string;
  compressor: { threshold: number; ratio: number; attack: number; release: number; knee: number };
  highpass: number;
  lowShelf: { freq: number; gain: number };
  mid: { freq: number; Q: number; gain: number };
  highShelf: { freq: number; gain: number };
  outputGain: number;
}
const PRESETS: Record<EffectPreset, PresetDef> = {
  dry:    { label: "Dry",        color: "text-text-muted border-border",            outputGain: 1,   compressor: { threshold: 0,   ratio: 1,  attack: 0.003, release: 0.25, knee: 40 }, highpass: 20,  lowShelf: { freq: 200,  gain: 0  }, mid: { freq: 2000, Q: 1,   gain: 0  }, highShelf: { freq: 8000,  gain: 0  } },
  booth:  { label: "Booth",      color: "text-blue-400 border-blue-500/40",         outputGain: 1.1, compressor: { threshold: -18, ratio: 4,  attack: 0.005, release: 0.15, knee: 10 }, highpass: 100, lowShelf: { freq: 200,  gain: -2 }, mid: { freq: 3000, Q: 1.5, gain: 4  }, highShelf: { freq: 10000, gain: 1  } },
  punchy: { label: "Punchy",     color: "text-orange-400 border-orange-500/40",     outputGain: 1.2, compressor: { threshold: -12, ratio: 8,  attack: 0.001, release: 0.05, knee: 5  }, highpass: 120, lowShelf: { freq: 100,  gain: -3 }, mid: { freq: 5000, Q: 1,   gain: 5  }, highShelf: { freq: 12000, gain: 2  } },
  warm:   { label: "Warm",       color: "text-amber-400 border-amber-500/40",       outputGain: 1,   compressor: { threshold: -20, ratio: 3,  attack: 0.01,  release: 0.2,  knee: 15 }, highpass: 80,  lowShelf: { freq: 250,  gain: 3  }, mid: { freq: 2000, Q: 0.8, gain: -1 }, highShelf: { freq: 8000,  gain: -2 } },
  lofi:   { label: "Lo-Fi",      color: "text-purple-400 border-purple-500/40",     outputGain: 1,   compressor: { threshold: -10, ratio: 6,  attack: 0.005, release: 0.1,  knee: 8  }, highpass: 200, lowShelf: { freq: 300,  gain: 2  }, mid: { freq: 1500, Q: 2,   gain: 3  }, highShelf: { freq: 6000,  gain: -8 } },
  bright: { label: "Bright",     color: "text-cyan-400 border-cyan-500/40",         outputGain: 1.1, compressor: { threshold: -16, ratio: 3,  attack: 0.003, release: 0.2,  knee: 10 }, highpass: 100, lowShelf: { freq: 200,  gain: -1 }, mid: { freq: 4000, Q: 1,   gain: 2  }, highShelf: { freq: 10000, gain: 6  } },
};

// ── Mix Player ────────────────────────────────────────────────────────────────
function MixPlayer({ rec }: { rec: RecordingItem }) {
  const ytDivId = `yt-mix-${rec.id}`;
  const ytPlayerRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  // Playback state
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(rec.durationSeconds || 0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const vocalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mixer
  const [beatVol, setBeatVol] = useState(70);
  const [vocalVol, setVocalVol] = useState(85);

  // Timeline drag — vocal offset in seconds (positive = vocal starts later)
  const [vocalOffset, setVocalOffset] = useState(0);
  const dragStartX = useRef<number | null>(null);
  const dragStartOffset = useRef(0);

  // Effects
  const [activePreset, setActivePreset] = useState<EffectPreset>("booth");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const compRef = useRef<DynamicsCompressorNode | null>(null);
  const hpRef = useRef<BiquadFilterNode | null>(null);
  const lsRef = useRef<BiquadFilterNode | null>(null);
  const midRef = useRef<BiquadFilterNode | null>(null);
  const hsRef = useRef<BiquadFilterNode | null>(null);
  const outGainRef = useRef<GainNode | null>(null);

  const servingUrl = `/api/storage${rec.objectPath}`;

  // Boot YouTube player
  useEffect(() => {
    loadYTApi(() => {
      if (ytPlayerRef.current) return;
      ytPlayerRef.current = new (window as any).YT.Player(ytDivId, {
        videoId: rec.beatVideoId,
        playerVars: { autoplay: 0, controls: 0, modestbranding: 1, rel: 0 },
        events: {
          onReady: () => { ytPlayerRef.current.setVolume(beatVol); setReady(true); },
        },
      });
    });
    return () => {
      if (ytPlayerRef.current) { try { ytPlayerRef.current.destroy(); } catch (_) {} ytPlayerRef.current = null; }
      if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build or rebuild the Web Audio chain and apply preset
  const applyPreset = useCallback((preset: EffectPreset, ctx: AudioContext) => {
    const p = PRESETS[preset];
    const comp = compRef.current!;
    const hp   = hpRef.current!;
    const ls   = lsRef.current!;
    const mid  = midRef.current!;
    const hs   = hsRef.current!;
    const og   = outGainRef.current!;
    const gainNode = gainNodeRef.current!;

    comp.threshold.setTargetAtTime(p.compressor.threshold, ctx.currentTime, 0.01);
    comp.ratio.setTargetAtTime(p.compressor.ratio, ctx.currentTime, 0.01);
    comp.attack.setTargetAtTime(p.compressor.attack, ctx.currentTime, 0.01);
    comp.release.setTargetAtTime(p.compressor.release, ctx.currentTime, 0.01);
    comp.knee.setTargetAtTime(p.compressor.knee, ctx.currentTime, 0.01);
    hp.frequency.setTargetAtTime(p.highpass, ctx.currentTime, 0.01);
    ls.frequency.setTargetAtTime(p.lowShelf.freq, ctx.currentTime, 0.01);
    ls.gain.setTargetAtTime(p.lowShelf.gain, ctx.currentTime, 0.01);
    mid.frequency.setTargetAtTime(p.mid.freq, ctx.currentTime, 0.01);
    mid.Q.setTargetAtTime(p.mid.Q, ctx.currentTime, 0.01);
    mid.gain.setTargetAtTime(p.mid.gain, ctx.currentTime, 0.01);
    hs.frequency.setTargetAtTime(p.highShelf.freq, ctx.currentTime, 0.01);
    hs.gain.setTargetAtTime(p.highShelf.gain, ctx.currentTime, 0.01);
    og.gain.setTargetAtTime(p.outputGain, ctx.currentTime, 0.01);
    gainNode.gain.setTargetAtTime(vocalVol / 100, ctx.currentTime, 0.01);
  }, [vocalVol]);

  // Initialise Web Audio chain (lazily, on first play gesture)
  const ensureAudioChain = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || sourceNodeRef.current) return; // already built

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    const source = ctx.createMediaElementSource(audio);
    sourceNodeRef.current = source;

    const comp = ctx.createDynamicsCompressor();
    const hp   = ctx.createBiquadFilter(); hp.type = "highpass";
    const ls   = ctx.createBiquadFilter(); ls.type = "lowshelf";
    const mid  = ctx.createBiquadFilter(); mid.type = "peaking";
    const hs   = ctx.createBiquadFilter(); hs.type = "highshelf";
    const gain = ctx.createGain(); // vocal fader
    const og   = ctx.createGain(); // preset output trim

    compRef.current = comp;
    hpRef.current   = hp;
    lsRef.current   = ls;
    midRef.current  = mid;
    hsRef.current   = hs;
    gainNodeRef.current = gain;
    outGainRef.current  = og;

    source.connect(comp);
    comp.connect(hp);
    hp.connect(ls);
    ls.connect(mid);
    mid.connect(hs);
    hs.connect(gain);
    gain.connect(og);
    og.connect(ctx.destination);

    applyPreset(activePreset, ctx);
  }, [activePreset, applyPreset]);

  // Re-apply when preset changes
  useEffect(() => {
    if (audioCtxRef.current && compRef.current) {
      applyPreset(activePreset, audioCtxRef.current);
    }
  }, [activePreset, applyPreset]);

  // Beat volume
  useEffect(() => {
    if (ytPlayerRef.current && ready) ytPlayerRef.current.setVolume(beatVol);
  }, [beatVol, ready]);

  // Vocal volume (via GainNode when chain active, else direct)
  useEffect(() => {
    if (gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.setTargetAtTime(vocalVol / 100, audioCtxRef.current.currentTime, 0.01);
    } else if (audioRef.current) {
      audioRef.current.volume = vocalVol / 100;
    }
  }, [vocalVol]);

  const stopTick = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    if (vocalTimerRef.current) { clearTimeout(vocalTimerRef.current); vocalTimerRef.current = null; }
  }, []);

  const handlePlay = useCallback(() => {
    if (!ready) return;
    const a = audioRef.current;
    if (!a) return;

    ensureAudioChain();
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();

    if (vocalOffset > 0) {
      // Beat starts now; vocal starts after `vocalOffset` ms
      ytPlayerRef.current.seekTo(currentTime, true);
      ytPlayerRef.current.playVideo();
      vocalTimerRef.current = setTimeout(() => {
        a.currentTime = 0;
        a.play().catch(() => {});
      }, vocalOffset * 1000);
    } else {
      // Both start together
      ytPlayerRef.current.seekTo(currentTime, true);
      ytPlayerRef.current.playVideo();
      a.play().catch(() => {});
    }

    setPlaying(true);
    tickRef.current = setInterval(() => {
      const cur = audioRef.current;
      if (cur && !isNaN(cur.currentTime)) {
        setCurrentTime(cur.currentTime);
        if (!duration && cur.duration && isFinite(cur.duration)) setDuration(cur.duration);
      }
    }, 100);
  }, [ready, ensureAudioChain, vocalOffset, currentTime, duration]);

  const handlePause = useCallback(() => {
    ytPlayerRef.current?.pauseVideo?.();
    audioRef.current?.pause();
    stopTick();
    setPlaying(false);
  }, [stopTick]);

  const handleToggle = useCallback(() => {
    playing ? handlePause() : handlePlay();
  }, [playing, handlePlay, handlePause]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = t;
    ytPlayerRef.current?.seekTo?.(t + vocalOffset, true);
    setCurrentTime(t);
  }, [vocalOffset]);

  const handleEnded = useCallback(() => {
    ytPlayerRef.current?.pauseVideo?.();
    stopTick();
    setPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) audioRef.current.currentTime = 0;
    ytPlayerRef.current?.seekTo?.(0, true);
  }, [stopTick]);

  // ── Timeline drag logic ──────────────────────────────────────────────────────
  // totalDuration is used to map pixel ↔ seconds on the timeline
  const totalDur = Math.max(duration + vocalOffset + 2, 60);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartX.current = e.clientX;
    dragStartOffset.current = vocalOffset;
  }, [vocalOffset]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragStartX.current === null) return;
      const tl = timelineRef.current;
      if (!tl) return;
      const pxPerSec = tl.clientWidth / totalDur;
      const deltaSec = (e.clientX - dragStartX.current) / pxPerSec;
      setVocalOffset(Math.max(0, Math.min(dragStartOffset.current + deltaSec, totalDur - duration - 1)));
    };
    const onUp = () => { dragStartX.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [totalDur, duration]);

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const beatLeftPct   = 0;
  const vocalLeftPct  = (vocalOffset / totalDur) * 100;
  const vocalWidthPct = (duration / totalDur) * 100;

  return (
    <div className="rounded-xl border border-primary/20 bg-[#0e0e12] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-white/5">
        <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-xs font-bold uppercase tracking-widest text-primary">Mix Monitor</span>
        {!ready && <Loader2 className="w-3 h-3 animate-spin text-text-muted ml-auto" />}
        {vocalOffset > 0 && (
          <span className="ml-auto text-[10px] text-text-muted font-mono">
            vocal +{vocalOffset.toFixed(1)}s
          </span>
        )}
      </div>

      {/* ── Timeline ──────────────────────────────────────────────────────────── */}
      <div ref={timelineRef} className="px-4 py-3 select-none">
        {/* Time ruler */}
        <div className="flex justify-between mb-1 px-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className="text-[9px] text-text-muted font-mono">
              {formatSeconds(Math.round((totalDur / 4) * i))}
            </span>
          ))}
        </div>

        {/* Beat lane */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-primary w-10 shrink-0">Beat</span>
          <div className="relative flex-1 h-7 rounded-md bg-[#1a1a22] overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-md flex items-center px-2"
              style={{ width: "100%", background: "linear-gradient(90deg,#ff3b30 0%,#c0392b 100%)" }}
            >
              <span className="text-[9px] text-white/80 font-semibold truncate">{rec.beatTitle}</span>
            </div>
          </div>
        </div>

        {/* Vocal lane — draggable */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted w-10 shrink-0">Vocal</span>
          <div className="relative flex-1 h-7 rounded-md bg-[#1a1a22] overflow-hidden">
            <div
              className="absolute inset-y-0 flex items-center px-2 rounded-md cursor-grab active:cursor-grabbing group"
              style={{
                left: `${vocalLeftPct}%`,
                width: `${Math.max(vocalWidthPct, 3)}%`,
                background: "linear-gradient(90deg,#6366f1 0%,#8b5cf6 100%)",
                minWidth: 28,
              }}
              onMouseDown={handleDragStart}
            >
              <span className="text-[9px] text-white/80 font-semibold truncate pointer-events-none">
                Take
              </span>
              {/* drag handle dots */}
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-60 group-hover:opacity-100">
                <span className="block w-0.5 h-0.5 rounded-full bg-white" />
                <span className="block w-0.5 h-0.5 rounded-full bg-white" />
                <span className="block w-0.5 h-0.5 rounded-full bg-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Playhead */}
        <div className="mt-2.5 flex items-center gap-2">
          <span className="text-[9px] font-mono text-text-muted w-10 shrink-0">{formatSeconds(Math.floor(currentTime))}</span>
          <div className="relative flex-1 h-1 rounded-full bg-white/10">
            <div
              className="absolute inset-y-0 left-0 bg-primary rounded-full pointer-events-none"
              style={{ width: `${pct}%` }}
            />
            <input
              type="range" min={0} max={duration || 1} step={0.1} value={currentTime}
              onChange={handleSeek}
              className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
            />
          </div>
          <span className="text-[9px] font-mono text-text-muted w-10 text-right shrink-0">
            {duration ? formatSeconds(Math.floor(duration)) : "--:--"}
          </span>
        </div>
      </div>

      {/* ── Transport + Volume ─────────────────────────────────────────────────── */}
      <div className="px-4 py-2 border-t border-white/5 flex items-center gap-4">
        {/* Play/Pause */}
        <button
          onClick={handleToggle}
          disabled={!ready}
          className="w-9 h-9 rounded-full bg-primary hover:bg-primary/80 disabled:opacity-40 flex items-center justify-center shrink-0 transition-all shadow-lg shadow-primary/25"
        >
          {playing
            ? <Pause className="w-4 h-4 text-white fill-white" />
            : <Play className="w-4 h-4 text-white fill-white translate-x-0.5" />}
        </button>

        {/* Beat vol */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Music2 className="w-3 h-3 text-primary shrink-0" />
          <span className="text-[10px] text-text-muted font-medium w-6 shrink-0">Beat</span>
          <input
            type="range" min={0} max={100} value={beatVol}
            onChange={(e) => setBeatVol(Number(e.target.value))}
            className="flex-1 h-1 accent-primary cursor-pointer min-w-0"
          />
          <span className="text-[10px] text-text-muted font-mono w-7 text-right shrink-0">{beatVol}%</span>
        </div>

        {/* Vocal vol */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Mic className="w-3 h-3 text-violet-400 shrink-0" />
          <span className="text-[10px] text-text-muted font-medium w-6 shrink-0">Vocal</span>
          <input
            type="range" min={0} max={100} value={vocalVol}
            onChange={(e) => setVocalVol(Number(e.target.value))}
            className="flex-1 h-1 accent-violet-500 cursor-pointer min-w-0"
          />
          <Volume2 className="w-3 h-3 text-text-muted shrink-0" />
          <span className="text-[10px] text-text-muted font-mono w-7 text-right shrink-0">{vocalVol}%</span>
        </div>
      </div>

      {/* ── Effects rack ──────────────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 border-t border-white/5">
        <div className="flex items-center gap-2 mb-2">
          <Sliders className="w-3 h-3 text-text-muted" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Vocal FX</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(PRESETS) as EffectPreset[]).map((key) => (
            <button
              key={key}
              onClick={() => setActivePreset(key)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                activePreset === key
                  ? `${PRESETS[key].color} bg-white/5`
                  : "text-text-muted border-border hover:border-white/20 hover:text-text-main"
              }`}
            >
              {PRESETS[key].label}
            </button>
          ))}
        </div>
        {/* Preset description */}
        <p className="text-[10px] text-text-muted mt-1.5 leading-relaxed">
          {{
            dry:    "No processing — raw mic signal",
            booth:  "Light 4:1 compression · presence boost at 3kHz",
            punchy: "Hard 8:1 compression · aggressive 5kHz air",
            warm:   "Gentle compression · low-mid warmth",
            lofi:   "Heavy squash · lo-pass rolloff above 6kHz",
            bright: "Clean comp · +6dB high shelf sparkle",
          }[activePreset]}
        </p>
      </div>

      {/* Hidden elements */}
      <div id={ytDivId} className="hidden" />
      <audio
        ref={audioRef}
        src={servingUrl}
        onEnded={handleEnded}
        onLoadedMetadata={(e) => {
          const d = (e.target as HTMLAudioElement).duration;
          if (isFinite(d)) setDuration(d);
        }}
        preload="metadata"
      />
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
          <Mic className="w-3 h-3 text-violet-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Vocal only</span>
        </div>
        <audio src={servingUrl} controls className="w-full h-8" style={{ accentColor: "#8b5cf6" }} />
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
        {mixOpen ? "Close DAW" : "Open in DAW"}
      </button>

      {mixOpen && <MixPlayer rec={rec} />}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <a
          href={servingUrl}
          download={`${rec.beatTitle} - vocal`}
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
          {deleteRecording.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          Delete
        </button>
      </div>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Recordings() {
  const { data: recordings, isLoading } = useRecordings();
  const [dawBeat, setDawBeat] = useState<Video | null>(null);
  const [pendingBeat, setPendingBeat] = useState<Video | null>(null);

  // Pick up beat passed via "Open DAW" — show banner, don't auto-open modal
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("tubefeed-daw-beat");
      if (raw) {
        sessionStorage.removeItem("tubefeed-daw-beat");
        setPendingBeat(JSON.parse(raw) as Video);
      }
    } catch { /* ignore */ }
  }, []);

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
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-semibold bg-primary/15 text-primary border border-primary/20"><Mic className="w-3.5 h-3.5" />Recordings</span>
            <Link href="/saved"><span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer"><Bookmark className="w-3.5 h-3.5" />Saved</span></Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-8">

        {/* ── Session banner — shown when arriving from "Open DAW" ── */}
        {pendingBeat && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex items-center gap-4 p-4 rounded-xl bg-primary/10 border border-primary/30"
          >
            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-border">
              <img src={pendingBeat.thumbnailUrl} alt={pendingBeat.title} className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-primary font-semibold uppercase tracking-widest mb-0.5">Beat loaded</p>
              <p className="text-text-main text-sm font-semibold truncate">{pendingBeat.title}</p>
              <p className="text-text-muted text-xs truncate">{pendingBeat.channelName}</p>
            </div>
            <button
              onClick={() => { setDawBeat(pendingBeat); setPendingBeat(null); }}
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
            >
              <Mic className="w-4 h-4" />Start Recording
            </button>
            <button
              onClick={() => setPendingBeat(null)}
              className="shrink-0 p-1.5 rounded-lg text-text-muted hover:text-text-main transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-text-main flex items-center gap-2">
              <Cloud className="w-6 h-6 text-blue-400" />
              Cloud Recordings
            </h2>
            <p className="text-text-muted text-sm mt-1">Hit "Open in DAW" to mix, offset, and process your vocals</p>
          </div>
          {recordings && recordings.length > 0 && (
            <span className="text-xs text-text-muted bg-surface border border-border px-2.5 py-1 rounded-full">
              {recordings.length} recording{recordings.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20 gap-3 text-text-muted">
            <Loader2 className="w-5 h-5 animate-spin" /><span>Loading recordings…</span>
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
                <Music2 className="w-4 h-4" />Go to Beats
              </span>
            </Link>
          </div>
        )}

        {!isLoading && recordings && recordings.length > 0 && (
          <div className="flex flex-col gap-4">
            {recordings.map((rec) => <RecordingCard key={rec.id} rec={rec} />)}
          </div>
        )}
      </main>

      {/* Auto-opened from "Open DAW" button in beats */}
      <BeatPlayer
        beat={dawBeat}
        onClose={() => setDawBeat(null)}
        onBeatSelect={setDawBeat}
      />
    </div>
  );
}
