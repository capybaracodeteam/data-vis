import { createClient } from "@supabase/supabase-js";
import { syncDateRange, isoDate } from "../app/lib/edgar";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const args = process.argv.slice(2);
  let startdt = args[0];
  let enddt = args[1];

  if (!startdt || !enddt) {
    const today = new Date();
    enddt = isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
    startdt = isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 3));
  }

  console.log(`Starting sync: ${startdt} → ${enddt}`);
  const upserted = await syncDateRange(startdt, enddt, supabase, 10_000);
  console.log(`Sync complete: ${upserted} rows upserted`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
