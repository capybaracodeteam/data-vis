import { getSupabase } from "@/app/lib/supabase";
import InsiderTradesChart, { type ChartEntry } from "@/app/components/InsiderTradesChart";


interface PeriodData {
  buys: { data: ChartEntry[] };
  sells: { data: ChartEntry[] };
}

async function fetchPeriodData(days: number): Promise<PeriodData> {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - days);

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

  const buys: ChartEntry[] = entries
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const sells: ChartEntry[] = entries
    .filter((e) => e.value < 0)
    .sort((a, b) => a.value - b.value)
    .slice(0, 5)
    .map((e) => ({ ticker: e.ticker, value: Math.abs(e.value) }));

  return {
    buys: { data: buys },
    sells: { data: sells },
  };
}

export const revalidate = 3600;

export default async function Home() {
  let weekly: PeriodData | null = null;
  let monthly: PeriodData | null = null;
  let error: string | null = null;

  try {
    [weekly, monthly] = await Promise.all([fetchPeriodData(7), fetchPeriodData(30)]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  const empty = { data: [], dateRange: "" };

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Insider Trading</h1>
        </div>

        {error ? (
          <p className="font-mono text-sm text-red-600 bg-red-50 border border-red-200 rounded p-4">
            Error: {error}
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <InsiderTradesChart
                weekly={weekly?.buys ?? empty}
                monthly={monthly?.buys ?? empty}
                title="Largest Buys"
                mode="buy"
              />
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <InsiderTradesChart
                weekly={weekly?.sells ?? empty}
                monthly={monthly?.sells ?? empty}
                title="Largest Sells"
                mode="sell"
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
