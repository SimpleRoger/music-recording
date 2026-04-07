import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Loader2, Plus, Music2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { searchBeatChannels } from "@workspace/api-client-react";
import { useAddBeatChannel } from "../hooks/use-beat-channels";

function formatSubs(count: string | null | undefined): string {
  if (!count) return "";
  const n = parseInt(count, 10);
  if (isNaN(n)) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M subscribers`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K subscribers`;
  return `${n} subscribers`;
}

interface AddBeatChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddBeatChannelModal({ isOpen, onClose }: AddBeatChannelModalProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const addBeatChannel = useAddBeatChannel();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (isOpen) { setQuery(""); setDebouncedQuery(""); setTimeout(() => inputRef.current?.focus(), 80); }
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && isOpen) onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const { data: results, isLoading: isSearching } = useQuery({
    queryKey: ["beat-channel-search", debouncedQuery],
    queryFn: () => searchBeatChannels({ q: debouncedQuery }),
    enabled: debouncedQuery.trim().length >= 2,
    staleTime: 1000 * 30,
  });

  const handleAdd = async (channelId: string) => {
    setAddingId(channelId);
    try {
      await addBeatChannel.mutateAsync(channelId);
      onClose();
    } catch {
      // error handled silently
    } finally {
      setAddingId(null);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="relative z-10 w-full max-w-md bg-surface border border-border rounded-2xl overflow-hidden shadow-xl"
          >
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Music2 className="w-4 h-4 text-primary" />
                <h2 className="font-bold text-text-main">Add Beat Channel</h2>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-full hover:bg-surface-hover text-text-muted hover:text-text-main transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search beat producers or paste @handle..."
                  className="w-full pl-9 pr-4 py-2.5 bg-background border border-border rounded-xl text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition-colors"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted animate-spin" />
                )}
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-border">
              {results?.map((ch) => (
                <div key={ch.youtubeChannelId} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors">
                  {ch.thumbnailUrl ? (
                    <img src={ch.thumbnailUrl} alt={ch.name} className="w-10 h-10 rounded-full object-cover shrink-0 border border-border" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center text-sm font-bold text-text-muted border border-border shrink-0">
                      {ch.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-main truncate">{ch.name}</p>
                    {ch.subscriberCount && (
                      <p className="text-xs text-text-muted">{formatSubs(ch.subscriberCount)}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleAdd(ch.youtubeChannelId)}
                    disabled={addingId === ch.youtubeChannelId}
                    className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    {addingId === ch.youtubeChannelId
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Plus className="w-3 h-3" />}
                    Add
                  </button>
                </div>
              ))}

              {!isSearching && debouncedQuery.length >= 2 && (!results || results.length === 0) && (
                <p className="px-4 py-6 text-sm text-text-muted text-center">No channels found for "{debouncedQuery}"</p>
              )}

              {debouncedQuery.length < 2 && (
                <p className="px-4 py-6 text-sm text-text-muted text-center">Type a beat producer name to search</p>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
