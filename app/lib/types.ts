export interface TradeRow {
  id: string;
  filed_date: string;
  trade_date: string;
  company: string;
  ticker: string | null;
  insider_name: string;
  role: string | null;
  type: "buy" | "sell" | "other";
  shares: number;
  price_per_share: number | null;
  total_value: number | null;
  adsh: string;
}
