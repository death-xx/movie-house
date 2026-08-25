export interface InterfaceInfo {
  name: string;
  ip: string;
  is_vpn: boolean;
  is_wifi_or_lan: boolean;
}

export interface NetworkConfig {
  lan_ip: string;
  http_port: number;
  server_url: string;
  all_interfaces: InterfaceInfo[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Video {
  id: string;
  category_id: string;
  content_type: 'movie' | 'series';
  title: string;
  description?: string;
  duration_seconds: number;
  release_year?: number;
  price_ks: number;
  episode_number?: number;
  episode_count?: number;
  season_number?: number;
  series_title?: string;
  video_path: string;
  hard_disk_label?: string;
  trailer_path?: string;
  thumbnail_path?: string;
  file_size_bytes: number;
  mime_type: string;
  is_available: boolean;
  created_at: string;
}

export interface VideoWithCategory {
  id: string;
  category_id: string;
  category_name: string;
  content_type: 'movie' | 'series';
  title: string;
  description?: string;
  duration_seconds: number;
  release_year?: number;
  price_ks: number;
  episode_number?: number;
  episode_count?: number;
  season_number?: number;
  series_title?: string;
  trailer_url?: string;
  thumbnail_url?: string;
  file_size_bytes: number;
  hard_disk_label?: string;
  is_available: boolean;
}

export interface Order {
  id: string;
  customer_name: string;
  customer_phone?: string;
  device_ip: string;
  status: 'pending' | 'copying' | 'completed' | 'cancelled';
  total_ks: number;
  total_size_bytes: number;
  payment_method: string;
  notes?: string;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  video_id: string;
  video_title: string;
  video_path: string;
  price_ks: number;
  file_size_bytes: number;
  content_type: string;
  episode_info?: string;
}

export interface OrderWithItems {
  order: Order;
  items: OrderItem[];
}

export interface CartItem {
  video: VideoWithCategory;
  delivery_type: 'local_download' | 'usb_copy' | 'stream_pass';
  price_ks: number;
}

export interface AdminStats {
  total_movies: number;
  pending_orders: number;
  completed_orders: number;
  total_revenue_cents: number;
}

export interface StorePricingSettings {
  movie_price_ks: number;
  series_episode_price_ks: number;
  currency_symbol: string;
  default_phone_copy_path: string;
  hard_disk_paths: string[];
}

export interface DriveInfo {
  path: string;
  label: string;
  available_space_bytes: number;
}

export interface CopyProgressEvent {
  order_id: string;
  current_file_index: number;
  total_files: number;
  current_file_name: string;
  file_progress_percent: number;
  overall_progress_percent: number;
  bytes_copied: number;
  total_bytes: number;
  speed_mb_per_sec: number;
  status: 'copying' | 'finished' | 'error';
  error_message?: string;
}

export interface CheckoutPayload {
  customer_name: string;
  customer_phone?: string;
  items: {
    video_id: string;
    delivery_type: string;
  }[];
}

export interface IncomeAnalyticsPoint {
  label: string;
  date: string;
  revenue_ks: number;
  orders_count: number;
}

export interface IncomeAnalyticsResponse {
  timeframe: string;
  total_revenue_ks: number;
  total_orders: number;
  average_order_ks: number;
  growth_percent: number;
  points: IncomeAnalyticsPoint[];
}

export interface DiscoveredVideoItem {
  file_name: string;
  file_path: string;
  file_size_bytes: number;
  parsed_title: string;
  content_type: string;
  season_number?: number;
  episode_number?: number;
  series_title?: string;
  hard_disk_label: string;
}

export interface ScanResult {
  scanned_files: number;
  added_count: number;
  skipped_count: number;
  items: DiscoveredVideoItem[];
}

export interface AppNotification {
  id: string;
  title: string;
  customer_info: string;
  task_type: string;
  is_read: boolean;
  created_at: string;
}
