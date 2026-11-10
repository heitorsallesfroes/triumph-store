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

    // ── DIAGNOSTICS ───────────────────────────────────────────────────────────
    if (action === "diagnose") {
      const { objectId } = body as { objectId: string };
      const [permRes, objRes] = await Promise.all([
        fetch(`${BASE}/me/permissions?access_token=${FB_TOKEN}`),
        fetch(`${BASE}/${objectId}?fields=id,name,status,effective_status,object_type&access_token=${FB_TOKEN}`),
      ]);
      const [permData, objData] = await Promise.all([permRes.json(), objRes.json()]);
      return ok({ success: true, permissions: permData, object: objData });
    }

    // ── DASHBOARD (Gerenciador novo, FASE 1: SÓ LEITURA, só GET na Meta) ───────
    // part "metrics": insights por anúncio da conta inteira, um por dia (time_increment=1), + alcance/frequência do
    // período. part "creatives": nome, status, miniatura, vídeo e link de prévia dos anúncios pedidos.
    if (action === "dashboard") {
      const DAY = /^\d{4}-\d{2}-\d{2}$/;
      const getAll = async (url: string, maxPages = 40): Promise<any[]> => {
        const out: any[] = [];
        let next: string | null = url;
        for (let i = 0; next && i < maxPages; i++) {
          const r = await fetch(next);
          const d = await r.json();
          if (d.error) throw new Error(d.error.message);
          out.push(...(d.data || []));
          next = d.paging && d.paging.next ? d.paging.next : null;
        }
        return out;
      };
      const num = (v: unknown) => { const n = parseFloat(String(v ?? "0")); return Number.isFinite(n) ? n : 0; };
      const act = (arr: any[] | undefined, types: string[]) => Math.max(0, ...(arr || []).filter((a: any) => types.includes(a.action_type)).map((a: any) => num(a.value)));
      const CONVERSA = ["onsite_conversion.messaging_conversation_started_7d"];
      const COMPRA = ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase", "onsite_web_purchase"];

      if (body.part === "creatives") {
        const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((id: string) => /^\d{5,25}$/.test(id)).slice(0, 300);
        const ads: any[] = [];
        const videos = new Map<string, string>();
        const fields = "id,name,effective_status,preview_shareable_link,creative.thumbnail_width(480).thumbnail_height(480){thumbnail_url,image_url,video_id,object_type}";
        for (let i = 0; i < ids.length; i += 50) {
          const r = await fetch(`${BASE}/?ids=${ids.slice(i, i + 50).join(",")}&fields=${encodeURIComponent(fields)}&access_token=${FB_TOKEN}`);
          const d = await r.json();
          if (d.error) throw new Error(d.error.message);
          Object.values(d || {}).forEach((a: any) => ads.push(a));
        }
        // vídeo: o link do arquivo (sem token); sem permissão para ler o vídeo, fica só a miniatura
        const vids = [...new Set(ads.map((a) => a.creative && a.creative.video_id).filter(Boolean))].slice(0, 100);
        for (let i = 0; i < vids.length; i += 50) {
          try {
            const r = await fetch(`${BASE}/?ids=${vids.slice(i, i + 50).join(",")}&fields=source&access_token=${FB_TOKEN}`);
            const d = await r.json();
            if (!d.error) Object.values(d || {}).forEach((v: any) => { if (v && v.id && v.source) videos.set(String(v.id), String(v.source)); });
          } catch { /* sem vídeo */ }
        }
        return ok({
          success: true,
          ads: ads.map((a) => {
            const cr = a.creative || {};
            return {
              id: String(a.id), name: a.name || null, status: a.effective_status || null,
              thumbnail_url: cr.thumbnail_url || null, image_url: cr.image_url || null,
              is_video: !!cr.video_id || cr.object_type === "VIDEO", video_url: cr.video_id ? videos.get(String(cr.video_id)) || null : null,
              preview_url: a.preview_shareable_link || null,
            };
          }),
        });
      }

      const { since, until, periodSince } = body as { since: string; until: string; periodSince?: string };
      if (!DAY.test(since || "") || !DAY.test(until || "") || since > until) throw new Error("Período inválido");
      const pSince = periodSince && DAY.test(periodSince) && periodSince >= since ? periodSince : since;
      const fieldsDaily = "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,inline_link_clicks,reach,frequency,cpm,ctr,actions";
      const tr = (a: string, b: string) => encodeURIComponent(JSON.stringify({ since: a, until: b }));
      const [daily, period] = await Promise.all([
        getAll(`${BASE}/${FB_ACCOUNT}/insights?level=ad&time_increment=1&fields=${fieldsDaily}&time_range=${tr(since, until)}&limit=500&access_token=${FB_TOKEN}`),
        getAll(`${BASE}/${FB_ACCOUNT}/insights?level=ad&fields=ad_id,reach,frequency,impressions&time_range=${tr(pSince, until)}&limit=500&access_token=${FB_TOKEN}`),
      ]);
      return ok({
        success: true, since, until, periodSince: pSince,
        daily: daily.map((r: any) => ({
          ad_id: String(r.ad_id), ad_name: r.ad_name || null, adset_id: r.adset_id || null, adset_name: r.adset_name || null,
          campaign_id: r.campaign_id || null, campaign_name: r.campaign_name || null, date: r.date_start,
          spend: num(r.spend), impressions: num(r.impressions), clicks: num(r.inline_link_clicks || r.clicks), reach: num(r.reach),
          frequency: num(r.frequency), conversations: act(r.actions, CONVERSA), purchases: act(r.actions, COMPRA),
        })),
        period: period.map((r: any) => ({ ad_id: String(r.ad_id), reach: num(r.reach), frequency: num(r.frequency), impressions: num(r.impressions) })),
      });
    }

    // ── TOGGLE STATUS ──────────────────────────────────────────────────────────
    if (action === "toggle") {
      const { objectId, targetStatus } = body as { objectId: string; targetStatus: "ACTIVE" | "PAUSED" };
      const url  = `${BASE}/${objectId}`;
      const form = new URLSearchParams({ status: targetStatus, access_token: FB_TOKEN });
      const res  = await fetch(url, { method: "POST", body: form });
      const data = await res.json();
      if (data.error) {
        return new Response(JSON.stringify({
          success: false,
          error: data.error.message,
          debug: {
            url,
            objectId,
            targetStatus,
            httpStatus: res.status,
            metaError: data.error,
          },
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return ok({ success: true });
    }

    // ── UPDATE BUDGET ──────────────────────────────────────────────────────────
    if (action === "update_budget") {
      const { objectId, dailyBudget } = body as { objectId: string; dailyBudget: number };
      const centavos = Math.round(dailyBudget * 100).toString();
      const form = new URLSearchParams({ daily_budget: centavos, access_token: FB_TOKEN });
      const res  = await fetch(`${BASE}/${objectId}`, { method: "POST", body: form });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return ok({ success: true });
    }

    // ── LIST ───────────────────────────────────────────────────────────────────
    const { level, dateRange, parentId, statusFilter = "active_only" } = body as {
      level:        "campaign" | "adset" | "ad";
      dateRange:    { since: string; until: string };
      parentId:     string | null;
      statusFilter: "active_only" | "active_paused" | "all";
    };

    const timeRange    = encodeURIComponent(JSON.stringify(dateRange));
    const metricFields = "spend,impressions,clicks,reach,cpm,cpc,ctr,actions,action_values,cost_per_action_type";

    const PURCHASE = ["purchase", "offsite_conversion.fb_pixel_purchase"];
    const CHECKOUT = ["initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"];

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
      purchases:             findN(ins.actions,              PURCHASE),
      initiate_checkout:     findN(ins.actions,              CHECKOUT),
      purchase_value:        findV(ins.action_values,        PURCHASE),
      cost_per_purchase:     findV(ins.cost_per_action_type, PURCHASE),
    });
    const budget = (v: string | undefined): string | null =>
      v ? (parseFloat(v) / 100).toFixed(2) : null;

    // ── CAMPAIGNS ─────────────────────────────────────────────────────────────
    if (level === "campaign") {
      const insUrl = `${BASE}/${FB_ACCOUNT}/insights?level=campaign&fields=campaign_id,campaign_name,${metricFields}&time_range=${timeRange}&limit=50&access_token=${FB_TOKEN}`;

      // Entity URL: optionally filter by status
      let entUrl = `${BASE}/${FB_ACCOUNT}/campaigns?fields=id,name,status,effective_status,daily_budget,lifetime_budget&limit=100&access_token=${FB_TOKEN}`;
      if (statusFilter === "active_paused") {
        const f = encodeURIComponent(JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED"] }]));
        entUrl = `${BASE}/${FB_ACCOUNT}/campaigns?fields=id,name,status,effective_status,daily_budget,lifetime_budget&filtering=${f}&limit=100&access_token=${FB_TOKEN}`;
      }

      const [inR, enR] = await Promise.all([fetch(insUrl), fetch(entUrl)]);
      const [inD, enD] = await Promise.all([inR.json(), enR.json()]);
      if (inD.error) throw new Error(inD.error.message);

      const insMap = new Map((inD.data || []).map((ins: any) => [ins.campaign_id, ins]));
      const eMap   = new Map((enD.data || []).map((e: any)   => [e.id, e]));

      const zeroMetrics = () => ({
        spend: "0.00", impressions: "0", reach: "0", clicks: "0",
        cpm: "0.00", cpc: "0.00", ctr: "0.00",
        purchases: 0, initiate_checkout: 0, purchase_value: "0.00", cost_per_purchase: "0.00",
      });

      let data: any[];

      if (statusFilter === "active_only") {
        // Only campaigns that had spend in the period (insights-first)
        data = (inD.data || []).map((ins: any) => {
          const e = eMap.get(ins.campaign_id) || {};
          return {
            id:              ins.campaign_id,
            name:            ins.campaign_name || e.name || "Sem nome",
            status:          e.effective_status || e.status || "UNKNOWN",
            daily_budget:    budget(e.daily_budget),
            lifetime_budget: budget(e.lifetime_budget),
            ...metrics(ins),
          };
        });
      } else {
        // Entity-first: include all campaigns (with or without spend)
        data = (enD.data || []).map((e: any) => {
          const ins = insMap.get(e.id);
          return {
            id:              e.id,
            name:            e.name || "Sem nome",
            status:          e.effective_status || e.status || "UNKNOWN",
            daily_budget:    budget(e.daily_budget),
            lifetime_budget: budget(e.lifetime_budget),
            ...(ins ? metrics(ins) : zeroMetrics()),
          };
        });
      }

      data.sort((a: any, b: any) => parseFloat(b.spend) - parseFloat(a.spend));
      return ok({ success: true, data });
    }

    // ── AD SETS ────────────────────────────────────────────────────────────────
    if (level === "adset") {
      const insUrl = `${BASE}/${parentId}/insights?level=adset&fields=adset_id,adset_name,${metricFields}&time_range=${timeRange}&limit=50&access_token=${FB_TOKEN}`;
      const entUrl = `${BASE}/${parentId}/adsets?fields=id,name,status,effective_status,daily_budget,lifetime_budget&limit=100&access_token=${FB_TOKEN}`;

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

    // ── ADS ────────────────────────────────────────────────────────────────────
    if (level === "ad") {
      const insUrl = `${BASE}/${parentId}/insights?level=ad&fields=ad_id,ad_name,${metricFields}&time_range=${timeRange}&limit=50&access_token=${FB_TOKEN}`;
      const entUrl = `${BASE}/${parentId}/ads?fields=id,name,status,effective_status,creative{thumbnail_url,image_url,body,title}&limit=100&access_token=${FB_TOKEN}`;

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
