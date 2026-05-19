import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BASE = "https://graph.facebook.com/v25.0";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ok  = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const err = (msg: string)   => new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const FB_TOKEN   = Deno.env.get("FB_ACCESS_TOKEN");
    const FB_ACCOUNT = Deno.env.get("FB_AD_ACCOUNT_ID");
    if (!FB_TOKEN || !FB_ACCOUNT) throw new Error("Credenciais do Facebook não configuradas");

    const body   = await req.json();
    const { action } = body;
    const auth   = `access_token=${FB_TOKEN}`;

    // ── TOGGLE STATUS ────────────────────────────────────────────────────────
    if (action === "toggle") {
      const { objectId, targetStatus } = body as { objectId: string; targetStatus: "ACTIVE" | "PAUSED" };
      const form = new URLSearchParams({ status: targetStatus, access_token: FB_TOKEN });
      const res  = await fetch(`${BASE}/${objectId}`, { method: "POST", body: form });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return ok({ success: true });
    }

    // ── LIST ────────────────────────────────────────────────────────────────
    const { level, dateRange, parentId } = body as {
      level:     "campaign" | "adset" | "ad";
      dateRange: { since: string; until: string };
      parentId:  string | null;
    };

    const timeRange    = encodeURIComponent(JSON.stringify(dateRange));
    const metricFields = "spend,impressions,clicks,reach,cpm,cpc,ctr,actions,action_values,cost_per_action_type";

    const PURCHASE  = ["purchase", "offsite_conversion.fb_pixel_purchase"];
    const CHECKOUT  = ["initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"];

    const findN = (arr: any[] | undefined, types: string[]): number => {
      const f = (arr || []).find((a: any) => types.includes(a.action_type));
      return f ? parseFloat(f.value || "0") : 0;
    };
    const findV = (arr: any[] | undefined, types: string[]): string => {
      const f = (arr || []).find((a: any) => types.includes(a.action_type));
      return f ? parseFloat(f.value || "0").toFixed(2) : "0.00";
    };
    const metrics = (ins: any) => ({
      spend:             parseFloat(ins.spend  || "0").toFixed(2),
      impressions:       ins.impressions || "0",
      reach:             ins.reach       || "0",
      clicks:            ins.clicks      || "0",
      cpm:               parseFloat(ins.cpm || "0").toFixed(2),
      cpc:               parseFloat(ins.cpc || "0").toFixed(2),
      ctr:               parseFloat(ins.ctr || "0").toFixed(2),
      purchases:             findN(ins.actions,            PURCHASE),
      initiate_checkout:     findN(ins.actions,            CHECKOUT),
      purchase_value:        findV(ins.action_values,      PURCHASE),
      cost_per_purchase:     findV(ins.cost_per_action_type, PURCHASE),
    });
    const budget = (v: string | undefined): string | null =>
      v ? (parseFloat(v) / 100).toFixed(2) : null;

    // ── CAMPAIGNS ────────────────────────────────────────────────────────────
    if (level === "campaign") {
      const insUrl = `${BASE}/${FB_ACCOUNT}/insights?level=campaign&fields=campaign_id,campaign_name,${metricFields}&time_range=${timeRange}&limit=50&${auth}`;
      const entUrl = `${BASE}/${FB_ACCOUNT}/campaigns?fields=id,name,status,effective_status,daily_budget,lifetime_budget&limit=100&${auth}`;

      const [inR, enR] = await Promise.all([fetch(insUrl), fetch(entUrl)]);
      const [inD, enD] = await Promise.all([inR.json(), enR.json()]);
      if (inD.error) throw new Error(inD.error.message);

      const eMap = new Map((enD.data || []).map((e: any) => [e.id, e]));
      const data = (inD.data || []).map((ins: any) => {
        const e = eMap.get(ins.campaign_id) || {};
        return {
          id:              ins.campaign_id,
          name:            ins.campaign_name || e.name || "Sem nome",
          status:          e.effective_status || e.status || "UNKNOWN",
          daily_budget:    budget(e.daily_budget),
          lifetime_budget: budget(e.lifetime_budget),
          ...metrics(ins),
        };
      }).sort((a: any, b: any) => parseFloat(b.spend) - parseFloat(a.spend));

      return ok({ success: true, data });
    }

    // ── AD SETS ──────────────────────────────────────────────────────────────
    if (level === "adset") {
      const insUrl = `${BASE}/${parentId}/insights?level=adset&fields=adset_id,adset_name,${metricFields}&time_range=${timeRange}&limit=50&${auth}`;
      const entUrl = `${BASE}/${parentId}/adsets?fields=id,name,status,effective_status,daily_budget,lifetime_budget&limit=100&${auth}`;

      const [inR, enR] = await Promise.all([fetch(insUrl), fetch(entUrl)]);
      const [inD, enD] = await Promise.all([inR.json(), enR.json()]);
      if (inD.error) throw new Error(inD.error.message);

      const eMap = new Map((enD.data || []).map((e: any) => [e.id, e]));
      const data = (inD.data || []).map((ins: any) => {
        const e = eMap.get(ins.adset_id) || {};
        return {
          id:              ins.adset_id,
          name:            ins.adset_name || e.name || "Sem nome",
          status:          e.effective_status || e.status || "UNKNOWN",
          daily_budget:    budget(e.daily_budget),
          lifetime_budget: budget(e.lifetime_budget),
          ...metrics(ins),
        };
      }).sort((a: any, b: any) => parseFloat(b.spend) - parseFloat(a.spend));

      return ok({ success: true, data });
    }

    // ── ADS ──────────────────────────────────────────────────────────────────
    if (level === "ad") {
      const insUrl = `${BASE}/${parentId}/insights?level=ad&fields=ad_id,ad_name,${metricFields}&time_range=${timeRange}&limit=50&${auth}`;
      const entUrl = `${BASE}/${parentId}/ads?fields=id,name,status,effective_status,creative{thumbnail_url,image_url,body,title}&limit=100&${auth}`;

      const [inR, enR] = await Promise.all([fetch(insUrl), fetch(entUrl)]);
      const [inD, enD] = await Promise.all([inR.json(), enR.json()]);
      if (inD.error) throw new Error(inD.error.message);

      const eMap = new Map((enD.data || []).map((e: any) => [e.id, e]));
      const data = (inD.data || []).map((ins: any) => {
        const e  = eMap.get(ins.ad_id) || {};
        const cr = e.creative || {};
        return {
          id:              ins.ad_id,
          name:            ins.ad_name || e.name || "Sem nome",
          status:          e.effective_status || e.status || "UNKNOWN",
          daily_budget:    null,
          lifetime_budget: null,
          thumbnail_url:   cr.thumbnail_url || null,
          image_url:       cr.image_url     || null,
          creative_body:   cr.body          || null,
          creative_title:  cr.title         || null,
          ...metrics(ins),
        };
      }).sort((a: any, b: any) => parseFloat(b.spend) - parseFloat(a.spend));

      return ok({ success: true, data });
    }

    throw new Error("Nível inválido");

  } catch (e) {
    return err(e instanceof Error ? e.message : "Erro desconhecido");
  }
});
