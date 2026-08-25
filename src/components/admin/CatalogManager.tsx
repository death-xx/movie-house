import React, { useEffect, useMemo, useState } from "react";
import { Check, Clock3, Film, FolderPlus, HardDrive, ListVideo, Pencil, Plus, Tag, Trash2, Tv, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Category, StorePricingSettings, Video } from "../../types";

type Workspace = "titles" | "categories";

const emptyForm = (categoryId = "", price = 0) => ({
  category_id: categoryId, content_type: "movie" as "movie" | "series", title: "", description: "",
  duration_minutes: 120, release_year: new Date().getFullYear(), price_ks: price, episode_count: 1,
  season_number: 1, video_path: "", hard_disk_label: "",
});

export const CatalogManager: React.FC = () => {
  const [workspace, setWorkspace] = useState<Workspace>("titles");
  const [movies, setMovies] = useState<Video[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pricing, setPricing] = useState({ movie: 200, series: 150 });
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [categoryName, setCategoryName] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(emptyForm());

  const loadData = async () => {
    setLoading(true);
    setMessage("");
    // Keep each part of the workspace available on its own. A damaged setting
    // or a temporary query error must not make saved categories disappear.
    const [titlesResult, categoriesResult] = await Promise.allSettled([
      invoke<Video[]>("get_all_movies"),
      invoke<Category[]>("get_all_categories"),
    ]);

    if (titlesResult.status === "fulfilled") setMovies(titlesResult.value);
    if (categoriesResult.status === "fulfilled") {
      setCategories(categoriesResult.value);
      setForm((current) => current.category_id || !categoriesResult.value.length ? current : { ...current, category_id: categoriesResult.value[0].id });
    }
    setLoading(false);

    const errors = [
      titlesResult.status === "rejected" ? `titles: ${readError(titlesResult.reason)}` : "",
      categoriesResult.status === "rejected" ? `categories: ${readError(categoriesResult.reason)}` : "",
    ].filter(Boolean);
    if (errors.length) {
      console.error("Movie store data failed to load", errors);
      setMessage(`Some Movie Store data could not load (${errors.join("; ")}). Your saved data has not been changed.`);
      return;
    }

    try {
      const storeSettings = await invoke<StorePricingSettings>("get_store_settings");
      setPricing({ movie: storeSettings.movie_price_ks, series: storeSettings.series_episode_price_ks });
    } catch (error) {
      console.error("Movie store pricing defaults failed to load", error);
      setMessage("Your catalog loaded, but saved price defaults could not be read. You can still enter any price when adding a title.");
    }
  };

  useEffect(() => { void loadData(); }, []);

  const filteredTitles = useMemo(
    () => categoryFilter === "all" ? movies : movies.filter((movie) => movie.category_id === categoryFilter),
    [movies, categoryFilter]
  );

  const openAddTitle = () => {
    setForm(emptyForm(categories[0]?.id, pricing.movie));
    setMessage("");
    setIsModalOpen(true);
  };

  const createCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!categoryName.trim()) return;
    setSaving(true); setMessage("");
    try {
      const created = await invoke<Category>("create_category", { payload: { name: categoryName } });
      setCategories((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setCategoryName("");
      setMessage(`“${created.name}” is ready to use.`);
    } catch (error) {
      setMessage(String(error));
    } finally { setSaving(false); }
  };

  const saveTitle = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.category_id || !form.title.trim() || !form.video_path.trim()) {
      setMessage("Choose a category, add a title, and provide the storage path."); return;
    }
    setSaving(true); setMessage("");
    try {
      await invoke("add_movie", { payload: {
        category_id: form.category_id, content_type: form.content_type, title: form.title.trim(),
        description: form.description.trim() || null, duration_seconds: Math.max(0, form.duration_minutes) * 60,
        release_year: form.release_year || null, price_ks: Math.max(0, form.price_ks),
        episode_number: null, episode_count: form.content_type === "series" ? Math.max(1, form.episode_count) : null,
        season_number: form.content_type === "series" ? Math.max(1, form.season_number) : null,
        series_title: form.content_type === "series" ? form.title.trim() : null,
        video_path: form.video_path.trim(), hard_disk_label: form.hard_disk_label.trim() || null,
        trailer_path: null, thumbnail_path: null,
      }});
      setIsModalOpen(false); setMessage("Title added to the movie store."); await loadData();
    } catch (error) { setMessage(`Could not save title: ${String(error)}`); }
    finally { setSaving(false); }
  };

  return <div className="space-y-5">
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-xl shadow-black/20">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-500 text-white shadow-lg shadow-indigo-950/50"><Film className="h-5 w-5" /></div><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">Movie store</p><h3 className="mt-1 text-xl font-bold text-white">Catalog workspace</h3><p className="mt-1 text-sm text-zinc-400">Organize local movies and series for your customers.</p></div></div>
        <button onClick={openAddTitle} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200"><Plus className="h-4 w-4" />Add title</button>
      </div>
      <div className="mt-6 flex gap-2 border-t border-zinc-800 pt-4"><TabButton active={workspace === "titles"} onClick={() => setWorkspace("titles")} icon={<ListVideo className="h-4 w-4" />} label="Movie list" /><TabButton active={workspace === "categories"} onClick={() => setWorkspace("categories")} icon={<Tag className="h-4 w-4" />} label="Category management" /></div>
    </section>

    {message && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-100"><span>{message}</span><button type="button" onClick={() => void loadData()} className="rounded-lg border border-indigo-300/30 px-3 py-1.5 text-xs font-bold text-indigo-100 hover:bg-indigo-400/15">Try again</button></div>}

    {loading ? <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-14 text-center text-sm text-zinc-400">Loading your movie store…</section> : workspace === "categories" ? <><CategoryManager categories={categories} movies={movies} name={categoryName} saving={saving} onNameChange={setCategoryName} onSubmit={createCategory} onChoose={(id) => { setCategoryFilter(id); setWorkspace("titles"); }} /><CategoryEditor categories={categories} movies={movies} onChanged={loadData} /></> : <TitleList categories={categories} movies={filteredTitles} activeCategory={categoryFilter} onCategoryChange={setCategoryFilter} />}

    {isModalOpen && <AddTitleModal categories={categories} form={form} pricing={pricing} saving={saving} onClose={() => setIsModalOpen(false)} onChange={(partial) => setForm((current) => ({ ...current, ...partial }))} onSubmit={saveTitle} />}
  </div>;
};

function readError(error: unknown) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  try { return JSON.stringify(error); } catch { return "Unknown error"; }
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button type="button" onClick={onClick} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${active ? "bg-indigo-500 text-white shadow-lg shadow-indigo-950/50" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}>{icon}{label}</button>;
}

