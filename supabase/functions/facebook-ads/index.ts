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

    // Calcula a data atual no horário do Brasil (UTC-3)
    const brazilToday = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];

    let dateStart: string;
    let dateEnd: string = brazilToday;

    const fields = 'spend,impressions,clicks,reach,cpm,cpc,ctr';
    const campaignFields = 'campaign_name,spend,impressions,reach,clicks,cpm,cpc,ctr,actions,action_values,cost_per_action_type';
    const accountBase = `https://graph.facebook.com/v25.0/${FB_ACCOUNT}/insights`;
    const authParams = `access_token=${FB_TOKEN}&level=account`;
    const campaignAuth = `access_token=${FB_TOKEN}&level=campaign&limit=50`;

    let fbUrl: string;
    let fbDailyUrl: string;
    let fbCampaignUrl: string;

    if (period === 'today') {
      // date_preset=today retorna dados parciais do dia com atualização frequente
      dateStart = brazilToday;
      fbUrl         = `${accountBase}?fields=${fields}&date_preset=today&${authParams}`;
      fbDailyUrl    = `${accountBase}?fields=spend&date_preset=today&time_increment=1&${authParams}`;
      fbCampaignUrl = `${accountBase}?fields=${campaignFields}&date_preset=today&${campaignAuth}`;
    } else {
      if (period === 'custom' && customStart && customEnd) {
        dateStart = customStart;
        dateEnd   = customEnd;
      } else if (period === 'week') {
        const weekAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
        weekAgo.setDate(weekAgo.getDate() - 6);
        dateStart = weekAgo.toISOString().split('T')[0];
      } else {
        // month — do primeiro dia do mês até hoje
        const monthStart = new Date(Date.now() - 3 * 60 * 60 * 1000);
        monthStart.setDate(1);
        dateStart = monthStart.toISOString().split('T')[0];
      }

      // Inclui hoje explicitamente no until para capturar dados parciais do dia
      const timeRange = encodeURIComponent(JSON.stringify({ since: dateStart, until: dateEnd }));
      fbUrl         = `${accountBase}?fields=${fields}&time_range=${timeRange}&${authParams}`;
      fbDailyUrl    = `${accountBase}?fields=spend&time_range=${timeRange}&time_increment=1&${authParams}`;
      fbCampaignUrl = `${accountBase}?fields=${campaignFields}&time_range=${timeRange}&${campaignAuth}`;
    }

    const [fbResponse, fbDailyResponse, fbCampaignResponse] = await Promise.all([
      fetch(fbUrl),
      fetch(fbDailyUrl),
      fetch(fbCampaignUrl),
    ]);
    const [fbData, fbDailyData, fbCampaignData] = await Promise.all([
      fbResponse.json(),
      fbDailyResponse.json(),
      fbCampaignResponse.json(),
    ]);

    if (!fbResponse.ok || fbData.error) {
      throw new Error(fbData.error?.message || 'Erro ao buscar dados do Facebook');
    }

    const insights = fbData.data?.[0] || {};
    const spend = parseFloat(insights.spend || '0');

    const findAction = (arr: any[] | undefined, types: string[]): number => {
      const found = (arr || []).find((a: any) => types.includes(a.action_type));
      return found ? parseInt(found.value || '0', 10) : 0;
    };
    const findValue = (arr: any[] | undefined, types: string[]): string => {
      const found = (arr || []).find((a: any) => types.includes(a.action_type));
      return found ? parseFloat(found.value || '0').toFixed(2) : '0.00';
    };

    // Debug: log da resposta bruta de campanhas para diagnóstico
    console.log('[facebook-ads] campaign HTTP status:', fbCampaignResponse.status);
    console.log('[facebook-ads] campaign raw response:', JSON.stringify(fbCampaignData).slice(0, 2000));

    const campaigns = (fbCampaignData.error ? [] : (fbCampaignData.data || []) as any[])
      .map((c: any) => ({
        campaign_name:     c.campaign_name || 'Sem nome',
        spend:             parseFloat(c.spend || '0').toFixed(2),
        impressions:       c.impressions || '0',
        reach:             c.reach || '0',
        clicks:            c.clicks || '0',
        cpm:               parseFloat(c.cpm || '0').toFixed(2),
        cpc:               parseFloat(c.cpc || '0').toFixed(2),
        ctr:               parseFloat(c.ctr || '0').toFixed(2),
        purchases:         findAction(c.actions, ['purchase', 'offsite_conversion.fb_pixel_purchase']),
        initiate_checkout: findAction(c.actions, ['initiate_checkout', 'offsite_conversion.fb_pixel_initiate_checkout']),
        purchase_value:    findValue(c.action_values, ['purchase', 'offsite_conversion.fb_pixel_purchase']),
        cost_per_purchase: findValue(c.cost_per_action_type, ['purchase', 'offsite_conversion.fb_pixel_purchase']),
      }))
      .sort((a: any, b: any) => parseFloat(b.spend) - parseFloat(a.spend));

    // Campo debug incluído na resposta para diagnóstico no Network tab do browser
    const campaignDebug = {
      httpStatus:   fbCampaignResponse.status,
      hasError:     !!fbCampaignData.error,
      errorMessage: fbCampaignData.error?.message ?? null,
      errorCode:    fbCampaignData.error?.code ?? null,
      dataLength:   (fbCampaignData.data || []).length,
      firstItem:    (fbCampaignData.data || [])[0] ?? null,
      paging:       fbCampaignData.paging ?? null,
    };

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
        campaigns,
        campaignDebug,
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