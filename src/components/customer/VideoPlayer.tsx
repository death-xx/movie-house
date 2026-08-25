import React, { useRef, useEffect } from "react";
import { X, ShieldCheck, Film } from "lucide-react";

interface VideoPlayerProps {
  videoId: string;
  title: string;
  onClose: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoId, title, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamUrl = `/stream/${videoId}`;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between p-4 md:p-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between text-white pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-lg">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm md:text-base text-white truncate max-w-xs md:max-w-md">
              {title}
            </h3>
            <p className="text-[11px] text-zinc-400">High-Speed Local WiFi Preview Stream</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-full transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Video Viewport with Range Request streaming */}
      <div className="relative flex-1 flex items-center justify-center my-4">
        <video
          ref={videoRef}
          src={streamUrl}
          controls
          autoPlay
          playsInline
          preload="metadata"
          className="w-full max-h-[70vh] rounded-2xl shadow-2xl bg-black border border-zinc-800/80 object-contain"
        />
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between text-xs text-zinc-500 pt-3 border-t border-zinc-800/60">
        <div className="flex items-center gap-1.5 text-emerald-400">
          <ShieldCheck className="w-4 h-4" />
          <span>Offline Direct Buffer (Zero Cellular Data)</span>
        </div>
        <span className="font-mono text-[11px] text-zinc-400">HTTP 206 Partial Content</span>
      </div>
    </div>
  );
};
