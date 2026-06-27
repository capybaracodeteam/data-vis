import { XMLParser } from "fast-xml-parser";

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

interface EdgarFiling {
  adsh: string;
  file_date: string;
  [key: string]: unknown;
}

interface EdgarResponse {
  hits: {
    total: { value: number; relation: string };
    hits: { _source: EdgarFiling }[];
  };
}

interface Form4Owner {
  reportingOwnerId?: { rptOwnerName?: string };
  reportingOwnerRelationship?: {
    isDirector?: number | string;
    isOfficer?: number | string;
    isTenPercentOwner?: number | string;
    officerTitle?: unknown;
  };
}

interface Form4Transaction {
  transactionDate?: { value?: string };
  transactionAmounts?: {
    transactionShares?: { value?: number };
    transactionPricePerShare?: { value?: number };
    transactionAcquiredDisposedCode?: { value?: string };
  };
}

interface Form4Doc {
  issuer?: { issuerName?: string; issuerTradingSymbol?: string };
  reportingOwner?: Form4Owner[];
  nonDerivativeTable?: { nonDerivativeTransaction?: Form4Transaction[] };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EDGAR_HEADERS = {
  "User-Agent": "insider-trading-viz/1.0 capybaracodeteam@gmail.com",
  "Accept-Encoding": "gzip, deflate",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function cikFromAdsh(adsh: string): string {
  return String(parseInt(adsh.split("-")[0], 10) || 0);
}

function padCik(cik: string): string {
  return cik.padStart(10, "0");
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

// ── Data pipeline ─────────────────────────────────────────────────────────────

async function fetchRecentFilings(): Promise<EdgarFiling[]> {
  const res = await fetch(
    "https://efts.sec.gov/LATEST/search-index?forms=4&dateRange=custom&startdt=2025-01-01&from=0&size=20",
    { headers: EDGAR_HEADERS, next: { revalidate: 86400 } }
  );
  if (!res.ok) throw new Error(`EDGAR search failed: ${res.status}`);
  const data: EdgarResponse = await res.json();
  if (!data.hits || typeof data.hits.total?.value !== "number" || !Array.isArray(data.hits.hits)) {
    throw new Error("Unexpected EDGAR API response shape");
  }
  return data.hits.hits.map((h) => h._source).slice(0, 10);
}

async function getPrimaryDoc(cik: string, adsh: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://data.sec.gov/submissions/CIK${padCik(cik)}.json`,
      { headers: EDGAR_HEADERS, next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const accessions: string[] = data?.filings?.recent?.accessionNumber ?? [];
    const docs: string[] = data?.filings?.recent?.primaryDocument ?? [];
    const idx = accessions.indexOf(adsh);
    return idx === -1 ? null : (docs[idx] ?? null);
  } catch {
    return null;
  }
}

async function parseForm4(
  cik: string,
  adsh: string,
  primaryDoc: string,
  filedDate: string
): Promise<Trade[]> {
  try {
    const filename = primaryDoc.includes("/") ? primaryDoc.split("/").pop()! : primaryDoc;
    const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${adsh.replace(/-/g, "")}/${filename}`;
    const res = await fetch(url, { headers: EDGAR_HEADERS, next: { revalidate: 86400 } });
    if (!res.ok) return [];

    const xml = await res.text();
    const parser = new XMLParser({
      ignoreAttributes: true,
      isArray: (name) => name === "nonDerivativeTransaction" || name === "reportingOwner",
    });
    const doc: Form4Doc =
      (parser.parse(xml) as { ownershipDocument?: Form4Doc })?.ownershipDocument ?? {};

    const company = doc.issuer?.issuerName ?? "Unknown";
    const ticker = doc.issuer?.issuerTradingSymbol ?? "";
    const owner = doc.reportingOwner?.[0];
    const insiderName = owner?.reportingOwnerId?.rptOwnerName ?? "Unknown";
    const rel = owner?.reportingOwnerRelationship ?? {};
    const title = String(rel.officerTitle ?? "").trim();
    const role =
      title ||
      (Number(rel.isOfficer) === 1 ? "Officer" : "") ||
      (Number(rel.isDirector) === 1 ? "Director" : "") ||
      (Number(rel.isTenPercentOwner) === 1 ? "10% Owner" : "") ||
      "Insider";

    const txns = doc.nonDerivativeTable?.nonDerivativeTransaction ?? [];
    const trades: Trade[] = [];

    for (const txn of txns) {
      const shares = Number(txn.transactionAmounts?.transactionShares?.value ?? 0);
      const price = Number(txn.transactionAmounts?.transactionPricePerShare?.value ?? 0);
      const adCode = txn.transactionAmounts?.transactionAcquiredDisposedCode?.value ?? "";
      const tradeDate = String(txn.transactionDate?.value ?? filedDate);
      if (shares <= 0) continue;
      trades.push({
        id: `${adsh}-${trades.length}`,
        filedDate,
        tradeDate,
        company,
        ticker,
        insiderName,
        role,
        type: adCode === "A" ? "buy" : adCode === "D" ? "sell" : "other",
        shares,
        pricePerShare: price,
        totalValue: shares * price,
      });
    }
    return trades;
  } catch {
    return [];
  }
}

async function fetchForm4Trades(): Promise<Trade[]> {
  const filings = await fetchRecentFilings();

  const docResults = await Promise.allSettled(
    filings.map(async (f) => {
      const cik = cikFromAdsh(f.adsh);
      const doc = await getPrimaryDoc(cik, f.adsh);
      return doc ? { f, cik, doc } : null;
    })
  );

  type ResolvedDoc = { f: EdgarFiling; cik: string; doc: string };
  const validDocs = docResults.flatMap((r): ResolvedDoc[] =>
    r.status === "fulfilled" && r.value !== null ? [r.value] : []
  );

  const trades: Trade[] = [];
  for (const { f, cik, doc } of validDocs) {
    await new Promise<void>((r) => setTimeout(r, 500));
    const batch = await parseForm4(cik, f.adsh, doc, f.file_date);
    trades.push(...batch);
  }

  return trades.sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function Home() {
  let trades: Trade[] = [];
  let error: string | null = null;

  try {
    trades = await fetchForm4Trades();
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
          <p className="text-gray-500">No trades found.</p>
        ) : null}
      </div>
    </main>
  );
}