function CategoryManager({ categories, movies, name, saving, onNameChange, onSubmit, onChoose }: { categories: Category[]; movies: Video[]; name: string; saving: boolean; onNameChange: (value: string) => void; onSubmit: (event: React.FormEvent) => void; onChoose: (id: string) => void }) {
  return <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/10 text-amber-400"><FolderPlus className="h-5 w-5" /></div><div><h4 className="font-bold text-white">Categories</h4><p className="text-xs text-zinc-400">Create categories in English or Myanmar language, then assign titles to them.</p></div></div><form onSubmit={onSubmit} className="mt-5 flex gap-2"><input value={name} onChange={(event) => onNameChange(event.target.value)} maxLength={80} placeholder="e.g. Myanmar Comedy, 2026 New Releases" className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-400" /><button disabled={saving} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400 disabled:opacity-50">Add category</button></form><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{categories.map((category) => { const count = movies.filter((movie) => movie.category_id === category.id).length; return <button key={category.id} type="button" onClick={() => onChoose(category.id)} className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 text-left transition hover:border-indigo-400/50 hover:bg-zinc-800/70"><p className="font-semibold text-white">{category.name}</p><p className="mt-1 text-xs text-zinc-500">{count} {count === 1 ? "title" : "titles"}</p></button>; })}</div></section>;
}

