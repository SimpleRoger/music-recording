import { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "wouter";
import {
  Plus, Music2, AlertCircle, RefreshCw, FolderOpen, FileText,
  Search, X, SlidersHorizontal, Loader2, Mic, Bookmark, Wand2,
  BookmarkPlus, BookmarkCheck, Trash2, Clock, CheckCircle2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useBeats, useSearchBeats, type BeatSortOrder } from "../hooks/use-beats";
import { useBeatChannels, useRemoveBeatChannel } from "../hooks/use-beat-channels";
import { BeatCard } from "../components/beat-card";
import { BeatPlayer } from "../components/beat-player";
import { AddBeatChannelModal } from "../components/add-beat-channel-modal";
import { useListenedBeats } from "../hooks/use-listened-beats";
import type { Video } from "@workspace/api-client-react";
import {
  useListBeatSavedSearches,
  useAddBeatSavedSearch,
  useRemoveBeatSavedSearch,
  getListBeatSavedSearchesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const SORT_OPTIONS: { value: BeatSortOrder; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "date", label: "Latest" },
  { value: "viewCount", label: "Popular" },
];

type FilterMode = "all" | "new" | "heard";

export default function Beats() {
  const queryClient = useQueryClient();
  const [selectedChannelId, setSelectedChannelId] = useState<number | undefined>();
  const [activeSavedSearch, setActiveSavedSearch] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeBeat, setActiveBeat] = useState<Video | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<BeatSortOrder>("relevance");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [savedFlash, setSavedFlash] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { isListened } = useListenedBeats();

  const { data: channels } = useBeatChannels();
  const removeBeatChannel = useRemoveBeatChannel();
  const { data: savedSearches = [] } = useListBeatSavedSearches();

  const addSavedSearch = useAddBeatSavedSearch({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBeatSavedSearchesQueryKey() }),
    },
  });
  const removeSavedSearch = useRemoveBeatSavedSearch({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBeatSavedSearchesQueryKey() }),
    },
  });

  const { data: beats, isLoading: beatsLoading, isError, refetch } = useBeats(selectedChannelId);

  // The active search query: from saved search click or live typing
  const activeQuery = activeSavedSearch ?? searchQuery;
  const isSearchMode = activeQuery.trim().length >= 2;

  const { data: searchResults, isLoading: searchLoading } = useSearchBeats(activeQuery, sortOrder);

  // Debounce typed search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput);
      setActiveSavedSearch(null);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  const clearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
    setActiveSavedSearch(null);
    searchRef.current?.focus();
  };

  const handleSavedSearchClick = (query: string) => {
    setActiveSavedSearch(query);
    setSearchInput(query);
    setSearchQuery("");
    setSelectedChannelId(undefined);
    setFilterMode("all");
  };

  const currentQueryIsSaved = savedSearches.some(
    (s) => s.query.toLowerCase() === (searchInput || activeSavedSearch || "").toLowerCase()
  );

  const handleSaveSearch = () => {
    const q = (activeSavedSearch ?? searchInput).trim();
    if (!q) return;
    addSavedSearch.mutate({ data: { query: q } }, {
      onSuccess: () => {
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
      },
    });
  };

  const handleBeatSelect = useCallback((beat: Video) => setActiveBeat(beat), []);

  const rawBeats = isSearchMode ? searchResults : beats;
  const isLoading = isSearchMode ? searchLoading : beatsLoading;

  // Apply listened filter
  const displayBeats = rawBeats?.filter((b) => {
    if (filterMode === "new") return !isListened(b.videoId);
    if (filterMode === "heard") return isListened(b.videoId);
    return true;
  });

  const listenedCount = rawBeats?.filter((b) => isListened(b.videoId)).length ?? 0;
  const newCount = rawBeats ? rawBeats.length - listenedCount : 0;

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
          <nav className="flex items-center gap-1 bg-surface/60 border border-border rounded-xl px-1.5 py-1">
            <Link href="/">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer">
                <FolderOpen className="w-3.5 h-3.5" />Projects
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
      </header>

      {/* Sidebar + content */}
      <div className="flex flex-1 min-h-0 overflow-hidden" style={{ height: 'calc(100vh - 4rem)' }}>
        {/* Sidebar */}
        <aside className="w-64 shrink-0 border-r border-border flex flex-col bg-surface overflow-y-auto hidden sm:flex">

          {/* Beat Channels section */}
          <div className="px-4 pt-5 pb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-text-muted">Beat Channels</span>
            <span className="text-xs text-text-muted bg-background px-1.5 py-0.5 rounded-full border border-border">
              {channels?.length ?? 0}
            </span>
          </div>

          <button
            onClick={() => { setSelectedChannelId(undefined); clearSearch(); setFilterMode("all"); }}
            className={`mx-3 mb-1 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
              !selectedChannelId && !isSearchMode ? "bg-primary/10 text-primary border border-primary/20" : "text-text-muted hover:text-text-main hover:bg-surface-hover"
            }`}
          >
            <Music2 className="w-4 h-4 shrink-0" />
            All Beats
          </button>

          <div className="flex flex-col gap-0.5 px-3 pb-3">
            {channels?.map((ch) => (
              <div key={ch.id} className="group relative">
                <button
                  onClick={() => { setSelectedChannelId(ch.id === selectedChannelId ? undefined : ch.id); clearSearch(); setFilterMode("all"); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                    selectedChannelId === ch.id && !isSearchMode ? "bg-primary/10 text-primary border border-primary/20" : "text-text-muted hover:text-text-main hover:bg-surface-hover"
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

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="mx-3 mb-4 flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-text-muted hover:text-primary hover:bg-surface-hover border border-dashed border-border hover:border-primary/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Beat Channel
          </button>

          {/* Divider */}
          <div className="mx-3 border-t border-border mb-2" />

          {/* Saved Searches section */}
          <div className="px-4 pb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-text-muted">Saved Searches</span>
            <span className="text-xs text-text-muted bg-background px-1.5 py-0.5 rounded-full border border-border">
              {savedSearches.length}
            </span>
          </div>

          {savedSearches.length === 0 && (
            <p className="px-4 pb-3 text-xs text-text-muted/60 leading-relaxed">
              Search for a beat type above, then click the bookmark icon to save it here.
            </p>
          )}

          <div className="flex flex-col gap-0.5 px-3 pb-4 flex-1">
            {savedSearches.map((s) => (
              <div key={s.id} className="group relative">
                <button
                  onClick={() => handleSavedSearchClick(s.query)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                    activeSavedSearch === s.query
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-text-muted hover:text-text-main hover:bg-surface-hover"
                  }`}
                >
                  <Search className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  <span className="truncate">{s.query}</span>
                </button>
                <button
                  onClick={() => removeSavedSearch.mutate({ id: s.id })}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-400 transition-all p-1 rounded bg-surface-hover"
                  title="Remove saved search"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 min-h-0">
          {/* Search bar + save button */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                <input
                  ref={searchRef}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder='Search beats — try "steve lacy type beat"'
                  className="w-full pl-10 pr-10 py-3 bg-surface border border-border rounded-xl text-sm text-text-main placeholder:text-text-muted/50 focus:outline-none focus:border-primary/50 transition-colors"
                />
                {searchInput && !isSearchMode && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                {isSearchMode && searchLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted animate-spin" />
                )}
                {isSearchMode && !searchLoading && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Save search button */}
              {isSearchMode && (
                <button
                  onClick={handleSaveSearch}
                  disabled={currentQueryIsSaved || addSavedSearch.isPending}
                  title={currentQueryIsSaved ? "Already saved" : "Save this search"}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-3 rounded-xl border text-sm font-medium transition-all ${
                    savedFlash
                      ? "bg-green-500/15 border-green-500/30 text-green-400 cursor-default"
                      : currentQueryIsSaved
                      ? "bg-primary/10 border-primary/20 text-primary cursor-default"
                      : "bg-surface border-border text-text-muted hover:text-primary hover:border-primary/30 hover:bg-surface-hover"
                  }`}
                >
                  {savedFlash
                    ? <BookmarkCheck className="w-4 h-4" />
                    : currentQueryIsSaved
                    ? <BookmarkCheck className="w-4 h-4" />
                    : <BookmarkPlus className="w-4 h-4" />}
                  <span className="text-xs">{savedFlash ? "Saved!" : currentQueryIsSaved ? "Saved" : "Save"}</span>
                </button>
              )}
            </div>

            {/* Sort + filter tabs — visible in search mode */}
            <AnimatePresence>
              {isSearchMode && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-2">
                    {/* Sort row */}
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-text-muted shrink-0" />
                      <span className="text-xs text-text-muted font-medium">Sort:</span>
                      <div className="flex items-center gap-1">
                        {SORT_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setSortOrder(opt.value)}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                              sortOrder === opt.value
                                ? "bg-primary text-white shadow-sm"
                                : "bg-surface border border-border text-text-muted hover:text-text-main hover:border-border-hover"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Listened filter row */}
                    {rawBeats && rawBeats.length > 0 && (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-text-muted shrink-0" />
                        <span className="text-xs text-text-muted font-medium">Show:</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setFilterMode("all")}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                              filterMode === "all"
                                ? "bg-primary text-white shadow-sm"
                                : "bg-surface border border-border text-text-muted hover:text-text-main"
                            }`}
                          >
                            All ({rawBeats.length})
                          </button>
                          <button
                            onClick={() => setFilterMode("new")}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                              filterMode === "new"
                                ? "bg-primary text-white shadow-sm"
                                : "bg-surface border border-border text-text-muted hover:text-text-main"
                            }`}
                          >
                            <Clock className="w-3 h-3 inline mr-1" />
                            New ({newCount})
                          </button>
                          <button
                            onClick={() => setFilterMode("heard")}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                              filterMode === "heard"
                                ? "bg-primary text-white shadow-sm"
                                : "bg-surface border border-border text-text-muted hover:text-text-main"
                            }`}
                          >
                            <CheckCircle2 className="w-3 h-3 inline mr-1" />
                            Heard ({listenedCount})
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Mobile-only saved searches chips — always visible below search bar on small screens */}
          {savedSearches.length > 0 && (
            <div className="flex sm:hidden items-center gap-2 -mt-1 overflow-x-auto pb-1 scrollbar-hide">
              <Bookmark className="w-3.5 h-3.5 text-text-muted shrink-0" />
              {savedSearches.map((s) => (
                <div key={s.id} className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => handleSavedSearchClick(s.query)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                      activeSavedSearch === s.query
                        ? "bg-primary text-white border-primary"
                        : "bg-surface border-border text-text-muted hover:text-text-main"
                    }`}
                  >
                    {s.query}
                  </button>
                  <button
                    onClick={() => removeSavedSearch.mutate({ id: s.id })}
                    className="p-0.5 text-text-muted/40 hover:text-red-400 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Mobile add channel */}
          {!isSearchMode && (
            <div className="flex sm:hidden items-center justify-between">
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
          )}

          {/* Empty state — no channels */}
          {!isSearchMode && !isLoading && !isError && (!displayBeats || displayBeats.length === 0) && (
            <div className="flex flex-col items-center justify-center flex-1 text-center py-16">
              <div className="w-20 h-20 rounded-full bg-surface border border-border flex items-center justify-center mb-6">
                <Music2 className="w-9 h-9 text-text-muted/40" />
              </div>
              <h2 className="text-2xl font-bold text-text-main mb-2">No beats yet</h2>
              <p className="text-text-muted max-w-sm mb-8 text-sm leading-relaxed">
                Add beat producers to see their latest uploads, or search above to find any beat on YouTube.
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

          {/* Search empty state */}
          {isSearchMode && !searchLoading && (!displayBeats || displayBeats.length === 0) && (
            <div className="flex flex-col items-center justify-center flex-1 text-center py-16">
              {filterMode !== "all" ? (
                <>
                  <CheckCircle2 className="w-10 h-10 text-text-muted/30 mb-4" />
                  <p className="text-text-main font-semibold mb-1">
                    {filterMode === "new" ? "You've heard them all!" : "None heard yet"}
                  </p>
                  <p className="text-text-muted text-sm">
                    {filterMode === "new"
                      ? "Switch to \"All\" or \"Heard\" to browse."
                      : "Play some beats and they'll show up here."}
                  </p>
                  <button onClick={() => setFilterMode("all")} className="mt-4 text-primary text-sm underline">
                    Show all
                  </button>
                </>
              ) : (
                <>
                  <Search className="w-10 h-10 text-text-muted/30 mb-4" />
                  <p className="text-text-main font-semibold mb-1">No results for "{activeQuery}"</p>
                  <p className="text-text-muted text-sm">Try a different search term or sort order</p>
                </>
              )}
            </div>
          )}

          {/* Error state */}
          {isError && !isSearchMode && (
            <div className="flex flex-col items-center justify-center flex-1 gap-4 py-16">
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
          {!isLoading && displayBeats && displayBeats.length > 0 && (
            <div className="flex flex-col gap-2">
              {isSearchMode && (
                <p className="text-xs text-text-muted pb-1">
                  {filterMode === "all" && <>Showing top results for <span className="text-text-main font-medium">"{activeQuery}"</span></>}
                  {filterMode === "new" && <><Clock className="w-3 h-3 inline mr-1" />Unheard beats for <span className="text-text-main font-medium">"{activeQuery}"</span></>}
                  {filterMode === "heard" && <><CheckCircle2 className="w-3 h-3 inline mr-1" />Beats you've heard for <span className="text-text-main font-medium">"{activeQuery}"</span></>}
                </p>
              )}
              {displayBeats.map((beat, index) => (
                <motion.div
                  key={`${beat.videoId}-${index}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.3) }}
                >
                  <BeatCard
                    beat={beat}
                    isPlaying={activeBeat?.videoId === beat.videoId}
                    listened={isListened(beat.videoId)}
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
