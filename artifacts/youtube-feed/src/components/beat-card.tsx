import { Play, Music2, CheckCircle2 } from "lucide-react";
import type { Video } from "@workspace/api-client-react";
import { formatDuration } from "../lib/utils";

interface BeatCardProps {
  beat: Video;
  isPlaying: boolean;
  listened?: boolean;
  onClick: (beat: Video) => void;
}

export function BeatCard({ beat, isPlaying, listened = false, onClick }: BeatCardProps) {
  const duration = formatDuration(beat.duration);

  return (
    <button
      onClick={() => onClick(beat)}
      className={`group flex items-center gap-3 w-full p-3 rounded-xl border transition-all text-left ${
        isPlaying
          ? "bg-primary/10 border-primary/30"
          : listened
          ? "bg-surface border-border hover:border-border-hover hover:bg-surface-hover opacity-60"
          : "bg-surface border-border hover:border-border-hover hover:bg-surface-hover"
      }`}
    >
      {/* Thumbnail */}
      <div className="relative shrink-0 w-20 h-14 rounded-lg overflow-hidden bg-background">
        <img
          src={beat.thumbnailUrl}
          alt={beat.title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${isPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
          <div className="w-8 h-8 rounded-full bg-primary/90 flex items-center justify-center shadow-lg">
            {isPlaying
              ? <Music2 className="w-4 h-4 text-white animate-pulse" />
              : <Play className="w-4 h-4 text-white ml-0.5" fill="currentColor" />}
          </div>
        </div>
        {duration && (
          <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded">
            {duration}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col min-w-0 flex-1">
        <p className={`text-sm font-semibold line-clamp-2 leading-snug transition-colors ${isPlaying ? "text-primary" : "text-text-main group-hover:text-primary"}`}>
          {beat.title}
        </p>
        <p className="text-xs text-text-muted mt-0.5 truncate">{beat.channelName}</p>
      </div>

      {/* Listened badge */}
      {listened && !isPlaying && (
        <div className="shrink-0 flex items-center gap-1 text-text-muted/50">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="text-[10px] font-medium hidden sm:block">Heard</span>
        </div>
      )}
    </button>
  );
}