function TitleList({ categories, movies, activeCategory, onCategoryChange }: { categories: Category[]; movies: Video[]; activeCategory: string; onCategoryChange: (id: string) => void }) {
  const categoryName = (id: string) => categories.find((category) => category.id === id)?.name || "Uncategorized";
  return <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6"><div className="flex gap-2 overflow-x-auto pb-1"><button onClick={() => onCategoryChange("all")} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold ${activeCategory === "all" ? "bg-indigo-500 text-white" : "bg-zinc-800 text-zinc-400"}`}>All titles</button>{categories.map((category) => <button key={category.id} onClick={() => onCategoryChange(category.id)} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold ${activeCategory === category.id ? "bg-indigo-500 text-white" : "bg-zinc-800 text-zinc-400"}`}>{category.name}</button>)}</div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{movies.map((movie) => <article key={movie.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 gap-2">{movie.content_type === "series" ? <Tv className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" /> : <Film className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />}<div className="min-w-0"><h4 className="truncate font-bold text-white">{movie.title}</h4><p className="mt-1 text-xs text-indigo-300">{categoryName(movie.category_id)}</p></div></div><span className="shrink-0 font-mono text-xs font-bold text-emerald-400">{movie.price_ks} Ks</span></div><p className="mt-3 line-clamp-2 text-xs leading-5 text-zinc-400">{movie.description || "No review added."}</p><div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 border-t border-zinc-800 pt-3 text-[11px] text-zinc-500"><span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{Math.floor(movie.duration_seconds / 60)} min</span>{movie.content_type === "series" && <span>{movie.episode_count || 1} episodes</span>}<span className="inline-flex min-w-0 items-center gap-1"><HardDrive className="h-3 w-3" />{movie.hard_disk_label || "Storage path"}</span></div></article>)}</div>{!movies.length && <div className="py-16 text-center text-sm text-zinc-500">No titles in this category yet.</div>}</section>;
}

