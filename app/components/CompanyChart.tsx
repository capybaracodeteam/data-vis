"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

export interface DivergingEntry {
  label: string;
  buys: number;
  sells: number; // negative
}

interface PeriodData {
  data: DivergingEntry[];
}

const PERIODS = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
] as const;
type Period = (typeof PERIODS)[number]["key"];

function formatAxis(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(0)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
  return `$${abs}`;
}

function formatTooltip(n: number): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "+" : "-";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs}`;
}

export default function CompanyChart({
  weekly,
  monthly,
}: {
  weekly: PeriodData;
  monthly: PeriodData;
}) {
  const [period, setPeriod] = useState<Period>("weekly");
  const { data } = period === "weekly" ? weekly : monthly;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex-1" />
        <h2 className="flex-1 text-center text-lg font-semibold text-gray-900">
          Insider Activity
        </h2>
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

      {data.every((d) => d.buys === 0 && d.sells === 0) ? (
        <div className="flex h-48 items-center justify-center text-sm text-gray-400">
          No data for this period.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 16, right: 24, left: 56, bottom: 8 }}>
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#374151", fontSize: 12 }}
            />
            <YAxis
              tickFormatter={formatAxis}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#9ca3af", fontSize: 12 }}
            />
            <ReferenceLine y={0} stroke="#d1d5db" strokeWidth={1} />
            <Tooltip
              formatter={(value, name) => [
                formatTooltip(value as number),
                name === "buys" ? "Buys" : "Sells",
              ]}
              cursor={{ fill: "rgba(0,0,0,0.03)" }}
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
                fontSize: "13px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              }}
            />
            <Bar dataKey="buys" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={40} />
            <Bar dataKey="sells" fill="#dc2626" radius={[0, 0, 4, 4]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
