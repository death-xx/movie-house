use local_ip_address::list_afinet_netifas;
use serde::{Deserialize, Serialize};
use std::net::IpAddr;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterfaceInfo {
    pub name: String,
    pub ip: String,
    pub is_vpn: bool,
    pub is_wifi_or_lan: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkConfig {
    pub lan_ip: String,
    pub http_port: u16,
    pub server_url: String,
    pub all_interfaces: Vec<InterfaceInfo>,
}

/// Detects all network interfaces and intelligently selects the best physical WiFi/LAN IPv4 address
pub fn get_all_network_interfaces() -> Vec<InterfaceInfo> {
    let mut interfaces = Vec::new();

    if let Ok(netifas) = list_afinet_netifas() {
        for (name, ip) in netifas {
            if let IpAddr::V4(ipv4) = ip {
                let ip_str = ipv4.to_string();
                // Ignore loopback
                if ip_str.starts_with("127.") {
                    continue;
                }

                let lower_name = name.to_lowercase();

                // Identify VPNs or virtual tunnels
                let is_vpn = lower_name.contains("proton")
                    || lower_name.contains("tun")
                    || lower_name.contains("tap")
                    || lower_name.contains("wg")
                    || lower_name.contains("nord")
                    || lower_name.contains("tailscale")
                    || lower_name.contains("docker")
                    || lower_name.contains("vbox")
                    || lower_name.contains("virbr");

                let is_wifi_or_lan = !is_vpn
                    && (ip_str.starts_with("192.168.")
                        || ip_str.starts_with("172.16.")
                        || ip_str.starts_with("172.2")
                        || ip_str.starts_with("172.3")
                        || (ip_str.starts_with("10.") && !is_vpn));

                interfaces.push(InterfaceInfo {
                    name,
                    ip: ip_str,
                    is_vpn,
                    is_wifi_or_lan,
                });
            }
        }
    }

    interfaces
}

/// Returns the primary WiFi/LAN IP, deliberately skipping VPN tunnels
pub fn detect_best_lan_ip() -> String {
    let interfaces = get_all_network_interfaces();

    // 1. First priority: Physical WiFi / LAN interfaces (192.168.x.x or wlo/wlan/eth)
    for iface in &interfaces {
        if iface.is_wifi_or_lan && !iface.is_vpn {
            return iface.ip.clone();
        }
    }

    // 2. Second priority: Any non-VPN interface
    for iface in &interfaces {
        if !iface.is_vpn {
            return iface.ip.clone();
        }
    }

    // 3. Fallback
    interfaces
        .first()
        .map(|i| i.ip.clone())
        .unwrap_or_else(|| "192.168.1.100".to_string())
}

pub fn get_network_config(port: u16) -> NetworkConfig {
    let interfaces = get_all_network_interfaces();
    let lan_ip = detect_best_lan_ip();
    let server_url = format!("http://{}:{}", lan_ip, port);

    NetworkConfig {
        lan_ip,
        http_port: port,
        server_url,
        all_interfaces: interfaces,
    }
}
