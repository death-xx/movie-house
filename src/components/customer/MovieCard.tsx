import React from "react";
import { Play, Plus, Clock, Film, Tv } from "lucide-react";
import { VideoWithCategory } from "../../types";

interface MovieCardProps {
  movie: VideoWithCategory;
  onPreview: (movie: VideoWithCategory) => void;
  onAddToCart: (movie: VideoWithCategory) => void;
  isInCart: boolean;
}

export const MovieCard: React.FC<MovieCardProps> = React.memo(
  ({
    movie,
    onPreview,
    onAddToCart,
    isInCart,
  }) => {
    const isSeries = movie.content_type === "series";

    return (
      <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-lg hover:border-zinc-700 transition duration-200 flex flex-col justify-between group">
        {/* Poster / Thumbnail Header */}
        <div className="relative h-40 bg-zinc-950 flex items-center justify-center overflow-hidden">
          {movie.thumbnail_url ? (
            <img
              src={movie.thumbnail_url}
              alt={movie.title}
              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-zinc-700">
              {isSeries ? (
                <Tv className="w-10 h-10 mb-1 stroke-[1.2] text-purple-400/80" />
              ) : (
                <Film className="w-10 h-10 mb-1 stroke-[1.2] text-indigo-400/80" />
              )}
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                {movie.category_name}
              </span>
            </div>
          )}

          {/* Category & Content Type Badge */}
          <span className="absolute top-2.5 left-2.5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-black/70 backdrop-blur-md text-zinc-300 border border-white/10 rounded-full flex items-center gap-1">
            {isSeries ? "Series Ep" : "Movie"}
          </span>

          {/* Play Trailer Overlay Button */}
          <button
            onClick={() => onPreview(movie)}
            className="absolute inset-0 m-auto w-11 h-11 bg-indigo-600/90 hover:bg-indigo-500 text-white rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95"
            title="Preview Trailer"
          >
            <Play className="w-4 h-4 ml-0.5 fill-white" />
          </button>

          {/* Price Tag in Kyats (e.g. 200 Ks / 150 Ks) */}
          <span className="absolute bottom-2.5 right-2.5 px-2.5 py-0.5 text-xs font-mono font-bold bg-emerald-950/90 text-emerald-400 border border-emerald-700/60 backdrop-blur-md rounded-lg shadow">
            {movie.price_ks} Ks
          </span>
        </div>

        {/* Content */}
        <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2.5">
          <div>
            <div className="flex items-center justify-between gap-1.5 mb-1">
              <h4 className="font-bold text-white text-xs line-clamp-1 group-hover:text-indigo-400 transition">
                {movie.title}
              </h4>
            </div>

            <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
              {movie.description || "High quality offline video file stored in local PC."}
            </p>
          </div>

          <div className="pt-2.5 border-t border-zinc-800/80 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 text-[10px] text-zinc-500 font-mono">
              <Clock className="w-3 h-3 text-zinc-400" />
              <span>{Math.floor(movie.duration_seconds / 60)}m</span>
            </div>

            <button
              onClick={() => onAddToCart(movie)}
              disabled={isInCart}
              className={`px-3 py-1 text-xs font-bold rounded-xl flex items-center gap-1 transition ${
                isInCart
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-950/50 active:scale-95"
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              {isInCart ? "Selected" : "Add to List"}
            </button>
          </div>
        </div>
      </div>
    );
  },
  (a, b) =>
    a.movie.id === b.movie.id &&
    a.isInCart === b.isInCart &&
    a.onAddToCart === b.onAddToCart &&
    a.onPreview === b.onPreview
);
