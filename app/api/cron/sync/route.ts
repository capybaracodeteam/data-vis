import { XMLParser } from "fast-xml-parser";
import { getSupabase, type TradeRow } from "@/app/lib/supabase";

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

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ── EDGAR pipeline (same as page.tsx but without ISR cache) ───────────────────

async function fetchFilingsForDateRange(startdt: string, enddt: string): Promise<EdgarFiling[]> {
  const url = `https://efts.sec.gov/LATEST/search-index?forms=4&dateRange=custom&startdt=${startdt}&enddt=${enddt}&from=0&size=20`;
  const res = await fetch(url, { headers: EDGAR_HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`EDGAR search failed: ${res.status}`);
  const data: EdgarResponse = await res.json();
  if (!data.hits || typeof data.hits.total?.value !== "number" || !Array.isArray(data.hits.hits)) {
    throw new Error("Unexpected EDGAR response shape");
  }
  return data.hits.hits.map((h) => h._source);
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

    for (const txn of txns) {
      const shares = Number(txn.transactionAmounts?.transactionShares?.value ?? 0);
      const price = txn.transactionAmounts?.transactionPricePerShare?.value ?? null;
      const adCode = txn.transactionAmounts?.transactionAcquiredDisposedCode?.value ?? "";
      const tradeDate = String(txn.transactionDate?.value ?? filedDate);
      if (shares <= 0) continue;
      rows.push({
        id: `${adsh}-${rows.length}`,
        filed_date: filedDate,
        trade_date: tradeDate,
        company,
        ticker: ticker || null,
        insider_name: insiderName,
        role: role || null,
        type: adCode === "A" ? "buy" : adCode === "D" ? "sell" : "other",
        shares,
        price_per_share: price !== null ? Number(price) : null,
        total_value: price !== null ? shares * Number(price) : null,
        adsh,
      });
    }
    return rows;
  } catch {
    return [];
  }
}

// ── Sync ───────────────────────────────────────────────────────────────────────

async function syncDateRange(startdt: string, enddt: string): Promise<number> {
  const filings = await fetchFilingsForDateRange(startdt, enddt);

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
      const { error } = await getSupabase().from("trades").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
      upserted += rows.length;
    }
  }

  return upserted;
}

// ── Route handler ──────────────────────────────────────────────────────────────

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const params = new URL(request.url).searchParams;
    let startdt = params.get("startdt");
    let enddt = params.get("enddt");

    if (!startdt || !enddt) {
      const today = new Date();
      enddt = isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
      startdt = isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2));
    }

    const upserted = await syncDateRange(startdt, enddt);
    return Response.json({ ok: true, upserted, range: `${startdt} → ${enddt}` });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
