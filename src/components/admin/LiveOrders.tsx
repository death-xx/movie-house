import React, { useState, useEffect } from "react";
import {
  ShoppingBag,
  CheckCircle,
  Clock,
  Smartphone,
  Copy,
  FolderDown,
  HardDrive,
  CheckCircle2,
  Film,
  Tv,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Order, OrderWithItems, DriveInfo, CopyProgressEvent } from "../../types";

interface LiveOrdersProps {
  orders: Order[];
  onUpdateStatus: (orderId: string, status: "completed" | "cancelled") => void;
}

export const LiveOrders: React.FC<LiveOrdersProps> = ({ orders, onUpdateStatus }) => {
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  const [availableDrives, setAvailableDrives] = useState<DriveInfo[]>([]);
  const [selectedDestFolder, setSelectedDestFolder] = useState<string>("");
  const [copyingOrder, setCopyingOrder] = useState<boolean>(false);
  const [copyProgress, setCopyProgress] = useState<CopyProgressEvent | null>(null);

  // Load available plugged-in USB / Phone drives
  useEffect(() => {
    invoke<DriveInfo[]>("get_available_drives")
      .then((drives) => {
        setAvailableDrives(drives);
        if (drives.length > 0) {
          setSelectedDestFolder(drives[0].path);
        }
      })
      .catch(console.error);

    // Listen to real-time copy progress events from Rust
    let unlistenCopy: (() => void) | undefined;
    if ((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
      void listen<CopyProgressEvent>("copy:progress", (event) => {
        setCopyProgress(event.payload);
        if (event.payload.status === "finished") {
          setCopyingOrder(false);
        }
      })
        .then((unlisten) => {
          unlistenCopy = unlisten;
        })
        .catch(() => {
          // Browser preview has no native event bridge.
        });
    }

    return () => {
      if (unlistenCopy) unlistenCopy();
    };
  }, []);

  const openOrderFulfillment = async (orderId: string) => {
    try {
      const details = await invoke<OrderWithItems>("get_order_details", { orderId });
      setSelectedOrder(details);
      setCopyProgress(null);
    } catch (err) {
      console.error("Failed to load order details:", err);
    }
  };

  const handleStartCopy = async () => {
    if (!selectedOrder || !selectedDestFolder) return;
    setCopyingOrder(true);
    try {
      await invoke("copy_order_to_device", {
        orderId: selectedOrder.order.id,
        destinationFolder: selectedDestFolder,
      });
      // Refresh order list status
      onUpdateStatus(selectedOrder.order.id, "completed");
    } catch (err) {
      console.error("Copy failed:", err);
      setCopyingOrder(false);
    }
  };

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 shadow-xl flex flex-col h-full">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-2xl">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-base">Live Orders Feed</h3>
            <p className="text-xs text-zinc-400">Incoming WiFi customer orders & 1-Click Copy Hub</p>
          </div>
        </div>
        <span className="px-3 py-1 text-xs font-semibold bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-full">
          {orders.length} Total
        </span>
      </div>

      {/* Orders List */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[520px]">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 text-zinc-500 text-center">
            <Clock className="w-10 h-10 mb-3 text-zinc-700 stroke-[1.5]" />
            <p className="text-sm font-medium">No customer orders yet</p>
            <p className="text-xs text-zinc-600 mt-1">Orders placed from mobile devices appear here instantly</p>
          </div>
        ) : (
          orders.map((order) => {
            const isPending = order.status === "pending";
            const isCompleted = order.status === "completed";
            const isCopying = order.status === "copying";

            return (
              <div
                key={order.id}
                onClick={() => openOrderFulfillment(order.id)}
                className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer ${
                  isPending
                    ? "bg-zinc-800/90 border-indigo-500/50 shadow-lg shadow-indigo-950/20 hover:border-indigo-400"
                    : isCopying
                    ? "bg-amber-950/40 border-amber-500/50"
                    : isCompleted
                    ? "bg-zinc-900/50 border-emerald-500/20 opacity-80"
                    : "bg-zinc-900/30 border-zinc-800 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{order.customer_name}</span>
                      <span
                        className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                          isPending
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse"
                            : isCopying
                            ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 animate-pulse"
                            : isCompleted
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                            : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-zinc-400">
                      {order.customer_phone && (
                        <span className="flex items-center gap-1">
                          <Smartphone className="w-3.5 h-3.5 text-zinc-500" />
                          {order.customer_phone}
                        </span>
                      )}
                      <span>{new Date(order.created_at).toLocaleTimeString()}</span>
                      <span className="text-zinc-500 text-[11px]">ID: {order.id.slice(0, 8)}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-emerald-400 font-bold font-mono text-base flex items-center justify-end">
                      {order.total_ks} Ks
                    </div>
                    <span className="text-[10px] text-zinc-400">Click to 1-Click Copy</span>
                  </div>
                </div>

                {isPending && (
                  <div className="mt-3 pt-3 border-t border-zinc-700/50 flex items-center justify-between">
                    <span className="text-xs text-indigo-300 font-medium flex items-center gap-1.5">
                      <FolderDown className="w-4 h-4 text-indigo-400" />
                      Plug Phone & Copy Files
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openOrderFulfillment(order.id);
                      }}
                      className="px-3.5 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition shadow flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Open Copy Center
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 🚀 Order Fulfillment & 1-Click File Copy Drawer / Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-xl w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-600/20 text-indigo-400 rounded-2xl">
                  <FolderDown className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base">
                    1-Click Phone / USB Copy Center
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Order for <span className="text-white font-semibold">{selectedOrder.order.customer_name}</span> • Total Due:{" "}
                    <span className="text-emerald-400 font-mono font-bold">{selectedOrder.order.total_ks} Ks</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedOrder(null)}
                className="p-2 bg-zinc-800 text-zinc-400 hover:text-white rounded-full transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List of Files across the 5 Hard Disks */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs text-zinc-400 font-semibold">
                <span>Selected Movies & Episodes ({selectedOrder.items.length})</span>
                <span>Storage Location on PC</span>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {selectedOrder.items.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-zinc-800/80 border border-zinc-700/60 rounded-2xl flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      {item.content_type === "series" ? (
                        <Tv className="w-4 h-4 text-purple-400 shrink-0" />
                      ) : (
                        <Film className="w-4 h-4 text-indigo-400 shrink-0" />
                      )}
                      <div>
                        <p className="font-bold text-white line-clamp-1">{item.video_title}</p>
                        <p className="text-[10px] text-zinc-400 font-mono">
                          {item.price_ks} Ks • {(item.file_size_bytes / (1024 * 1024)).toFixed(0)} MB
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="inline-block px-2 py-0.5 bg-zinc-900 text-zinc-300 font-mono text-[10px] rounded border border-zinc-700 truncate max-w-[150px]">
                        {item.video_path.split(/[\\/]/).pop()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Destination Drive Selection (Customer's Phone / USB) */}
            <div className="space-y-2 bg-zinc-950/60 p-4 rounded-2xl border border-zinc-800">
              <label className="block text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-indigo-400" />
                Plugged-in Customer Phone / USB Destination Folder:
              </label>

              {availableDrives.length > 0 ? (
                <select
                  value={selectedDestFolder}
                  onChange={(e) => setSelectedDestFolder(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                >
                  {availableDrives.map((d) => (
                    <option key={d.path} value={d.path}>
                      {d.label} ({d.path})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="e.g. E:\Movies or D:\ or /media/destiny/USB"
                  value={selectedDestFolder}
                  onChange={(e) => setSelectedDestFolder(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              )}
            </div>

            {/* Copy Progress Bar Indicator */}
            {copyProgress && (
              <div className="space-y-2 p-4 bg-indigo-950/40 border border-indigo-500/40 rounded-2xl">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-white flex items-center gap-2">
                    {copyProgress.status === "finished" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping" />
                    )}
                    {copyProgress.status === "finished"
                      ? "100% Completed!"
                      : `Copying file ${copyProgress.current_file_index} of ${copyProgress.total_files}`}
                  </span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {copyProgress.speed_mb_per_sec > 0
                      ? `${copyProgress.speed_mb_per_sec.toFixed(1)} MB/s`
                      : ""}
                  </span>
                </div>

                {/* Progress bar track */}
                <div className="w-full bg-zinc-800 h-3 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 h-full transition-all duration-150 rounded-full"
                    style={{ width: `${copyProgress.overall_progress_percent}%` }}
                  />
                </div>

                <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
                  <span className="truncate max-w-xs">{copyProgress.current_file_name}</span>
                  <span>{copyProgress.overall_progress_percent.toFixed(0)}%</span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => onUpdateStatus(selectedOrder.order.id, "cancelled")}
                className="px-4 py-2.5 text-xs text-rose-400 hover:bg-rose-500/10 rounded-xl transition"
              >
                Cancel Order
              </button>

              <div className="flex gap-2">
                {copyProgress?.status === "finished" ? (
                  <button
                    onClick={() => setSelectedOrder(null)}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-emerald-950"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Done & Return to Feed
                  </button>
                ) : (
                  <button
                    onClick={handleStartCopy}
                    disabled={copyingOrder || !selectedDestFolder}
                    className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white text-xs font-bold rounded-2xl shadow-xl shadow-indigo-950 transition flex items-center gap-2"
                  >
                    <FolderDown className="w-4 h-4 animate-bounce" />
                    {copyingOrder ? "Copying to Phone..." : "🚀 1-Click Copy All to Phone"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
