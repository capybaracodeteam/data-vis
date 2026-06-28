import { getSupabase, type TradeRow } from "@/app/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Trade {
  id: string;
  filedDate: string;
  tradeDate: string;
  company: string;
  ticker: string;
  insiderName: string;
  role: string;
  type: "buy" | "sell" | "other";
  shares: number;
  pricePerShare: number;
  totalValue: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function rowToTrade(r: TradeRow): Trade {
  return {
    id: r.id,
    filedDate: r.filed_date,
    tradeDate: r.trade_date,
    company: r.company,
    ticker: r.ticker ?? "",
    insiderName: r.insider_name,
    role: r.role ?? "Insider",
    type: r.type,
    shares: r.shares,
    pricePerShare: r.price_per_share ?? 0,
    totalValue: r.total_value ?? 0,
  };
}

// ── Data ──────────────────────────────────────────────────────────────────────

async function fetchTrades(): Promise<Trade[]> {
  const { data, error } = await getSupabase()
    .from("trades")
    .select("*")
    .order("trade_date", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return ((data ?? []) as TradeRow[]).map(rowToTrade);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export const revalidate = 3600;

export default async function Home() {
  let trades: Trade[] = [];
  let error: string | null = null;

  try {
    trades = await fetchTrades();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">SEC Insider Trades</h1>
          <p className="text-sm text-gray-500 mt-1">
            Recent Form 4 filings · refreshes daily
          </p>
        </div>

        {error && (
          <p className="font-mono text-sm text-red-600 bg-red-50 border border-red-200 rounded p-4 mb-6">
            Error: {error}
          </p>
        )}

        {trades.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Insider</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Shares</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {trades.map((trade) => (
                  <tr key={trade.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-500 whitespace-nowrap">
                      {trade.tradeDate}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {trade.company}
                      {trade.ticker && (
                        <span className="ml-2 font-mono text-xs text-gray-400">
                          {trade.ticker}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{trade.insiderName}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {trade.role}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                          trade.type === "buy"
                            ? "bg-green-100 text-green-700"
                            : trade.type === "sell"
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {trade.type === "buy" ? "Buy" : trade.type === "sell" ? "Sell" : "Other"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {trade.shares.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {trade.pricePerShare > 0 ? `$${trade.pricePerShare.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium">
                      {trade.totalValue > 0 ? formatMoney(trade.totalValue) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !error ? (
          <p className="text-gray-500">No trades yet — check back after the next sync.</p>
        ) : null}
      </div>
    </main>
  );
}
