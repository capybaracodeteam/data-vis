"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface ChartEntry {
  ticker: string;
  value: number;
}

function formatAxis(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(0)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
  return `$${abs}`;
}

function formatTooltipValue(n: number, sign: string): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs}`;
}

const MODE_STYLES = {
  buy: { color: "#16a34a", sign: "+" },
  sell: { color: "#dc2626", sign: "-" },
} as const;

export default function InsiderTradesChart({
  data,
  dateRange,
  title,
  mode,
}: {
  data: ChartEntry[];
  dateRange: string;
  title: string;
  mode: "buy" | "sell";
}) {
  const { color, sign } = MODE_STYLES[mode];

  if (data.length === 0) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-400 mt-0.5">{dateRange}</p>
        </div>
        <div className="flex h-48 items-center justify-center text-sm text-gray-400">
          No data for the past 7 days.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-400 mt-0.5">{dateRange}</p>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 16, right: 24, left: 56, bottom: 8 }}>
          <XAxis
            dataKey="ticker"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#374151", fontSize: 13, fontWeight: 600 }}
          />
          <YAxis
            tickFormatter={formatAxis}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#9ca3af", fontSize: 12 }}
          />
          <Tooltip
            formatter={(value) => [
              formatTooltipValue(value as number, sign),
              "Net insider activity",
            ]}
            cursor={{ fill: "rgba(0,0,0,0.03)" }}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              fontSize: "13px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
          />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={80} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
