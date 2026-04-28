import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "wouter";
import {
  Plus, Youtube, AlertCircle, RefreshCw, Music2, FileText,
  Mic, Clock, Flame, Bookmark, Wand2, Search, X, Loader2, MoonStar,
} from "lucide-react";
import { BedtimeButton } from "../components/bedtime-button";
import { useBedtime } from "../hooks/use-bedtime";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../lib/utils";
import { useVideos } from "../hooks/use-videos";
import { useChannels } from "../hooks/use-channels";
import { useVideoSearch } from "../hooks/use-video-search";
import { VideoCard } from "../components/video-card";
import { VideoSkeleton } from "../components/video-skeleton";
import { ChannelSidebar } from "../components/channel-sidebar";
import { AddChannelModal } from "../components/add-channel-modal";
import { VideoPlayerModal } from "../components/video-player-modal";
import type { Video } from "@workspace/api-client-react";

export default function Home() {
  const [selectedChannelId, setSelectedChannelId] = useState<number | undefined>();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeVideo, setActiveVideo] = useState<Video | null>(null);
  const [order, setOrder] = useState<"recent" | "popular">("recent");

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { state: searchState, search, clear: clearSearch } = useVideoSearch();

  const { isLocked, cutoffLabel } = useBedtime();

  const { data: channels } = useChannels();
  const { data: videos, isLoading: isVideosLoading, isError, error, refetch } = useVideos(selectedChannelId, order);

  const isKeyError = isError && String(error).toLowerCase().includes("key");
  const isSearching = searchState.status !== "idle";

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setInputValue("");
    clearSearch();
  }, [clearSearch]);

  const handleSearchSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (inputValue.trim()) search(inputValue.trim());
  }, [inputValue, search]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && searchOpen) closeSearch(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchOpen, closeSearch]);

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

          {/* Nav tabs — hidden when search bar is open on small screens */}
          <nav className={cn(
            "flex items-center gap-1 bg-surface/60 border border-border rounded-xl px-1.5 py-1 transition-all",
            searchOpen ? "hidden xl:flex" : "flex",
          )}>
            <span className="px-3 py-1 rounded-lg text-sm font-semibold bg-primary/15 text-primary border border-primary/20">
              Feed
            </span>
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

        {/* Right side: search + add channel */}
        <div className="flex items-center gap-2 shrink-0">
          <AnimatePresence mode="wait">
            {searchOpen ? (
              <motion.form
                key="search-bar"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleSearchSubmit}
                className="flex items-center gap-2"
              >
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                  <input
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Search YouTube…"
                    className="h-9 pl-9 pr-4 w-48 sm:w-72 bg-surface border border-border rounded-xl text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!inputValue.trim() || searchState.status === "loading"}
                  className="h-9 px-4 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all flex items-center gap-1.5"
                >
                  {searchState.status === "loading"
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Search className="w-4 h-4" />}
                  Search
                </button>
                <button
                  type="button"
                  onClick={closeSearch}
                  className="h-9 w-9 flex items-center justify-center rounded-xl text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors"
                  title="Close search"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.form>
            ) : isLocked ? (
              <motion.div
                key="search-locked"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium select-none"
                title={`Searches locked after ${cutoffLabel}`}
              >
                <MoonStar className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Locked {cutoffLabel}</span>
              </motion.div>
            ) : (
              <motion.button
                key="search-icon"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={openSearch}
                className="h-9 w-9 flex items-center justify-center rounded-xl text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors"
                title="Search YouTube"
              >
                <Search className="w-5 h-5" />
              </motion.button>
            )}
          </AnimatePresence>

          <BedtimeButton />

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg font-medium text-sm transition-all shadow-[0_0_15px_rgba(255,0,0,0.3)] hover:shadow-[0_0_20px_rgba(255,0,0,0.5)] flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Channel</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex max-w-[1800px] w-full mx-auto relative">
        {/* Desktop Sidebar — hidden during search */}
        {!isSearching && (
          <aside className="hidden lg:block w-72 shrink-0 border-r border-border p-6 h-[calc(100vh-4rem)] sticky top-16 overflow-y-auto">
            <ChannelSidebar
              layout="vertical"
              selectedId={selectedChannelId}
              onSelect={setSelectedChannelId}
              onAddClick={() => setIsAddModalOpen(true)}
            />
          </aside>
        )}

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0">

          {/* ── SEARCH RESULTS ── */}
          <AnimatePresence mode="wait">
            {isSearching && (
              <motion.div key="search-results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {/* Header row */}
                <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="text-2xl font-display font-bold text-text-main">
                      {searchState.status === "loading"
                        ? "Searching…"
                        : `Results for "${searchState.query}"`}
                    </h2>
                    {searchState.status === "done" && (
                      <p className="text-text-muted text-sm mt-0.5">
                        {searchState.results.length} video{searchState.results.length !== 1 ? "s" : ""} found
                      </p>
                    )}
                  </div>
                  <button
                    onClick={closeSearch}
                    className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-main transition-colors"
                  >
                    <X className="w-4 h-4" /> Back to feed
                  </button>
                </div>

                {/* Loading skeleton */}
                {searchState.status === "loading" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-4 gap-y-8 sm:gap-x-6">
                    {Array.from({ length: 10 }).map((_, i) => <VideoSkeleton key={i} />)}
                  </div>
                )}

                {/* Error */}
                {searchState.status === "error" && (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <AlertCircle className="w-10 h-10 text-primary mb-4" />
                    <p className="text-text-muted">{searchState.error}</p>
                    <button
                      onClick={() => search(searchState.query)}
                      className="mt-4 px-4 py-2 bg-surface-hover hover:bg-border rounded-xl text-sm font-medium transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* No results */}
                {searchState.status === "done" && searchState.results.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Youtube className="w-10 h-10 text-text-muted/50 mb-4" />
                    <p className="text-text-muted">No videos found for "{searchState.query}"</p>
                  </div>
                )}

                {/* Results grid */}
                {searchState.status === "done" && searchState.results.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-4 gap-y-8 sm:gap-x-6">
                    {searchState.results.map((video, i) => (
                      <motion.div
                        key={`${video.videoId}-${i}`}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.4) }}
                      >
                        <VideoCard video={video} onClick={setActiveVideo} />
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── NORMAL FEED ── */}
            {!isSearching && (
              <motion.div key="feed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {/* Mobile channel list */}
                <div className="block lg:hidden mb-6 overflow-x-auto pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6 hide-scrollbar relative">
                  <ChannelSidebar
                    layout="horizontal"
                    selectedId={selectedChannelId}
                    onSelect={setSelectedChannelId}
                    onAddClick={() => setIsAddModalOpen(true)}
                  />
                </div>

                <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
                  <h2 className="text-2xl font-display font-bold text-text-main">
                    {selectedChannelId
                      ? channels?.find(c => c.id === selectedChannelId)?.name || "Channel Videos"
                      : order === "popular" ? "Most Popular" : "Recent Uploads"}
                  </h2>

                  <div className="flex items-center gap-2">
                    {(channels?.length ?? 0) > 0 && (
                      <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1">
                        <button
                          onClick={() => setOrder("recent")}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                            order === "recent"
                              ? "bg-primary text-white shadow"
                              : "text-text-muted hover:text-text-main hover:bg-surface-hover"
                          )}
                        >
                          <Clock className="w-3.5 h-3.5" /> Recent
                        </button>
                        <button
                          onClick={() => setOrder("popular")}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                            order === "popular"
                              ? "bg-primary text-white shadow"
                              : "text-text-muted hover:text-text-main hover:bg-surface-hover"
                          )}
                        >
                          <Flame className="w-3.5 h-3.5" /> Popular
                        </button>
                      </div>
                    )}
                    <button
                      onClick={() => refetch()}
                      disabled={isVideosLoading}
                      className="p-2 text-text-muted hover:text-white rounded-full hover:bg-surface-hover transition-colors disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      title="Refresh feed"
                    >
                      <RefreshCw className={cn("w-5 h-5", isVideosLoading && "animate-spin")} />
                    </button>
                  </div>
                </div>

                {isError ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="p-8 sm:p-12 bg-surface rounded-2xl border border-red-500/20 text-center max-w-2xl mx-auto mt-10 shadow-xl"
                  >
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                      <AlertCircle className="w-8 h-8 text-primary" />
                    </div>
                    <h3 className="text-2xl font-display font-bold text-text-main mb-3">
                      {isKeyError ? "API Configuration Required" : "Failed to load videos"}
                    </h3>
                    <p className="text-text-muted mb-6 text-lg">
                      {isKeyError
                        ? "The YouTube Data API key is not configured. Please add it to your secrets."
                        : "We encountered an unexpected error. Please try again."}
                    </p>
                    {!isKeyError && (
                      <button onClick={() => refetch()} className="px-6 py-3 bg-surface-hover hover:bg-border rounded-xl font-medium transition-colors">
                        Try Again
                      </button>
                    )}
                  </motion.div>
                ) : isVideosLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-4 gap-y-8 sm:gap-x-6">
                    {Array.from({ length: 10 }).map((_, i) => <VideoSkeleton key={i} />)}
                  </div>
                ) : channels?.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center py-20 sm:py-32 text-center px-4"
                  >
                    <div className="w-24 h-24 bg-surface rounded-full flex items-center justify-center mb-6 shadow-2xl border border-border">
                      <Youtube className="w-12 h-12 text-border-hover" />
                    </div>
                    <h2 className="text-3xl font-display font-bold text-text-main mb-3">Your Feed is Empty</h2>
                    <p className="text-text-muted max-w-md mb-8 text-lg">
                      Add your favorite creators to see their latest videos, or use the search button to find any video on YouTube.
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="bg-primary hover:bg-primary-hover text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5"
                      >
                        Add Your First Channel
                      </button>
                      <button
                        onClick={openSearch}
                        className="px-8 py-4 rounded-xl font-semibold text-lg border border-border hover:bg-surface-hover transition-all flex items-center gap-2 text-text-muted hover:text-text-main"
                      >
                        <Search className="w-5 h-5" /> Search
                      </button>
                    </div>
                  </motion.div>
                ) : videos?.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                    <div className="w-16 h-16 bg-surface rounded-full flex items-center justify-center mb-4">
                      <Youtube className="w-8 h-8 text-text-muted/50" />
                    </div>
                    <h3 className="text-xl font-display font-semibold text-text-main mb-2">No recent videos</h3>
                    <p className="text-text-muted">
                      {selectedChannelId
                        ? "This channel hasn't uploaded anything in the last 3 months."
                        : "None of your channels have uploaded recently."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-4 gap-y-8 sm:gap-x-6">
                    {videos?.map((video, index) => (
                      <motion.div
                        key={`${video.videoId}-${index}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.5), ease: "easeOut" }}
                      >
                        <VideoCard video={video} onClick={setActiveVideo} />
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <AddChannelModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
      <VideoPlayerModal video={activeVideo} onClose={() => setActiveVideo(null)} />
    </div>
  );
}
