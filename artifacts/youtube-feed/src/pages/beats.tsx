import { useState, useCallback } from "react";
import { Link } from "wouter";
import { Plus, Music2, AlertCircle, RefreshCw, Tv2, FileText } from "lucide-react";
import { motion } from "framer-motion";
import { useBeats } from "../hooks/use-beats";
import { useBeatChannels, useRemoveBeatChannel } from "../hooks/use-beat-channels";
import { BeatCard } from "../components/beat-card";
import { BeatPlayer } from "../components/beat-player";
import { AddBeatChannelModal } from "../components/add-beat-channel-modal";
import type { Video } from "@workspace/api-client-react";

export default function Beats() {
  const [selectedChannelId, setSelectedChannelId] = useState<number | undefined>();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeBeat, setActiveBeat] = useState<Video | null>(null);

  const { data: channels } = useBeatChannels();
  const { data: beats, isLoading, isError, refetch } = useBeats(selectedChannelId);
  const removeBeatChannel = useRemoveBeatChannel();

  const handleBeatSelect = useCallback((beat: Video) => {
    setActiveBeat(beat);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      {/* Topbar */}
      <header className="h-16 border-b border-border glass-panel sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <img
              src={`${import.meta.env.BASE_URL}images/logo.png`}
              className="w-9 h-9 rounded-xl shadow-lg"
              alt="Logo"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <h1 className="font-display font-bold text-xl sm:text-2xl tracking-tight text-white flex items-center">
              Tube<span className="text-primary ml-0.5">Feed</span>
            </h1>
          </div>
          {/* Tabs */}
          <nav className="flex items-center gap-1 bg-surface/60 border border-border rounded-xl px-1.5 py-1">
            <Link href="/">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer">
                <Tv2 className="w-3.5 h-3.5" />Feed
              </span>
            </Link>
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-semibold bg-primary/15 text-primary border border-primary/20">
              <Music2 className="w-3.5 h-3.5" />Beats
            </span>
            <Link href="/lyrics">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer">
                <FileText className="w-3.5 h-3.5" />Lyrics
              </span>
            </Link>
          </nav>
        </div>
      </header>

      {/* Sidebar + content */}
      <div className="flex flex-1 min-h-0 overflow-hidden" style={{ height: 'calc(100vh - 4rem)' }}>
        {/* Sidebar */}
        <aside className="w-64 shrink-0 border-r border-border flex flex-col bg-surface overflow-y-auto hidden sm:flex">
          <div className="px-4 pt-5 pb-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-text-muted">Beat Channels</span>
            <span className="text-xs text-text-muted bg-background px-1.5 py-0.5 rounded-full border border-border">
              {channels?.length ?? 0}
            </span>
          </div>

          {/* All beats */}
          <button
            onClick={() => setSelectedChannelId(undefined)}
            className={`mx-3 mb-1 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
              !selectedChannelId ? "bg-primary/10 text-primary border border-primary/20" : "text-text-muted hover:text-text-main hover:bg-surface-hover"
            }`}
          >
            <Music2 className="w-4 h-4 shrink-0" />
            All Beats
          </button>

          {/* Channel list */}
          <div className="flex flex-col gap-0.5 px-3 pb-3">
            {channels?.map((ch) => (
              <div key={ch.id} className="group relative">
                <button
                  onClick={() => setSelectedChannelId(ch.id === selectedChannelId ? undefined : ch.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                    selectedChannelId === ch.id ? "bg-primary/10 text-primary border border-primary/20" : "text-text-muted hover:text-text-main hover:bg-surface-hover"
                  }`}
                >
                  {ch.thumbnailUrl ? (
                    <img src={ch.thumbnailUrl} alt={ch.name} className="w-5 h-5 rounded-full shrink-0 object-cover" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-surface-hover shrink-0 flex items-center justify-center text-[10px] font-bold">
                      {ch.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="truncate">{ch.name}</span>
                </button>
                <button
                  onClick={() => removeBeatChannel.mutate(ch.id)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-400 transition-all text-xs px-1.5 py-0.5 rounded bg-surface-hover"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Add channel button */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="mx-3 mb-4 flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-text-muted hover:text-primary hover:bg-surface-hover border border-dashed border-border hover:border-primary/30 transition-all mt-auto"
          >
            <Plus className="w-4 h-4" />
            Add Beat Channel
          </button>
        </aside>

        {/* Main grid */}
        <main className="flex-1 overflow-y-auto p-5">
          {/* Mobile channel add */}
          <div className="flex sm:hidden items-center justify-between mb-4">
            <h2 className="text-text-muted text-sm font-medium">
              {channels?.length ? `${channels.length} beat channel${channels.length !== 1 ? "s" : ""}` : "No channels yet"}
            </h2>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>

          {/* Empty state */}
          {!isLoading && !isError && (!beats || beats.length === 0) && (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <div className="w-20 h-20 rounded-full bg-surface border border-border flex items-center justify-center mb-6">
                <Music2 className="w-9 h-9 text-text-muted/40" />
              </div>
              <h2 className="text-2xl font-bold text-text-main mb-2">No beats yet</h2>
              <p className="text-text-muted max-w-sm mb-8 text-sm leading-relaxed">
                Add your favourite beat producers and their latest uploads will appear here. Click any beat to instantly play and write lyrics.
              </p>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all shadow-lg shadow-primary/20"
              >
                <Plus className="w-4 h-4" />
                Add Beat Channel
              </button>
            </div>
          )}

          {/* Error state */}
          {isError && (
            <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
              <AlertCircle className="w-10 h-10 text-red-400" />
              <p className="text-text-muted">Failed to load beats</p>
              <button onClick={() => refetch()} className="flex items-center gap-2 px-4 py-2 bg-surface-hover rounded-xl text-sm">
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
            </div>
          )}

          {/* Loading skeletons */}
          {isLoading && (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-surface border border-border animate-pulse" />
              ))}
            </div>
          )}

          {/* Beat list */}
          {!isLoading && beats && beats.length > 0 && (
            <div className="flex flex-col gap-2">
              {beats.map((beat, index) => (
                <motion.div
                  key={beat.videoId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4) }}
                >
                  <BeatCard
                    beat={beat}
                    isPlaying={activeBeat?.videoId === beat.videoId}
                    onClick={handleBeatSelect}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </main>
      </div>

      <AddBeatChannelModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />

      <BeatPlayer
        beat={activeBeat}
        onClose={() => setActiveBeat(null)}
        onBeatSelect={(beat) => setActiveBeat(beat)}
      />
    </div>
  );
}
