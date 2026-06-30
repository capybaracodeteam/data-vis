import { getSupabase } from "@/app/lib/supabase";
import InsiderTradesChart, { type ChartEntry } from "@/app/components/InsiderTradesChart";

function formatDateRange(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

async function fetchChartData(): Promise<{
  buys: ChartEntry[];
  sells: ChartEntry[];
  dateRange: string;
}> {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 7);

  const cutoff = start.toISOString().slice(0, 10);

  const { data, error } = await getSupabase()
    .from("trades")
    .select("ticker, type, total_value")
    .gte("trade_date", cutoff)
    .not("total_value", "is", null)
    .not("ticker", "is", null);

  if (error) throw new Error(error.message);

  const netByTicker = new Map<string, number>();
  for (const row of data ?? []) {
    if (!row.ticker || row.total_value === null) continue;
    if (row.type !== "buy" && row.type !== "sell") continue;
    const cur = netByTicker.get(row.ticker) ?? 0;
    netByTicker.set(
      row.ticker,
      cur + (row.type === "buy" ? row.total_value : -row.total_value)
    );
  }

  const entries = Array.from(netByTicker.entries()).map(([ticker, value]) => ({
    ticker,
    value,
  }));

  const buys = entries
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const sells = entries
    .filter((e) => e.value < 0)
    .sort((a, b) => a.value - b.value) // most negative (largest magnitude) first
    .slice(0, 5)
    .map((e) => ({ ticker: e.ticker, value: Math.abs(e.value) }));

  return { buys, sells, dateRange: formatDateRange(start, end) };
}

export const revalidate = 3600;

export default async function Home() {
  let buys: ChartEntry[] = [];
  let sells: ChartEntry[] = [];
  let dateRange = "";
  let error: string | null = null;

  try {
    ({ buys, sells, dateRange } = await fetchChartData());
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">SEC Insider Trades</h1>
          <p className="text-sm text-gray-500 mt-1">Form 4 filings · updates daily</p>
        </div>

        {error ? (
          <p className="font-mono text-sm text-red-600 bg-red-50 border border-red-200 rounded p-4">
            Error: {error}
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <InsiderTradesChart
                data={buys}
                dateRange={dateRange}
                title="Top 5 Net Buys"
                mode="buy"
              />
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <InsiderTradesChart
                data={sells}
                dateRange={dateRange}
                title="Top 5 Net Sells"
                mode="sell"
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
