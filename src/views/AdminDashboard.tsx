import React, { useState } from "react";
import {
  LayoutDashboard,
  Film,
  Wifi,
  ShoppingBag,
  DollarSign,
  Clock,
  RefreshCw,
  ChevronRight,
  Radio,
  Settings,
} from "lucide-react";
import { useAdminOrders } from "../hooks/useAdminOrders";
import { useLanServer } from "../hooks/useLanServer";
import { QRCodeDisplay } from "../components/admin/QRCodeDisplay";
import { LiveOrders } from "../components/admin/LiveOrders";
import { StoreSettings } from "../components/admin/StoreSettings";
import { CatalogManager } from "../components/admin/CatalogManager";

type NavTab = "dashboard" | "station" | "movie-store" | "settings";

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>("dashboard");
  const { orders, stats, refreshData, updateStatus } = useAdminOrders();
  const { config } = useLanServer();

  const navItems = [
    {
      id: "dashboard" as NavTab,
      label: "Dashboard",
      icon: LayoutDashboard,
      badge: stats.pending_orders > 0 ? stats.pending_orders : undefined,
      description: "Live orders & 1-click copy",
    },
    {
      id: "station" as NavTab,
      label: "WiFi Hotspot Station",
      icon: Wifi,
      description: "QR Code & customer access",
    },
    {
      id: "movie-store" as NavTab,
      label: "Movie Store",
      icon: Film,
      description: "Manage & browse the movie catalog",
    },
    {
      id: "settings" as NavTab,
      label: "Settings & Pricing",
      icon: Settings,
      description: "Pricing rates & storage locations",
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex font-sans selection:bg-indigo-500 selection:text-white">
      {/* 1. Left Sidebar Navigation */}
      <aside className="w-72 bg-zinc-900/80 backdrop-blur-xl border-r border-zinc-800/80 flex flex-col justify-between p-5 shrink-0 z-20">
        <div className="space-y-6">
          {/* Store Branding Header */}
          <div className="flex items-center gap-3.5 pb-4 border-b border-zinc-800/80">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-950 shrink-0">
              <Film className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-black text-sm tracking-wider uppercase text-white leading-tight">
                Movie House
              </h1>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] font-semibold text-emerald-400">Offline WiFi Hub</span>
              </div>
            </div>
          </div>

          {/* Navigation Items List */}
          <nav className="space-y-1.5">
            <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
              Main Menu
            </p>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all duration-200 group text-left ${
                    isActive
                      ? "bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-lg shadow-indigo-950/60 font-semibold"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-xl transition ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-zinc-800 text-zinc-400 group-hover:text-white group-hover:bg-zinc-700"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold leading-none">{item.label}</p>
                      <p
                        className={`text-[10px] mt-1 line-clamp-1 ${
                          isActive ? "text-indigo-200" : "text-zinc-500"
                        }`}
                      >
                        {item.description}
                      </p>
                    </div>
                  </div>

                  {item.badge !== undefined ? (
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                        isActive
                          ? "bg-white text-indigo-700 shadow"
                          : "bg-amber-500 text-black animate-pulse"
                      }`}
                    >
                      {item.badge}
                    </span>
                  ) : (
                    <ChevronRight
                      className={`w-4 h-4 transition-transform ${
                        isActive
                          ? "text-white translate-x-0.5"
                          : "text-zinc-600 opacity-0 group-hover:opacity-100"
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer: System Status */}
        <div className="pt-4 border-t border-zinc-800/80 space-y-3">
          <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-2xl space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-emerald-400" />
                LAN Endpoint:
              </span>
              <span className="text-[10px] text-emerald-400 font-mono font-bold">PORT 8080</span>
            </div>
            <p className="text-xs font-mono font-bold text-indigo-300 truncate">
              {config?.lan_ip || "127.0.0.1"}
            </p>
          </div>

          <button
            onClick={refreshData}
            className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh State</span>
          </button>
        </div>
      </aside>

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header Bar */}
        <header className="border-b border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md sticky top-0 z-10 px-8 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-white tracking-wide capitalize">
              {navItems.find((n) => n.id === activeTab)?.label}
            </h2>
            <p className="text-xs text-zinc-400">
              {navItems.find((n) => n.id === activeTab)?.description}
            </p>
          </div>

          {/* Quick Metrics Bar in Header */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-4 bg-zinc-900/80 border border-zinc-800 px-4 py-2 rounded-2xl text-xs">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-zinc-400">Pending:</span>
                <span className="font-bold text-amber-400 font-mono">{stats.pending_orders}</span>
              </div>
              <div className="w-px h-4 bg-zinc-800" />
              <div className="flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-zinc-400">Sales:</span>
                <span className="font-bold text-emerald-400 font-mono">
                  {stats.total_revenue_cents} Ks
                </span>
              </div>
            </div>

            <div className="px-3.5 py-1.5 bg-emerald-950/60 border border-emerald-700/40 text-emerald-400 rounded-xl text-xs font-mono font-bold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>LIVE HUB</span>
            </div>
          </div>
        </header>

        {/* Dynamic View Canvas */}
        <main className="p-8 max-w-7xl w-full mx-auto space-y-6">
          {/* TAB 1: DASHBOARD */}
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              {/* KPI Cards Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 bg-zinc-900/80 border border-zinc-800/80 rounded-3xl flex items-center gap-4 shadow-xl">
                  <div className="p-3.5 bg-amber-500/10 text-amber-400 rounded-2xl">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-zinc-400 font-medium">Pending Orders</p>
                    <h3 className="text-2xl font-black text-amber-400 mt-0.5">
                      {stats.pending_orders}
                    </h3>
                  </div>
                </div>

                <div className="p-5 bg-zinc-900/80 border border-zinc-800/80 rounded-3xl flex items-center gap-4 shadow-xl">
                  <div className="p-3.5 bg-emerald-500/10 text-emerald-400 rounded-2xl">
                    <DollarSign className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-zinc-400 font-medium">Total Sales Revenue</p>
                    <h3 className="text-2xl font-black text-emerald-400 font-mono mt-0.5">
                      {stats.total_revenue_cents} Ks
                    </h3>
                  </div>
                </div>

                <div className="p-5 bg-zinc-900/80 border border-zinc-800/80 rounded-3xl flex items-center gap-4 shadow-xl">
                  <div className="p-3.5 bg-indigo-500/10 text-indigo-400 rounded-2xl">
                    <ShoppingBag className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-zinc-400 font-medium">Total Orders Handled</p>
                    <h3 className="text-2xl font-black text-white mt-0.5">{orders.length}</h3>
                  </div>
                </div>
              </div>

              {/* Live Orders Feed & Quick QR Hub */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2">
                  <LiveOrders orders={orders} onUpdateStatus={updateStatus} />
                </div>
                <div>
                  <QRCodeDisplay config={config} />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: WIFI STATION */}
          {activeTab === "station" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-1">
                <QRCodeDisplay config={config} />
              </div>
              <div className="lg:col-span-2 bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 shadow-xl space-y-4">
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Wifi className="w-5 h-5 text-indigo-400" />
                  Offline WiFi Store Instructions
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-zinc-400">
                  <div className="p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-2xl space-y-2">
                    <span className="font-bold text-indigo-400 text-sm">Step 1: Network Setup</span>
                    <p className="leading-relaxed">
                      Connect this PC and customer phones to your local WiFi router, or enable the Windows Mobile Hotspot.
                    </p>
                  </div>
                  <div className="p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-2xl space-y-2">
                    <span className="font-bold text-indigo-400 text-sm">Step 2: Customer Access</span>
                    <p className="leading-relaxed">
                      Customers scan the QR code to open the store on their phone (200 Ks / movie, 150 Ks / series ep).
                    </p>
                  </div>
                  <div className="p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-2xl space-y-2">
                    <span className="font-bold text-indigo-400 text-sm">Step 3: 1-Click Copy</span>
                    <p className="leading-relaxed">
                      When customer checks out, plug their phone into PC, select the phone drive, and click "1-Click Copy All to Phone"!
                    </p>
                  </div>
                  <div className="p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-2xl space-y-2">
                    <span className="font-bold text-indigo-400 text-sm">Step 4: Storage folders</span>
                    <p className="leading-relaxed">
                      The copy engine reads files directly from all of your configured storage folders.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "movie-store" && <CatalogManager />}

          {/* TAB 4: SETTINGS & PRICING */}
          {activeTab === "settings" && <StoreSettings />}
        </main>
      </div>
    </div>
  );
};
