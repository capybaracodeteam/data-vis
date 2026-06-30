"use client";

import { useState } from "react";
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

interface PeriodEntry {
  data: ChartEntry[];
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

const PERIODS = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
] as const;

type Period = (typeof PERIODS)[number]["key"];

export default function InsiderTradesChart({
  weekly,
  monthly,
  title,
  mode,
}: {
  weekly: PeriodEntry;
  monthly: PeriodEntry;
  title: string;
  mode: "buy" | "sell";
}) {
  const [period, setPeriod] = useState<Period>("weekly");
  const { data } = period === "weekly" ? weekly : monthly;
  const { color, sign } = MODE_STYLES[mode];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex-1" />
        <h2 className="flex-1 text-center text-lg font-semibold text-gray-900">{title}</h2>
        <div className="flex flex-1 justify-end">
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {PERIODS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  period === key
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-gray-400">
          No data for this period.
        </div>
      ) : (
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
      )}
    </div>
  );
}
