import { syncDateRange, isoDate } from "@/app/lib/edgar";
import { getSupabase } from "@/app/lib/supabase";

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
      startdt = isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
    }

    const upserted = await syncDateRange(startdt, enddt, getSupabase());
    return Response.json({ ok: true, upserted, range: `${startdt} → ${enddt}` });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
