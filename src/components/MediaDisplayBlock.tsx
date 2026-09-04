import React, { useState } from "react";
import { AlertCircle, Check, Download, Play, RefreshCw } from "lucide-react";
import { GenerativeCanvasLoading } from "./GenerativeCanvasLoading";

interface MediaDisplayBlockProps {
  mediaType?: "image" | "video";
  mediaUrl?: string;
  mediaPrompt?: string;
  mediaError?: boolean;
  isLoading?: boolean;
  onRegenerate: (prompt: string, mediaType: "image" | "video") => void;
  onAnimateToVideo?: (prompt: string, imageUrl: string) => void;
  onRefinePrompt: (refinePrompt: string, mediaType: "image" | "video") => void;
}

export const MediaDisplayBlock: React.FC<MediaDisplayBlockProps> = ({
  mediaType = "image",
  mediaUrl,
  mediaPrompt = "",
  mediaError = false,
  isLoading = false,
  onRegenerate,
  onAnimateToVideo,
  onRefinePrompt,
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const isVideo = mediaType === "video";

  // Error state
  if (mediaError) {
    return (
      <div className="my-3 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 max-w-lg space-y-2.5 select-none animate-in fade-in duration-200">
        <div className="flex items-center space-x-2 font-semibold text-sm">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span>Generation Failed</span>
        </div>
        <p className="text-xs text-red-600 dark:text-red-400">
          Failed to generate {mediaType}. Please check your prompt or connection and try again.
        </p>
        <button
          type="button"
          onClick={() => onRegenerate(mediaPrompt, mediaType)}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Try again</span>
        </button>
      </div>
    );
  }

  // Active generation / no URL yet
  if (!mediaUrl) {
    return (
      <div className="my-3 max-w-lg w-full">
        <GenerativeCanvasLoading
          prompt={mediaPrompt || "Creating visual"}
          mediaType={mediaType}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-3 my-3 max-w-lg w-full">
      {/* Container with crossfade from canvas animation to real image */}
      <div className="relative group rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-xl bg-[#161615] aspect-square max-h-[500px]">
        {/* Generative Canvas loader underneath while image is resolving/loading */}
        <div
          className={`absolute inset-0 z-0 transition-opacity duration-600 ease-out ${
            imageLoaded ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          <GenerativeCanvasLoading
            prompt={mediaPrompt || "Creating visual"}
            mediaType={mediaType}
            isResolved={imageLoaded}
          />
        </div>

        {/* Final Rendered Media (Crossfades in) */}
        {isVideo ? (
          <video
            src={mediaUrl}
            controls
            autoPlay
            loop
            playsInline
            onLoadedData={() => setImageLoaded(true)}
            className={`w-full h-full object-cover rounded-2xl relative z-10 transition-opacity duration-600 ease-out ${
              imageLoaded ? "opacity-100" : "opacity-0"
            }`}
          />
        ) : (
          <img
            src={mediaUrl}
            alt={mediaPrompt || "Generated Media"}
            referrerPolicy="no-referrer"
            onLoad={() => setImageLoaded(true)}
            className={`w-full h-full object-cover rounded-2xl relative z-10 transition-all duration-600 ease-out ${
              imageLoaded ? "opacity-100 scale-100" : "opacity-0 scale-[0.98]"
            } group-hover:scale-[1.01]`}
          />
        )}

        {/* Hover action bar */}
        {imageLoaded && (
          <div className="absolute top-3 right-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1.5 bg-black/70 backdrop-blur-md p-1.5 rounded-xl text-white shadow-md">
            <a
              href={mediaUrl}
              download={isVideo ? `zen_video_${Date.now()}.webm` : `zen_image_${Date.now()}.jpg`}
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors cursor-pointer"
              title="Download file"
            >
              <Download className="w-4 h-4" />
            </a>
          </div>
        )}
      </div>

      {/* Primary Action Buttons */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onRegenerate(mediaPrompt, isVideo ? "video" : "image")}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#48A04C]" />
          <span>Regenerate</span>
        </button>

        {!isVideo && onAnimateToVideo && (
          <button
            type="button"
            disabled={isLoading}
            onClick={() => onAnimateToVideo(mediaPrompt, mediaUrl)}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-purple-50 dark:bg-purple-950/50 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 font-semibold transition-colors cursor-pointer disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 text-purple-500" />
            <span>Animate into video</span>
          </button>
        )}

        <a
          href={mediaUrl}
          download={isVideo ? `zen_video_${Date.now()}.webm` : `zen_image_${Date.now()}.jpg`}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-emerald-500" />
          <span>Download</span>
        </a>
      </div>

      {/* Refinement Options */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="text-[11px] font-semibold text-zinc-400">Variations:</span>
        {(isVideo
          ? ["Slower motion", "Cyberpunk style", "3D camera orbit", "Warm sunset glow"]
          : ["More vibrant colors", "Cinematic lighting", "Pixel art style", "Minimalist aesthetic"]
        ).map((refineText, rIdx) => (
          <button
            key={rIdx}
            type="button"
            disabled={isLoading}
            onClick={() => onRefinePrompt(`${mediaPrompt || "scene"}, ${refineText}`, isVideo ? "video" : "image")}
            className="text-[11px] px-2.5 py-1 rounded-full bg-zinc-100/80 dark:bg-zinc-800/60 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors cursor-pointer disabled:opacity-50"
          >
            + {refineText}
          </button>
        ))}
      </div>
    </div>
  );
};
