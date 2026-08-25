import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { NetworkConfig } from "../types";

export function useLanServer() {
  const [config, setConfig] = useState<NetworkConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchConfig() {
      try {
        const net = await invoke<NetworkConfig>("get_lan_status");
        setConfig(net);
      } catch (_err) {
        // Fallback for browser testing
        const host = window.location.hostname || "127.0.0.1";
        const port = parseInt(window.location.port || "8080", 10);
        setConfig({
          lan_ip: host,
          http_port: port,
          server_url: `http://${host}:${port}`,
          all_interfaces: [
            {
              name: "Default",
              ip: host,
              is_vpn: false,
              is_wifi_or_lan: true,
            },
          ],
        });
      } finally {
        setLoading(false);
      }
    }

    fetchConfig();
  }, []);

  return { config, loading };
}
