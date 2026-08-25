import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Order, AdminStats } from "../types";

// Reuse a single AudioContext instead of creating one per notification (was a leak).
let sharedAudioCtx: AudioContext | null = null;

function playChime() {
  try {
    if (!sharedAudioCtx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return;
      sharedAudioCtx = new Ctor();
    }
    const ctx = sharedAudioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880.0, ctx.currentTime + 0.1); // A5
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (_) {}
}

export function useAdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<AdminStats>({
    total_movies: 0,
    pending_orders: 0,
    completed_orders: 0,
    total_revenue_cents: 0,
  });
  const refreshTimer = useRef<number | null>(null);

  const refreshData = useCallback(async () => {
    try {
      const [fetchedOrders, fetchedStats] = await Promise.all([
        invoke<Order[]>("get_all_orders"),
        invoke<AdminStats>("get_admin_stats"),
      ]);
      setOrders(fetchedOrders);
      setStats(fetchedStats);
    } catch (err) {
      console.warn("Failed to fetch admin data via Tauri IPC:", err);
    }
  }, []);

  // Debounce refresh so bursts of notifications don't hammer the IPC bridge.
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      refreshData();
    }, 400);
  }, [refreshData]);

  const updateStatus = async (orderId: string, status: "completed" | "cancelled") => {
    try {
      await invoke("update_order_status", { orderId, status });
      await refreshData();
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  useEffect(() => {
    refreshData();

    // Listen for real-time order creation pushed from Axum server
    let unlistenFn: (() => void) | undefined;
    if ((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
      void listen("order:created", () => {
        playChime();
        scheduleRefresh();
      })
        .then((unlisten) => {
          unlistenFn = unlisten;
        })
        .catch(() => {
          // The dashboard also supports browser preview, where native events
          // are unavailable. The explicit Refresh control remains usable.
        });
    }

    return () => {
      if (unlistenFn) unlistenFn();
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    };
  }, [scheduleRefresh, refreshData]);

  return { orders, stats, refreshData, updateStatus };
}
