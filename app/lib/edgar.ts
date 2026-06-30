import { XMLParser } from "fast-xml-parser";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TradeRow } from "./types";

// ── Types ──────────────────────────────────────────────────────────────────────

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
  transactionCoding?: { transactionCode?: string };
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

// ── Constants ──────────────────────────────────────────────────────────────────

const EDGAR_HEADERS = {
  "User-Agent": "insider-trading-viz/1.0 capybaracodeteam@gmail.com",
  "Accept-Encoding": "gzip, deflate",
};

const BATCH_SIZE = 20;
const DELAY_MS = 2000;

// ── Helpers ────────────────────────────────────────────────────────────────────

function cikFromAdsh(adsh: string): string {
  return String(parseInt(adsh.split("-")[0], 10) || 0);
}

function padCik(cik: string): string {
  return cik.padStart(10, "0");
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ── EDGAR pipeline ─────────────────────────────────────────────────────────────

async function fetchFilingsForDateRange(
  startdt: string,
  enddt: string,
  limit: number
): Promise<EdgarFiling[]> {
  const PAGE_SIZE = 100;
  const all: EdgarFiling[] = [];
  let from = 0;

  while (all.length < limit) {
    const size = Math.min(PAGE_SIZE, limit - all.length);
    const url = `https://efts.sec.gov/LATEST/search-index?forms=4&dateRange=custom&startdt=${startdt}&enddt=${enddt}&from=${from}&size=${size}`;
    const res = await fetch(url, { headers: EDGAR_HEADERS, cache: "no-store" });
    if (!res.ok) throw new Error(`EDGAR search failed: ${res.status}`);
    const data: EdgarResponse = await res.json();
    if (!data.hits || !Array.isArray(data.hits.hits)) {
      throw new Error("Unexpected EDGAR response shape");
    }
    const hits = data.hits.hits;
    all.push(...hits.map((h) => h._source));
    if (hits.length < size) break;
    from += hits.length;
    if (all.length < limit) await sleep(500);
  }

  return all;
}

async function getPrimaryDoc(cik: string, adsh: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://data.sec.gov/submissions/CIK${padCik(cik)}.json`,
      { headers: EDGAR_HEADERS, cache: "no-store" }
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
): Promise<TradeRow[]> {
  try {
    const filename = primaryDoc.includes("/") ? primaryDoc.split("/").pop()! : primaryDoc;
    const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${adsh.replace(/-/g, "")}/${filename}`;
    const res = await fetch(url, { headers: EDGAR_HEADERS, cache: "no-store" });
    if (!res.ok) return [];

    const xml = await res.text();
    const parser = new XMLParser({
      ignoreAttributes: true,
      isArray: (name) => name === "nonDerivativeTransaction" || name === "reportingOwner",
    });
    const doc: Form4Doc =
      (parser.parse(xml) as { ownershipDocument?: Form4Doc })?.ownershipDocument ?? {};

    const company = doc.issuer?.issuerName ?? "Unknown";
    const ticker = doc.issuer?.issuerTradingSymbol ?? null;
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
    const rows: TradeRow[] = [];

    // Only open market purchases (P) and sales (S) reflect deliberate insider conviction.
    // Awards, grants, option exercises, tax withholding, etc. are excluded.
    const VALID_CODES = new Set(["P", "S"]);
    const INVALID_TICKERS = new Set([null, "", "N/A", "NONE"]);

    for (const txn of txns) {
      const txnCode = txn.transactionCoding?.transactionCode ?? "";
      if (!VALID_CODES.has(txnCode)) continue;
      if (INVALID_TICKERS.has(ticker)) continue;

      const shares = Number(txn.transactionAmounts?.transactionShares?.value ?? 0);
      const price = txn.transactionAmounts?.transactionPricePerShare?.value ?? null;
      const tradeDate = String(txn.transactionDate?.value ?? filedDate);
      if (shares <= 0) continue;

      const rawPrice = price !== null ? Number(price) : null;
      const rawTotal = rawPrice !== null ? shares * rawPrice : null;
      // Filers sometimes enter the total transaction value in the price-per-share field.
      // Any single transaction over $1B is almost certainly a filing error.
      const badPrice = rawTotal !== null && rawTotal > 1_000_000_000;

      rows.push({
        id: `${adsh}-${rows.length}`,
        filed_date: filedDate,
        trade_date: tradeDate,
        company,
        ticker,
        insider_name: insiderName,
        role: role || null,
        type: txnCode === "P" ? "buy" : "sell",
        shares,
        price_per_share: badPrice ? null : rawPrice,
        total_value: badPrice ? null : rawTotal,
        adsh,
      });
    }
    return rows;
  } catch {
    return [];
  }
}

// ── Sync ───────────────────────────────────────────────────────────────────────

export async function syncDateRange(
  startdt: string,
  enddt: string,
  supabase: SupabaseClient,
  limit = 20
): Promise<number> {
  const filings = await fetchFilingsForDateRange(startdt, enddt, limit);
  console.log(`Fetched ${filings.length} filings from EDGAR (${startdt} → ${enddt})`);

  type ResolvedDoc = { f: EdgarFiling; cik: string; doc: string };
  const validDocs: ResolvedDoc[] = [];
  for (let i = 0; i < filings.length; i += BATCH_SIZE) {
    const chunk = filings.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      chunk.map(async (f) => {
        const cik = cikFromAdsh(f.adsh);
        const doc = await getPrimaryDoc(cik, f.adsh);
        return doc ? { f, cik, doc } : null;
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value !== null) validDocs.push(r.value);
    }
    if (i + BATCH_SIZE < filings.length) await sleep(DELAY_MS);
  }
  console.log(`Resolved ${validDocs.length}/${filings.length} primary docs`);

  let upserted = 0;
  for (let i = 0; i < validDocs.length; i += BATCH_SIZE) {
    const batch = validDocs.slice(i, i + BATCH_SIZE);
    const rows: TradeRow[] = [];

    for (const { f, cik, doc } of batch) {
      await sleep(DELAY_MS);
      const parsed = await parseForm4(cik, f.adsh, doc, f.file_date);
      rows.push(...parsed);
    }

    if (rows.length > 0) {
      const { error } = await supabase.from("trades").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
      upserted += rows.length;
      console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: upserted ${rows.length} rows`);
    }
  }

  return upserted;
}
