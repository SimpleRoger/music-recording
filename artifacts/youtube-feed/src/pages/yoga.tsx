import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import {
  Dumbbell, Plus, Trash2, ExternalLink, Loader2, AlertCircle,
  X, Check, ArrowLeft, Play, Pencil, Tag,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDuration, formatViews } from "../lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
type YogaVideo = {
  id: number;
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  channelId: string;
  channelName: string;
  channelThumbnailUrl: string | null;
  viewCount: string | null;
  duration: string | null;
  publishedAt: string;
  category: string | null;
  savedAt: string;
};

// ── Default + localStorage tabs ────────────────────────────────────────────────
const DEFAULT_TABS = ["5 Min", "10 Min", "Full Body", "Upper Body", "Core", "Flexibility"];
const TABS_KEY = "yoga-custom-tabs";

function loadTabs(): string[] {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return DEFAULT_TABS;
}
function saveTabs(tabs: string[]) {
  localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
}

// ── Inline YouTube embed ───────────────────────────────────────────────────────
function VideoPlayer({ videoId, onClose }: { videoId: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/95 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative z-10 w-full max-w-5xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl"
        >
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
            title="Yoga video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-20 p-1.5 rounded-full bg-black/60 text-white/70 hover:text-white hover:bg-black/90 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ── Add Video Modal ────────────────────────────────────────────────────────────
function AddVideoModal({
  isOpen, onClose, tabs, onAdded,
}: {
  isOpen: boolean;
  onClose: () => void;
  tabs: string[];
  onAdded: () => void;
}) {
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    const trimmed = url.trim();
    if (!trimmed) { setError("Please paste a YouTube URL"); return; }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/yoga", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed, category: category || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add video");
      }
      setUrl(""); setCategory("");
      onAdded();
      onClose();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => { setUrl(""); setCategory(""); setError(null); onClose(); };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="relative z-10 w-full max-w-md bg-surface border border-border rounded-2xl p-5 shadow-2xl"
          >
            <button onClick={handleClose} className="absolute top-3 right-3 p-1.5 rounded-full text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors">
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
                <Dumbbell className="w-4 h-4 text-green-400" />
              </div>
              <div>
                <h3 className="font-bold text-text-main text-sm">Add Yoga Video</h3>
                <p className="text-text-muted text-xs">Paste a YouTube link to save it</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted block mb-1.5">YouTube URL</label>
                <input
                  autoFocus
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full h-10 px-3 bg-background border border-border rounded-xl text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted block mb-1.5">Category (optional)</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-10 px-3 bg-background border border-border rounded-xl text-sm text-text-main focus:outline-none focus:border-primary/50 transition-colors cursor-pointer"
                >
                  <option value="">— None —</option>
                  {tabs.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
                </div>
              )}

              <button
                onClick={handleAdd}
                disabled={loading}
                className="w-full h-10 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {loading ? "Adding…" : "Add Video"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ── Manage Tabs Modal ──────────────────────────────────────────────────────────
