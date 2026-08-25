import React, { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Wifi, Copy, Check, Radio, ShieldAlert } from "lucide-react";
import { NetworkConfig } from "../../types";

interface QRCodeDisplayProps {
  config: NetworkConfig | null;
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({ config }) => {
  const [copied, setCopied] = useState(false);
  const [selectedIp, setSelectedIp] = useState<string>("");

  useEffect(() => {
    if (config?.lan_ip) {
      setSelectedIp(config.lan_ip);
    }
  }, [config]);

  const activeUrl = selectedIp
    ? `http://${selectedIp}:${config?.http_port || 8080}`
    : config?.server_url || "";

  const copyUrl = () => {
    if (activeUrl) {
      navigator.clipboard.writeText(activeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!config) {
    return (
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 flex flex-col items-center justify-center animate-pulse min-h-[360px]">
        <Radio className="w-10 h-10 text-zinc-600 animate-spin mb-4" />
        <p className="text-zinc-400 font-medium">Detecting Local WiFi Network...</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800/80 rounded-2xl p-6 shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
      {/* Top Accent Light */}
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

      <div className="flex items-center gap-2 mb-3">
        <span className="flex h-3 w-3 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
        </span>
        <h3 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
          <Wifi className="w-4 h-4 text-emerald-400" />
          WiFi Hotspot Station
        </h3>
      </div>

      {/* Network Interface Switcher if multiple detected */}
      {config.all_interfaces && config.all_interfaces.length > 1 && (
        <div className="w-full mb-4 bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-800 text-left">
          <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
            Active Network Adapter:
          </label>
          <select
            value={selectedIp}
            onChange={(e) => setSelectedIp(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            {config.all_interfaces.map((iface) => (
              <option key={iface.ip} value={iface.ip}>
                {iface.name} ({iface.ip}) {iface.is_vpn ? "⚠️ [VPN/Tunnel]" : "✅ [WiFi/LAN]"}
              </option>
            ))}
          </select>
          {selectedIp.startsWith("10.2.0.") && (
            <p className="text-[10px] text-amber-400 mt-1.5 flex items-center gap-1">
              <ShieldAlert className="w-3 h-3 shrink-0" />
              10.2.0.x is a VPN tunnel. Switch to your physical WiFi IP (e.g. 192.168.x.x) so phones can connect!
            </p>
          )}
        </div>
      )}

      {/* QR Code Frame */}
      <div className="bg-white p-4 rounded-2xl shadow-xl mb-4 transition-transform hover:scale-105 duration-300">
        <QRCodeSVG
          value={activeUrl}
          size={180}
          level="H"
          includeMargin={false}
          imageSettings={{
            src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%236366f1'%3E%3Cpath d='M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z'/%3E%3C/svg%3E",
            x: undefined,
            y: undefined,
            height: 28,
            width: 28,
            excavate: true,
          }}
        />
      </div>

      <div className="w-full max-w-xs space-y-2.5">
        <div className="text-xs text-zinc-400 font-medium flex items-center justify-between">
          <span>Customer Mobile URL:</span>
          <span className="text-[11px] text-emerald-400 font-mono">Port {config.http_port}</span>
        </div>

        <button
          onClick={copyUrl}
          className="w-full flex items-center justify-between px-3.5 py-2 bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/60 rounded-xl text-xs font-mono text-indigo-300 transition group"
        >
          <span className="truncate">{activeUrl}</span>
          {copied ? (
            <Check className="w-4 h-4 text-emerald-400 shrink-0 ml-2" />
          ) : (
            <Copy className="w-4 h-4 text-zinc-400 group-hover:text-white shrink-0 ml-2" />
          )}
        </button>

      </div>

      <p className="text-[11px] text-zinc-500 mt-3 max-w-xs leading-relaxed">
        Connect phone to same Wi-Fi, scan the QR code to open the mobile order page.
      </p>
    </div>
  );
};
