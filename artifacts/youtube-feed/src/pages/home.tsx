import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  FolderOpen, Music2, FileText, Mic, Wand2, Bookmark,
  Sliders, Plus, Loader2, Trash2, CloudUpload, Calendar, Layers,
} from "lucide-react";
import { motion } from "framer-motion";

type SavedProject = {
  id: number;
  name: string;
  beatVideoId: string;
  beatTitle: string;
  beatChannelName: string;
  beatThumbnailUrl: string;
  lanes: Array<{ id: number; objectPath: string | null }>;
  createdAt: string;
  updatedAt: string;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

export default function Home() {
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

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
                  {/* Thumbnail */}
                  <div className="relative aspect-video bg-background overflow-hidden">
                    <img
                      src={proj.beatThumbnailUrl}
                      alt={proj.beatTitle}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    {recordedCount > 0 && (
                      <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/70 text-white text-xs font-bold px-2 py-1 rounded-lg backdrop-blur-sm">
                        <Layers className="w-3 h-3 text-primary" />
                        {recordedCount} track{recordedCount !== 1 ? "s" : ""}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <p className="font-bold text-text-main text-sm truncate mb-0.5">{proj.name}</p>
                    <p className="text-xs text-text-muted truncate mb-1">{proj.beatChannelName}</p>
                    <div className="flex items-center gap-1 text-[11px] text-text-muted/60 mb-4">
                      <Calendar className="w-3 h-3" />
                      {fmtDate(proj.updatedAt ?? proj.createdAt)}
                    </div>

                    <div className="flex gap-2">
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
    </div>
  );
}
