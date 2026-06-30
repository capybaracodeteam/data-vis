import { notFound } from "next/navigation";
import Link from "next/link";
import { getSupabase } from "@/app/lib/supabase";
import CompanyChart, { type DivergingEntry } from "@/app/components/CompanyChart";

export const revalidate = 3600;

function formatDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}

function formatWeekStart(end: Date, weekIdx: number): string {
  const d = new Date(end);
  d.setDate(d.getDate() - weekIdx * 7 - 6);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function TickerPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 27);

  const { data, error } = await getSupabase()
    .from("trades")
    .select("trade_date, type, total_value, company")
    .eq("ticker", upperTicker)
    .gte("trade_date", start.toISOString().slice(0, 10))
    .lte("trade_date", end.toISOString().slice(0, 10))
    .in("type", ["buy", "sell"])
    .not("total_value", "is", null)
    .gt("total_value", 0);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) notFound();

  const companyName = data[0].company ?? upperTicker;

  // Daily buckets: last 7 days
  const dailyMap = new Map<string, { buys: number; sells: number }>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    dailyMap.set(d.toISOString().slice(0, 10), { buys: 0, sells: 0 });
  }

  // Weekly buckets: 4 weeks (index 0 = most recent)
  const weeklyMap = new Map<number, { buys: number; sells: number }>();
  for (let i = 0; i < 4; i++) weeklyMap.set(i, { buys: 0, sells: 0 });

  for (const row of data) {
    const { type, total_value, trade_date } = row;
    if (type !== "buy" && type !== "sell") continue;

    const daily = dailyMap.get(trade_date);
    if (daily) {
      if (type === "buy") daily.buys += total_value!;
      else daily.sells += total_value!;
    }

    const tradeDay = new Date(trade_date + "T00:00:00");
    const daysAgo = Math.floor(
      (end.getTime() - tradeDay.getTime()) / (1000 * 60 * 60 * 24)
    );
    const weekIdx = Math.min(Math.floor(daysAgo / 7), 3);
    const weekly = weeklyMap.get(weekIdx)!;
    if (type === "buy") weekly.buys += total_value!;
    else weekly.sells += total_value!;
  }

  const weeklyData: DivergingEntry[] = Array.from(dailyMap.entries()).map(
    ([date, { buys, sells }]) => ({
      label: formatDay(date),
      buys,
      sells: -sells,
    })
  );

  // Reverse so oldest week is on the left
  const monthlyData: DivergingEntry[] = Array.from(weeklyMap.entries())
    .sort(([a], [b]) => b - a)
    .map(([weekIdx, { buys, sells }]) => ({
      label: formatWeekStart(end, weekIdx),
      buys,
      sells: -sells,
    }));

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Back
          </Link>
          <p className="text-sm font-medium text-gray-500 mt-4">{upperTicker}</p>
          <h1 className="text-2xl font-bold text-gray-900">{companyName}</h1>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <CompanyChart weekly={{ data: weeklyData }} monthly={{ data: monthlyData }} />
        </div>
      </div>
    </main>
  );
}
