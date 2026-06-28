import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    _client = createClient(url, key);
  }
  return _client;
}

export interface TradeRow {
  id: string;
  filed_date: string;
  trade_date: string;
  company: string;
  ticker: string | null;
  insider_name: string;
  role: string | null;
  type: "buy" | "sell" | "other";
  shares: number;
  price_per_share: number | null;
  total_value: number | null;
  adsh: string;
}
