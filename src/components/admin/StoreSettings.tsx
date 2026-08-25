import React, { useEffect, useMemo, useState } from "react";
import { CircleAlert, FolderOpen, HardDrive, Plus, Save, Tag, Trash2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { StorePricingSettings } from "../../types";

const DEFAULT_SETTINGS: StorePricingSettings = { movie_price_ks: 200, series_episode_price_ks: 150, currency_symbol: "Ks", default_phone_copy_path: "", hard_disk_paths: [] };
const SETTINGS_CACHE_KEY = "movie-house.store-settings.v1";
const isNativeDesktop = () => Boolean((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

function cachedSettings(): StorePricingSettings {
  try {
    const cached = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (!cached) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(cached) as Partial<StorePricingSettings>;
    const paths = Array.isArray(parsed.hard_disk_paths)
      ? parsed.hard_disk_paths.filter((path) => path.trim())
      : [];
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      hard_disk_paths: paths,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const StoreSettings: React.FC = () => {
  const [settings, setSettings] = useState<StorePricingSettings>(cachedSettings);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [newDiskPath, setNewDiskPath] = useState("");
  const nativeDesktop = useMemo(isNativeDesktop, []);

  useEffect(() => {
    void invoke<StorePricingSettings>("get_store_settings")
      .then((result) => {
        const saved = { ...result, hard_disk_paths: result.hard_disk_paths };
        setSettings(saved);
        localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(saved));
      })
      .catch(() => setError("Could not load saved settings. Showing the default configuration."));
  }, []);

  const update = (partial: Partial<StorePricingSettings>) => {
    setSettings((current) => ({ ...current, ...partial }));
    setNotice("");
    setError("");
  };

  const addDisk = (value = newDiskPath) => {
    const path = value.trim();
    if (!path) return;
    if (settings.hard_disk_paths.includes(path)) return setError("That storage location is already configured.");
    update({ hard_disk_paths: [...settings.hard_disk_paths, path] });
    setNewDiskPath("");
  };

  const pickFolder = async () => {
    if (!nativeDesktop) return setError("Folder browsing is available in the installed desktop app. Paste a path in preview mode.");
    try {
      const selected = await open({ directory: true, multiple: false, title: "Choose a movie storage folder" });
      if (typeof selected === "string") addDisk(selected);
    } catch {
      setError("The folder picker could not open. Restart the installed desktop app and try again.");
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      await invoke("save_store_settings", { settings });
      localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings));
      setNotice("Settings saved successfully and will be restored on restart.");
    }
    catch { setError("Could not save your settings. Please try again."); }
    finally { setSaving(false); }
  };

  return <form onSubmit={save} className="mx-auto w-full max-w-5xl space-y-5">
    <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/70 shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-5 border-b border-zinc-800 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-500 text-white shadow-lg shadow-indigo-950/60"><Tag className="h-5 w-5" /></div><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">Store controls</p><h2 className="mt-1 text-xl font-bold text-white">Pricing & storage</h2><p className="mt-1 text-sm text-zinc-400">Set transparent prices and where your media lives.</p></div></div>
        <div className="rounded-xl border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-right"><p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Storage locations</p><p className="text-sm font-bold text-white">{settings.hard_disk_paths.length} <span className="font-normal text-zinc-500">configured</span></p></div>
      </div>
      <div className="grid gap-4 p-6 md:grid-cols-3">
        <PriceInput label="Movie price" hint="Per full movie" value={settings.movie_price_ks} currency={settings.currency_symbol} onChange={(movie_price_ks) => update({ movie_price_ks })} />
        <PriceInput label="Series episode" hint="Per episode" value={settings.series_episode_price_ks} currency={settings.currency_symbol} onChange={(series_episode_price_ks) => update({ series_episode_price_ks })} />
        <label className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4"><span className="text-sm font-semibold text-zinc-200">Currency label</span><span className="mt-1 block text-xs text-zinc-500">Shown across the storefront</span><input value={settings.currency_symbol} maxLength={6} onChange={(event) => update({ currency_symbol: event.target.value })} className="mt-4 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 font-mono text-sm font-semibold text-white outline-none transition focus:border-indigo-400" /></label>
      </div>
    </section>
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6 shadow-xl shadow-black/10">
      <div className="flex flex-col gap-4 border-b border-zinc-800 pb-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400"><HardDrive className="h-5 w-5" /></div><div><h3 className="font-bold text-white">Media storage locations</h3><p className="mt-0.5 text-xs text-zinc-400">Add as many internal or external storage folders as you need.</p></div></div><button type="button" onClick={pickFolder} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-zinc-950 transition hover:bg-zinc-200"><FolderOpen className="h-4 w-4" />Browse folder</button></div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">{settings.hard_disk_paths.length ? settings.hard_disk_paths.map((path, index) => <div key={path} className="group flex min-w-0 items-center gap-3 rounded-2xl border border-zinc-700/70 bg-zinc-950/45 px-3 py-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500/10 font-mono text-xs font-bold text-emerald-400">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-200" title={path}>{path}</span><button type="button" onClick={() => update({ hard_disk_paths: settings.hard_disk_paths.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Remove ${path}`} className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-rose-500/10 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button></div>) : <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/20 px-4 py-6 text-center text-xs text-zinc-500 sm:col-span-2">No storage folders yet. Browse or paste a path to add one.</div>}</div>
      <div className="mt-4 flex gap-2"><input value={newDiskPath} onChange={(event) => setNewDiskPath(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addDisk(); } }} placeholder="Or paste a folder path, e.g. D:\Movies" className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 font-mono text-xs text-white outline-none transition placeholder:text-zinc-600 focus:border-indigo-400" /><button type="button" onClick={() => addDisk()} className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"><Plus className="h-4 w-4" />Add</button></div>
      {!nativeDesktop && <p className="mt-3 text-xs text-amber-300">Folder browsing requires the installed Movie House desktop app. Manual paths work in browser preview.</p>}
    </section>
    {(notice || error) && <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${error ? "border-rose-500/30 bg-rose-500/10 text-rose-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"}`}><CircleAlert className="h-4 w-4 shrink-0" />{error || notice}</div>}
    <div className="flex justify-end"><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-950/50 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"><Save className="h-4 w-4" />{saving ? "Saving…" : "Save changes"}</button></div>
  </form>;
};

function PriceInput({ label, hint, value, currency, onChange }: { label: string; hint: string; value: number; currency: string; onChange: (value: number) => void }) {
  return <label className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4"><span className="text-sm font-semibold text-zinc-200">{label}</span><span className="mt-1 block text-xs text-zinc-500">{hint}</span><div className="relative mt-4"><input type="number" min="0" step="1" value={value} onChange={(event) => onChange(Number(event.target.value) || 0)} className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 pr-12 font-mono text-sm font-semibold text-white outline-none transition focus:border-indigo-400" /><span className="absolute right-3 top-2.5 font-mono text-xs font-bold text-emerald-400">{currency}</span></div></label>;
}
