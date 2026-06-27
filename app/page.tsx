interface EdgarFiling {
  adsh: string;
  file_date: string;
  display_names: string[];
  [key: string]: unknown;
}

interface EdgarResponse {
  hits: {
    total: { value: number; relation: string };
    hits: { _source: EdgarFiling }[];
  };
}

async function fetchRecentForm4s(): Promise<{ total: number; relation: string; filings: EdgarFiling[] }> {
  const res = await fetch(
    "https://efts.sec.gov/LATEST/search-index?forms=4&dateRange=custom&startdt=2025-01-01&from=0&size=5",
    {
      headers: {
        "User-Agent": "insider-trading-viz/1.0 capybaracodeteam@gmail.com",
        "Accept-Encoding": "gzip, deflate",
      },
      next: { revalidate: 86400 },
    }
  );

  if (!res.ok) throw new Error(`SEC EDGAR request failed: ${res.status}`);

  const data: EdgarResponse = await res.json();
  if (!data.hits || typeof data.hits.total?.value !== "number" || !Array.isArray(data.hits.hits)) {
    throw new Error("Unexpected EDGAR API response shape");
  }
  return {
    total: data.hits.total.value,
    relation: data.hits.total.relation,
    filings: data.hits.hits.map((h) => h._source),
  };
}

export default async function Home() {
  let result: { total: number; relation: string; filings: EdgarFiling[] } | null = null;
  let error: string | null = null;

  try {
    result = await fetchRecentForm4s();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <main className="min-h-screen bg-gray-50 p-10 font-mono">
      <h1 className="text-2xl font-bold mb-6">SEC Form 4 — Data Pipeline Check</h1>

      {error && (
        <p className="text-red-600 bg-red-50 border border-red-200 rounded p-4 mb-6">
          Error: {error}
        </p>
      )}

      {result && (
        <>
          <div className="bg-white border rounded p-4 mb-6 inline-block">
            <p className="text-sm text-gray-500">Total Form 4 filings found</p>
            <p className="text-4xl font-bold">
              {result.relation === "gte" ? "10,000+" : result.total.toLocaleString()}
            </p>
          </div>

          <h2 className="text-lg font-semibold mb-3">First 5 raw results:</h2>
          <pre className="bg-white border rounded p-4 text-sm overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(result.filings, null, 2)}
          </pre>
        </>
      )}
    </main>
  );
}