function AddTitleModal({ categories, form, pricing, saving, onClose, onChange, onSubmit }: { categories: Category[]; form: ReturnType<typeof emptyForm>; pricing: { movie: number; series: number }; saving: boolean; onClose: () => void; onChange: (partial: Partial<ReturnType<typeof emptyForm>>) => void; onSubmit: (event: React.FormEvent) => void }) {
  const series = form.content_type === "series";
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"><div className="mx-auto my-6 max-w-2xl rounded-3xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl"><div className="flex items-center justify-between border-b border-zinc-800 pb-4"><div><h3 className="font-bold text-white">Add title to Movie Store</h3><p className="mt-1 text-xs text-zinc-400">Fields marked with * are required.</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"><X className="h-5 w-5" /></button></div><form onSubmit={onSubmit} className="mt-5 space-y-4"><div className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-700 bg-zinc-950/40 p-1"><TypeButton active={!series} onClick={() => onChange({ content_type: "movie", price_ks: pricing.movie })} icon={<Film className="h-4 w-4" />} label="Movie" /><TypeButton active={series} onClick={() => onChange({ content_type: "series", price_ks: pricing.series })} icon={<Tv className="h-4 w-4" />} label="Series" /></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Category *"><select value={form.category_id} onChange={(event) => onChange({ category_id: event.target.value })} className="input">{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field><Field label="Release year"><input className="input" type="number" min="1900" max="2100" value={form.release_year} onChange={(event) => onChange({ release_year: Number(event.target.value) || 0 })} /></Field></div><Field label={series ? "Series title *" : "Movie title *"}><input className="input" value={form.title} onChange={(event) => onChange({ title: event.target.value })} placeholder={series ? "e.g. The Promise" : "e.g. The Last Journey"} /></Field><Field label="Review / description"><textarea className="input min-h-24 resize-y" value={form.description} onChange={(event) => onChange({ description: event.target.value })} placeholder="Short Myanmar or English review customers will see" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Price (Ks)"><input className="input" type="number" min="0" step="1" value={form.price_ks} onChange={(event) => onChange({ price_ks: Number(event.target.value) || 0 })} /></Field><Field label="Duration (minutes)"><input className="input" type="number" min="0" step="1" value={form.duration_minutes} onChange={(event) => onChange({ duration_minutes: Number(event.target.value) || 0 })} /></Field></div>{series && <div className="grid gap-4 sm:grid-cols-2"><Field label="How many episodes included? *"><input className="input" type="number" min="1" step="1" value={form.episode_count} onChange={(event) => onChange({ episode_count: Number(event.target.value) || 1 })} /></Field><Field label="Season number"><input className="input" type="number" min="1" step="1" value={form.season_number} onChange={(event) => onChange({ season_number: Number(event.target.value) || 1 })} /></Field></div>}<Field label="Physical storage path *"><input className="input font-mono" value={form.video_path} onChange={(event) => onChange({ video_path: event.target.value })} placeholder="D:\Movies\title.mp4 or a series folder" /></Field><Field label="Storage label (optional)"><input className="input" value={form.hard_disk_label} onChange={(event) => onChange({ hard_disk_label: event.target.value })} placeholder="e.g. External Drive 2" /></Field><div className="flex justify-end gap-2 border-t border-zinc-800 pt-4"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-zinc-800">Cancel</button><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-400 disabled:opacity-50"><Check className="h-4 w-4" />{saving ? "Saving…" : "Save title"}</button></div></form></div></div>;
}

function TypeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) { return <button type="button" onClick={onClick} className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold ${active ? "bg-indigo-500 text-white" : "text-zinc-400 hover:text-white"}`}>{icon}{label}</button>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-semibold text-zinc-300"><span className="mb-1.5 block">{label}</span>{children}</label>; }

function CategoryEditor({ categories, movies, onChanged }: { categories: Category[]; movies: Video[]; onChanged: () => Promise<void> }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingId || !name.trim()) return;
    setBusy(true); setStatus("");
    try { await invoke("update_category", { payload: { id: editingId, name } }); await onChanged(); setEditingId(null); setStatus("Category updated."); }
    catch (error) { setStatus(String(error)); }
    finally { setBusy(false); }
  };
  const remove = async (category: Category) => {
    if (!window.confirm(`Delete “${category.name}”? This is only possible when it has no titles.`)) return;
    setBusy(true); setStatus("");
    try { await invoke("delete_category", { categoryId: category.id }); await onChanged(); setStatus("Category deleted."); }
    catch (error) { setStatus(String(error)); }
    finally { setBusy(false); }
  };
  return <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6"><div className="flex items-center justify-between"><div><h4 className="font-bold text-white">Edit or delete categories</h4><p className="mt-1 text-xs text-zinc-400">Categories with titles are protected from deletion.</p></div><Pencil className="h-5 w-5 text-zinc-500" /></div>{status && <p className="mt-4 rounded-xl border border-zinc-700 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-300">{status}</p>}<div className="mt-4 space-y-2">{categories.map((category) => { const count = movies.filter((movie) => movie.category_id === category.id).length; const editing = editingId === category.id; return <div key={category.id} className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/35 p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1">{editing ? <form onSubmit={save} className="flex gap-2"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} className="select-control flex-1" /><button disabled={busy} className="rounded-xl bg-indigo-500 px-3 text-xs font-bold text-white">Save</button><button type="button" onClick={() => setEditingId(null)} className="rounded-xl px-2 text-xs text-zinc-400">Cancel</button></form> : <><p className="truncate text-sm font-semibold text-white">{category.name}</p><p className="text-xs text-zinc-500">{count} {count === 1 ? "title" : "titles"}</p></>}</div>{!editing && <div className="flex gap-1"><button type="button" onClick={() => { setEditingId(category.id); setName(category.name); setStatus(""); }} className="rounded-lg p-2 text-zinc-400 hover:bg-indigo-500/10 hover:text-indigo-300" aria-label={`Edit ${category.name}`}><Pencil className="h-4 w-4" /></button><button type="button" disabled={busy || count > 0} onClick={() => remove(category)} title={count > 0 ? "Move titles out of this category before deleting it" : "Delete category"} className="rounded-lg p-2 text-zinc-400 hover:bg-rose-500/10 hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-30" aria-label={`Delete ${category.name}`}><Trash2 className="h-4 w-4" /></button></div>}</div>; })}</div></section>;
}