function ManageTabsModal({
  isOpen, onClose, tabs, onChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  tabs: string[];
  onChange: (tabs: string[]) => void;
}) {
  const [local, setLocal] = useState(tabs);
  const [newTab, setNewTab] = useState("");

  useEffect(() => { if (isOpen) setLocal(tabs); }, [isOpen, tabs]);

  const addTab = () => {
    const t = newTab.trim();
    if (!t || local.includes(t)) return;
    setLocal((p) => [...p, t]);
    setNewTab("");
  };

  const removeTab = (t: string) => setLocal((p) => p.filter((x) => x !== t));

  const handleSave = () => {
    onChange(local);
    saveTabs(local);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="relative z-10 w-full max-w-sm bg-surface border border-border rounded-2xl p-5 shadow-2xl"
          >
            <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-full text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors">
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 mb-4">
              <Tag className="w-4 h-4 text-green-400" />
              <h3 className="font-bold text-text-main text-sm">Manage Categories</h3>
            </div>

            <div className="flex gap-2 mb-3">
              <input
                value={newTab}
                onChange={(e) => setNewTab(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addTab(); }}
                placeholder="New category name…"
                className="flex-1 h-9 px-3 bg-background border border-border rounded-xl text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-green-500/50 transition-colors"
              />
              <button
                onClick={addTab}
                className="h-9 px-3 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto mb-4">
              {local.map((t) => (
                <div key={t} className="flex items-center justify-between px-3 py-2 bg-background rounded-xl border border-border">
                  <span className="text-sm text-text-main font-medium">{t}</span>
                  <button
                    onClick={() => removeTab(t)}
                    className="p-1 text-text-muted hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {local.length === 0 && (
                <p className="text-text-muted text-xs text-center py-3">No categories yet.</p>
              )}
            </div>

            <button
              onClick={handleSave}
              className="w-full h-9 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-500 text-white font-semibold text-sm rounded-xl transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> Save
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ── Category assign dropdown ───────────────────────────────────────────────────
function CategoryBadge({
  video, tabs, onUpdated,
}: {
  video: YogaVideo;
  tabs: string[];
  onUpdated: (v: YogaVideo) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const assign = async (cat: string | null) => {
    setOpen(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/yoga/${video.videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: cat }),
      });
      if (res.ok) onUpdated(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        disabled={loading}
        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
          video.category
            ? "bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20"
            : "bg-surface-hover border-border text-text-muted hover:text-text-main"
        }`}
      >
        {loading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Tag className="w-2.5 h-2.5" />}
        {video.category ?? "Tag"}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute left-0 top-full mt-1 z-30 bg-surface border border-border rounded-xl shadow-xl min-w-[130px] py-1 overflow-hidden"
          >
            <button
              onClick={() => assign(null)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors text-left"
            >
              <X className="w-3 h-3" /> No category
            </button>
            <div className="border-t border-border my-1" />
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => assign(t)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-hover transition-colors text-left ${
                  video.category === t ? "text-green-400 font-semibold" : "text-text-main"
                }`}
              >
                {video.category === t && <Check className="w-3 h-3 shrink-0" />}
                {t}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Video Card ─────────────────────────────────────────────────────────────────
function YogaVideoCard({
  video, tabs, onPlay, onDelete, onUpdated,
}: {
  video: YogaVideo;
  tabs: string[];
  onPlay: (v: YogaVideo) => void;
  onDelete: (videoId: string) => void;
  onUpdated: (v: YogaVideo) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const dur = formatDuration(video.duration);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/yoga/${video.videoId}`, { method: "DELETE" });
      onDelete(video.videoId);
    } catch { /* ignore */ }
    setDeleting(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="group bg-surface border border-border rounded-2xl overflow-hidden hover:border-green-500/30 transition-all duration-200 hover:shadow-lg hover:shadow-green-500/5"
    >
      {/* Thumbnail */}
      <div
        className="relative aspect-video bg-black cursor-pointer overflow-hidden"
        onClick={() => onPlay(video)}
      >
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {dur && (
          <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-mono px-1.5 py-0.5 rounded-md">
            {dur}
          </span>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/0 group-hover:bg-white/20 flex items-center justify-center transition-all duration-200 scale-90 group-hover:scale-100">
            <Play className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="white" />
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <h3
          className="text-sm font-semibold text-text-main leading-snug line-clamp-2 mb-1 cursor-pointer hover:text-green-400 transition-colors"
          onClick={() => onPlay(video)}
        >
          {video.title}
        </h3>
        <p className="text-[11px] text-text-muted truncate mb-2">{video.channelName}</p>
        {video.viewCount && (
          <p className="text-[10px] text-text-muted/70 mb-2">{formatViews(video.viewCount)} views</p>
        )}

        <div className="flex items-center justify-between gap-2">
          <CategoryBadge video={video} tabs={tabs} onUpdated={onUpdated} />
          <div className="flex items-center gap-1">
            <a
              href={`https://youtube.com/watch?v=${video.videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors"
              title="Open on YouTube"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Remove"
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function YogaPage() {
  const [videos, setVideos] = useState<YogaVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("All");
  const [tabs, setTabs] = useState<string[]>(loadTabs);
  const [showAdd, setShowAdd] = useState(false);
  const [showManageTabs, setShowManageTabs] = useState(false);
  const [playingVideo, setPlayingVideo] = useState<YogaVideo | null>(null);

  const fetchVideos = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/yoga");
      if (!res.ok) throw new Error("Failed to load videos");
      setVideos(await res.json());
    } catch { setError("Could not load yoga videos."); }
    setLoading(false);
  };

  useEffect(() => { fetchVideos(); }, []);

  const allTabs = ["All", ...tabs];

  const displayed = activeTab === "All"
    ? videos
    : videos.filter((v) => v.category === activeTab);

  const handleTabsChange = (newTabs: string[]) => {
    setTabs(newTabs);
    if (activeTab !== "All" && !newTabs.includes(activeTab)) setActiveTab("All");
  };

  const handleUpdated = (updated: YogaVideo) => {
    setVideos((p) => p.map((v) => v.id === updated.id ? updated : v));
  };

  return (
    <div className="min-h-screen bg-background font-sans">
      {/* Header */}
      <header className="h-16 border-b border-border glass-panel sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6 gap-3">
        <div className="flex items-center gap-3">
          <Link href="/">
            <span className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-main transition-colors cursor-pointer">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </span>
          </Link>
          <div className="w-px h-5 bg-border" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <Dumbbell className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <h1 className="font-bold text-text-main text-sm leading-tight">Yoga</h1>
              <p className="text-text-muted text-[10px]">{videos.length} video{videos.length !== 1 ? "s" : ""} saved</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowManageTabs(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text-main border border-border hover:border-border-hover rounded-xl transition-colors bg-surface hover:bg-surface-hover"
          >
            <Pencil className="w-3 h-3" />
            <span className="hidden sm:inline">Edit Categories</span>
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-500 rounded-xl transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Video
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-16 z-30 px-4 sm:px-6">
        <div className="flex gap-1 overflow-x-auto pb-px scrollbar-none">
          {allTabs.map((tab) => {
            const count = tab === "All" ? videos.length : videos.filter((v) => v.category === tab).length;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`shrink-0 flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab
                    ? "border-green-500 text-green-400"
                    : "border-transparent text-text-muted hover:text-text-main hover:border-border"
                }`}
              >
                {tab}
                {count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    activeTab === tab ? "bg-green-500/15 text-green-400" : "bg-surface-hover text-text-muted"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <main className="px-4 sm:px-6 py-6 max-w-7xl mx-auto">
        {loading && (
          <div className="flex items-center justify-center h-48 gap-3 text-text-muted">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading videos…</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-red-400">
            <AlertCircle className="w-8 h-8" />
            <p className="text-sm">{error}</p>
            <button onClick={fetchVideos} className="text-xs text-text-muted hover:text-text-main transition-colors underline">Try again</button>
          </div>
        )}

        {!loading && !error && displayed.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-text-muted">
            <div className="w-16 h-16 rounded-2xl bg-green-500/5 border border-green-500/10 flex items-center justify-center">
              <Dumbbell className="w-7 h-7 text-green-500/40" />
            </div>
            {activeTab === "All" ? (
              <>
                <p className="text-sm font-medium">No yoga videos yet</p>
                <p className="text-xs text-text-muted/70">Paste a YouTube link to start building your library.</p>
                <button
                  onClick={() => setShowAdd(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-semibold text-sm rounded-xl transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add Your First Video
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">No videos in "{activeTab}"</p>
                <p className="text-xs text-text-muted/70">Add a video and tag it as {activeTab}.</p>
              </>
            )}
          </div>
        )}

        {!loading && !error && displayed.length > 0 && (
          <AnimatePresence mode="popLayout">
            <motion.div
              layout
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
            >
              {displayed.map((video) => (
                <YogaVideoCard
                  key={video.id}
                  video={video}
                  tabs={tabs}
                  onPlay={setPlayingVideo}
                  onDelete={(vid) => setVideos((p) => p.filter((v) => v.videoId !== vid))}
                  onUpdated={handleUpdated}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      {/* Modals */}
      <AddVideoModal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        tabs={tabs}
        onAdded={fetchVideos}
      />
      <ManageTabsModal
        isOpen={showManageTabs}
        onClose={() => setShowManageTabs(false)}
        tabs={tabs}
        onChange={handleTabsChange}
      />
      {playingVideo && (
        <VideoPlayer videoId={playingVideo.videoId} onClose={() => setPlayingVideo(null)} />
      )}
    </div>
  );
}
