import { formatDistanceToNow } from "date-fns";
import { Play } from "lucide-react";
import type { Video } from "@workspace/api-client-react";
import { formatViews, formatDuration } from "../lib/utils";

interface VideoCardProps {
  video: Video;
  onClick: (video: Video) => void;
}

export function VideoCard({ video, onClick }: VideoCardProps) {
  const publishedDate = new Date(video.publishedAt);
  const relativeDate = isNaN(publishedDate.getTime())
    ? video.publishedAt
    : formatDistanceToNow(publishedDate, { addSuffix: true });

  const durationFormatted = formatDuration(video.duration);

  return (
    <button
      onClick={() => onClick(video)}
      className="group flex flex-col gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-xl w-full"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video rounded-xl overflow-hidden bg-surface shadow-lg border border-border group-hover:border-border-hover transition-colors">
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          className="object-cover w-full h-full transition-transform duration-500 ease-out group-hover:scale-105"
          loading="lazy"
        />

        {/* Duration Pill */}
        {durationFormatted && (
          <div className="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-xs font-medium text-white backdrop-blur-sm">
            {durationFormatted}
          </div>
        )}

        {/* Play Overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <div className="w-14 h-14 bg-primary/90 text-white rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(255,0,0,0.4)] backdrop-blur-sm transform scale-90 group-hover:scale-100 transition-transform duration-300">
            <Play className="w-6 h-6 ml-1" fill="currentColor" />
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="flex gap-3 items-start pr-2">
        {video.channelThumbnailUrl ? (
          <img
            src={video.channelThumbnailUrl}
            alt={video.channelName}
            className="w-9 h-9 rounded-full object-cover bg-surface-hover shadow-md border border-border shrink-0 pt-0.5"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-surface-hover flex items-center justify-center text-xs font-bold text-text-muted border border-border shrink-0 mt-0.5">
            {video.channelName.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="flex flex-col min-w-0">
          <h3
            className="text-text-main font-semibold text-sm sm:text-base line-clamp-2 leading-snug group-hover:text-primary transition-colors duration-200"
            title={video.title}
          >
            {video.title}
          </h3>
          <div className="text-text-muted text-xs sm:text-sm mt-1.5 flex flex-col gap-0.5">
            <span className="font-medium line-clamp-1">{video.channelName}</span>
            <div className="flex items-center gap-1.5 whitespace-nowrap text-[13px]">
              {video.viewCount && <span>{formatViews(video.viewCount)} views</span>}
              {video.viewCount && <span className="w-1 h-1 rounded-full bg-text-muted/40 shrink-0" />}
              <span>{relativeDate}</span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
