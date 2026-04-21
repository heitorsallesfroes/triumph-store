import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const FB_TOKEN = Deno.env.get("FB_ACCESS_TOKEN");
    const FB_ACCOUNT = Deno.env.get("FB_AD_ACCOUNT_ID");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!FB_TOKEN || !FB_ACCOUNT) throw new Error("Credenciais do Facebook não configuradas");
    if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Credenciais do Supabase não configuradas");

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { period, dateStart: customStart, dateEnd: customEnd } = await req.json();

    const today = new Date();
    let dateStart: string;
    let dateEnd: string = today.toISOString().split('T')[0];

    if (period === 'custom' && customStart && customEnd) {
      dateStart = customStart;
      dateEnd = customEnd;
    } else if (period === 'today') {
      dateStart = dateEnd;
    } else if (period === 'week') {
      const weekAgo = new Date(today);
      weekAgo.setDate(today.getDate() - 7);
      dateStart = weekAgo.toISOString().split('T')[0];
    } else {
      const monthAgo = new Date(today);
      monthAgo.setDate(1);
      dateStart = monthAgo.toISOString().split('T')[0];
    }

    const timeRange = `{"since":"${dateStart}","until":"${dateEnd}"}`;
    const fields = 'spend,impressions,clicks,reach,cpm,cpc,ctr';
    const fbUrl = `https://graph.facebook.com/v25.0/${FB_ACCOUNT}/insights?fields=${fields}&time_range=${timeRange}&access_token=${FB_TOKEN}&level=account`;
    const fbDailyUrl = `https://graph.facebook.com/v25.0/${FB_ACCOUNT}/insights?fields=spend&time_range=${timeRange}&time_increment=1&access_token=${FB_TOKEN}&level=account`;

    const [fbResponse, fbDailyResponse] = await Promise.all([
      fetch(fbUrl),
      fetch(fbDailyUrl),
    ]);
    const [fbData, fbDailyData] = await Promise.all([
      fbResponse.json(),
      fbDailyResponse.json(),
    ]);

    if (!fbResponse.ok || fbData.error) {
      throw new Error(fbData.error?.message || 'Erro ao buscar dados do Facebook');
    }

    const insights = fbData.data?.[0] || {};
    const spend = parseFloat(insights.spend || '0');

    const dailySpend: { date: string; spend: number }[] = (fbDailyData.data || [])
      .map((d: { date_start: string; spend: string }) => ({
        date: d.date_start,
        spend: parseFloat(d.spend || '0'),
      }))
      .filter((d: { date: string; spend: number }) => d.spend > 0);

    const { data: salesData, error: salesError } = await supabase
      .from('sales')
      .select('total_sale_price, net_received, profit, status')
      .gte('sale_date', `${dateStart}T00:00:00`)
      .lte('sale_date', `${dateEnd}T23:59:59`)
      .neq('status', 'cancelado');

    if (salesError) throw new Error(salesError.message);

    const totalSales = salesData?.length || 0;
    const totalRevenue = salesData?.reduce((sum, s) => sum + parseFloat(s.total_sale_price || '0'), 0) || 0;
    const totalProfit = salesData?.reduce((sum, s) => sum + parseFloat(s.profit || '0'), 0) || 0;

    const roas = spend > 0 ? (totalRevenue / spend).toFixed(2) : '0';
    const cpv = totalSales > 0 ? (spend / totalSales).toFixed(2) : '0';

    return new Response(
      JSON.stringify({
        success: true,
        period,
        dateStart,
        dateEnd,
        dailySpend,
        metrics: {
          spend: spend.toFixed(2),
          impressions: insights.impressions || '0',
          clicks: insights.clicks || '0',
          reach: insights.reach || '0',
          cpm: parseFloat(insights.cpm || '0').toFixed(2),
          cpc: parseFloat(insights.cpc || '0').toFixed(2),
          ctr: parseFloat(insights.ctr || '0').toFixed(2),
          purchases: String(totalSales),
          purchase_value: totalRevenue.toFixed(2),
          profit: totalProfit.toFixed(2),
          roas,
          cpv,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});