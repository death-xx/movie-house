import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Film, ShoppingBag, Search, Tv } from "lucide-react";
import { VideoWithCategory, Category, CartItem } from "../types";
import { MovieCard } from "../components/customer/MovieCard";
import { VideoPlayer } from "../components/customer/VideoPlayer";
import { CartDrawer } from "../components/customer/CartDrawer";

export const CustomerApp: React.FC = () => {
  const [catalog, setCatalog] = useState<VideoWithCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [contentTypeFilter, setContentTypeFilter] = useState<"all" | "movie" | "series">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [previewMovie, setPreviewMovie] = useState<VideoWithCategory | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [serverOnline, setServerOnline] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadStoreData() {
      try {
        const [catRes, catalogRes] = await Promise.all([
          fetch("/api/categories", { signal: controller.signal }),
          fetch("/api/catalog", { signal: controller.signal }),
        ]);
        if (catRes.ok && catalogRes.ok) {
          const catData = await catRes.json();
          const catalogData = await catalogRes.json();
          setCategories(catData);
          setCatalog(catalogData);
          setServerOnline(true);
        }
      } catch (err) {
        if ((err as DOMException).name !== "AbortError") {
          setServerOnline(false);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadStoreData();
    return () => controller.abort();
  }, []);

  const handleAddToCart = useCallback((movie: VideoWithCategory) => {
    setCart((prev) => {
      if (prev.some((item) => item.video.id === movie.id)) return prev;
      return [
        ...prev,
        {
          video: movie,
          delivery_type: "usb_copy",
          price_ks: movie.price_ks,
        },
      ];
    });
  }, []);

  const handleRemoveFromCart = useCallback((videoId: string) => {
    setCart((prev) => prev.filter((item) => item.video.id !== videoId));
  }, []);

  const handleCheckout = useCallback(async (name: string, phone: string): Promise<boolean> => {
    const payload = {
      customer_name: name,
      customer_phone: phone || undefined,
      items: cart.map((item) => ({
        video_id: item.video.id,
        delivery_type: item.delivery_type,
      })),
    };

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return response.ok;
    } catch {
      return false;
    }
  }, [cart]);

  const cartIds = useMemo(() => new Set(cart.map((item) => item.video.id)), [cart]);

  // Memoized so filter logic only recomputes when inputs actually change.
  const filteredMovies = useMemo(() => {
    return catalog.filter((movie) => {
      const matchesCategory =
        selectedCategory === "all" || movie.category_id === selectedCategory;
      const matchesType =
        contentTypeFilter === "all" || movie.content_type === contentTypeFilter;
      const matchesSearch =
        movie.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (movie.description && movie.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesType && matchesSearch;
    });
  }, [catalog, selectedCategory, contentTypeFilter, searchQuery]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Customer Mobile Top Header */}
      <header className="sticky top-0 z-30 bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800 px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-pink-500 flex items-center justify-center shadow-md">
            <Film className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-extrabold text-sm tracking-wide text-white">Movie House Store</h1>
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  serverOnline ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                }`}
              />
              <span>{serverOnline ? "Connected to Local WiFi Hub" : "Offline Mode"}</span>
            </div>
          </div>
        </div>

        {/* Cart Trigger */}
        <button
          onClick={() => setIsCartOpen(true)}
          className="relative p-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition shadow border border-zinc-700"
        >
          <ShoppingBag className="w-5 h-5" />
          {cart.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-indigo-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-md animate-bounce">
              {cart.length}
            </span>
          )}
        </button>
      </header>

      {/* Main Browse Experience */}
      <main className="flex-1 p-4 max-w-4xl w-full mx-auto space-y-4">
        {/* Content Type Filter: All / Movies (200 Ks) / Series (150 Ks) */}
        <div className="grid grid-cols-3 gap-1.5 bg-zinc-900 p-1 rounded-2xl border border-zinc-800 text-xs">
          <button
            onClick={() => setContentTypeFilter("all")}
            className={`py-2 rounded-xl font-bold transition ${
              contentTypeFilter === "all"
                ? "bg-indigo-600 text-white shadow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            All Titles
          </button>
          <button
            onClick={() => setContentTypeFilter("movie")}
            className={`py-2 rounded-xl font-bold transition flex items-center justify-center gap-1 ${
              contentTypeFilter === "movie"
                ? "bg-indigo-600 text-white shadow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            Movies (200 Ks)
          </button>
          <button
            onClick={() => setContentTypeFilter("series")}
            className={`py-2 rounded-xl font-bold transition flex items-center justify-center gap-1 ${
              contentTypeFilter === "series"
                ? "bg-purple-600 text-white shadow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            Series (150 Ks)
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search movie names, series, anime..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        {/* Category Pills (Horizontal Scroll) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              selectedCategory === "all"
                ? "bg-indigo-600 text-white shadow"
                : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                selectedCategory === cat.id
                  ? "bg-indigo-600 text-white shadow"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Movie & Series Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 pt-2">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="h-56 bg-zinc-900/60 border border-zinc-800 rounded-2xl animate-pulse"
              />
            ))}
          </div>
        ) : filteredMovies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-zinc-500">
            <Film className="w-12 h-12 mb-3 text-zinc-700 stroke-[1.2]" />
            <p className="text-sm font-semibold">No titles found in this category</p>
            <p className="text-xs text-zinc-600 mt-1">Try selecting another category or filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 pt-1">
            {filteredMovies.map((movie) => (
              <MovieCard
                key={movie.id}
                movie={movie}
                onPreview={setPreviewMovie}
                onAddToCart={handleAddToCart}
                isInCart={cartIds.has(movie.id)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Video Streaming Preview Modal */}
      {previewMovie && (
        <VideoPlayer
          videoId={previewMovie.id}
          title={previewMovie.title}
          onClose={() => setPreviewMovie(null)}
        />
      )}

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        onRemoveItem={handleRemoveFromCart}
        onCheckout={handleCheckout}
        onClearCart={() => setCart([])}
      />
    </div>
  );
};
