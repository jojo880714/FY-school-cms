import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { schoolsInfo, selectedFields, title, slug } = await req.json();
    console.log("Received schools:", schoolsInfo?.length, "slug:", slug);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const workerUrl = Deno.env.get("WORKER_URL");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. 讀取模板
    const { data: templateData, error: templateError } = await supabase
      .from("page_templates")
      .select("html_content")
      .eq("id", "comparison")
      .single();

    if (templateError || !templateData) {
      throw new Error("無法讀取模板：" + templateError?.message);
    }

    let html = templateData.html_content;
    const schools = schoolsInfo;
    const schoolCount = schools.length;

    // 2. Hero chips
    const heroChips = schools.map((item: any) =>
      `<span class="hero-school-chip">${item.school.name}</span>`
    ).join("\n      ");

    // 3. 比較表格 headers
    const tableHeaders = schools.map((item: any) =>
      `<th>${item.school.name}</th>`
    ).join("\n              ");

    // 4. 比較表格 rows
    const tableRowDefs = [
      { label: "城市", fn: (item: any) => item.campuses.map((c: any) => c.city).filter((v: any, i: any, a: any) => a.indexOf(v) === i).join("、") || "—" },
      { label: "創立年份", fn: (item: any) => item.school.founded ? `${item.school.founded}年` : "—" },
      { label: "英語政策", fn: (item: any) => item.school.english_only_policy ? '<span class="check">✓ English Only</span>' : '<span class="cross">✗ 無強制</span>' },
      { label: "認證", fn: (item: any) => (item.school.accreditation || []).join("、") || "—" },
      { label: "國籍數量", fn: (item: any) => item.school.nationality_count ? `${item.school.nationality_count}+ 國` : "—" },
      { label: "課程數量", fn: (item: any) => `${item.programs?.length || 0} 種` },
      { label: "住宿選項", fn: (item: any) => [...new Set((item.housing || []).map((h: any) => h.type))].join("、") || "—" },
    ];

    const tableRows = tableRowDefs.map(row => {
      const cells = schools.map((item: any) =>
        `<td>${row.fn(item)}</td>`
      ).join("\n              ");
      return `<tr>\n              <td>${row.label}</td>\n              ${cells}\n            </tr>`;
    }).join("\n            ");

    // 5. Overview cards
    const overviewCards = schools.map((item: any) => {
      const s = item.school;
      const cities = [...new Set((item.campuses || []).map((c: any) => c.city))].join("、");
      return `
      <div class="school-card">
        <div class="card-header">
          <h3>${s.name}</h3>
          <p>${s.full_name}</p>
        </div>
        <div class="card-body">
          <div class="card-row"><span class="card-label">城市</span><span class="card-value">${cities || "—"}</span></div>
          <div class="card-row"><span class="card-label">創立</span><span class="card-value">${s.founded ? s.founded + "年" : "—"}</span></div>
          <div class="card-row"><span class="card-label">英語政策</span><span class="card-value">${s.english_only_policy ? "✓ English Only" : "無強制"}</span></div>
          <div class="card-row"><span class="card-label">認證</span><span class="card-value">${(s.accreditation || []).join("、") || "—"}</span></div>
          <div class="card-row"><span class="card-label">國籍</span><span class="card-value">${s.nationality_count ? s.nationality_count + "+ 國" : "—"}</span></div>
          ${item.note ? `<div class="advisor-note"><div class="advisor-note-label">顧問備注</div><div class="advisor-note-text">${item.note}</div></div>` : ""}
        </div>
      </div>`;
    }).join("\n");

    // 6. Program cards
    const programCards = schools.map((item: any) => {
      const programs = (item.programs || []);
      const programRows = programs.map((p: any) => {
        const tiers = (item.tiers || []).filter((t: any) => t.program_id === p.id);
        const priceRange = tiers.length > 0
          ? `CAD$${Math.min(...tiers.map((t: any) => Number(t.price_per_week)))}/週起`
          : "詳洽";
        const intensityWidth = Math.min(100, (p.hours_per_week || 20) / 30 * 100).toFixed(0);
        return `
          <div class="card-row">
            <span class="card-label">${p.name}</span>
            <span class="card-value">${priceRange}</span>
          </div>
          <div class="intensity-section">
            <div class="intensity-label">
              <span style="font-size:11px;color:#9ca3af">${p.hours_per_week || "—"}小時/週 · ${p.schedule || ""}</span>
            </div>
            <div class="intensity-track"><div class="intensity-fill" data-width="${intensityWidth}%"></div></div>
          </div>`;
      }).join("");
      return `
      <div class="school-card">
        <div class="card-header"><h3>${item.school.name}</h3><p>課程方案</p></div>
        <div class="card-body">${programRows || "<p style='font-size:13px;color:#9ca3af'>無資料</p>"}</div>
      </div>`;
    }).join("\n");

    // 7. Housing cards
    const housingCards = schools.map((item: any) => {
      const housingRows = (item.housing || []).map((h: any) => `
        <div class="card-row">
          <span class="card-label">${h.type}${h.subtype ? " · " + h.subtype : ""}</span>
          <span class="card-value">CAD$${h.price_per_week}/週</span>
        </div>`).join("");
      return `
      <div class="school-card">
        <div class="card-header"><h3>${item.school.name}</h3><p>住宿費用</p></div>
        <div class="card-body">${housingRows || "<p style='font-size:13px;color:#9ca3af'>無資料</p>"}</div>
      </div>`;
    }).join("\n");

    // 8. City cards
    const allCityInfo = schools.flatMap((item: any) => item.cityInfo || []);
    const seenCities = new Set<string>();
    const cityCards = schools.flatMap((item: any) =>
      (item.campuses || []).map((c: any) => c)
    ).filter((c: any) => {
      if (seenCities.has(c.city)) return false;
      seenCities.add(c.city);
      return true;
    }).map((c: any) => {
      const ci = allCityInfo.find((x: any) => x.city.trim().toLowerCase() === c.city.trim().toLowerCase());
      return `
      <div class="city-card">
        <div class="city-name">${c.city}</div>
        ${ci ? `
        <div class="city-tags">
          ${ci.climate ? `<span class="city-tag">${ci.climate}</span>` : ""}
          ${ci.population ? `<span class="city-tag">人口 ${ci.population}</span>` : ""}
          ${ci.cost_of_living_monthly_cad ? `<span class="city-tag">生活費 CAD$${ci.cost_of_living_monthly_cad}/月</span>` : ""}
        </div>
        <p style="font-size:13px;color:#6b7280">${(ci.highlights || []).join("・") || ""}</p>
        ` : "<p style='font-size:13px;color:#9ca3af'>城市資訊待補充</p>"}
        ${c.metro_station ? `<p style="font-size:12px;color:#6b7280;margin-top:8px">📍 ${c.metro_station}（步行 ${c.walk_minutes} 分鐘）</p>` : ""}
      </div>`;
    }).join("\n");

    // 9. Detail cards
    const detailCards = schools.map((item: any) => {
      const s = item.school;
      const campusHighlights = (item.campuses || []).map((c: any) =>
        c.highlight ? `<div class="card-row"><span class="card-label">${c.city}</span><span class="card-value" style="font-size:12px">${c.highlight}</span></div>` : ""
      ).join("");
      return `
      <div class="school-card">
        <div class="card-header"><h3>${s.name}</h3><p>${s.full_name}</p></div>
        <div class="card-body">
          ${campusHighlights}
          ${s.notes ? `<div style="font-size:13px;color:#6b7280;margin-top:8px;line-height:1.6">${s.notes}</div>` : ""}
          ${item.note ? `<div class="advisor-note"><div class="advisor-note-label">顧問備注</div><div class="advisor-note-text">${item.note}</div></div>` : ""}
        </div>
      </div>`;
    }).join("\n");

    // 10. 計算器資料
    const tuitionJson = JSON.stringify(schools.map((item: any) => {
      const allTiers = (item.tiers || []);
      const avgPrice = allTiers.length > 0
        ? allTiers.reduce((sum: number, t: any) => sum + Number(t.price_per_week), 0) / allTiers.length
        : 0;
      const housingMin = (item.housing || []).length > 0
        ? Math.min(...(item.housing || []).map((h: any) => Number(h.price_per_week)))
        : 0;
      return {
        name: item.school.name,
        price_per_week: Math.round(avgPrice),
        housing_min: housingMin,
      };
    }));

    const housingJson = JSON.stringify(schools.map((item: any) => ({
      name: item.school.name,
      options: (item.housing || []).map((h: any) => ({
        type: h.type,
        price: h.price_per_week,
      })),
    })));

    // 11. 計算器佔位
    const calcPlaceholders = schools.map((item: any) => `
      <div class="calc-result-card">
        <div class="calc-school-name">${item.school.name}</div>
        <div class="calc-amount">計算中...</div>
      </div>`).join("\n");

    // 12. 替換所有佔位符
    html = html
      .replaceAll("{{PAGE_TITLE}}", title)
      .replace("{{HERO_SCHOOL_CHIPS}}", heroChips)
      .replace("{{TABLE_HEADERS}}", tableHeaders)
      .replace("{{TABLE_ROWS}}", tableRows)
      .replace("{{OVERVIEW_CARDS}}", overviewCards)
      .replace("{{PROGRAM_CARDS}}", programCards)
      .replace("{{HOUSING_CARDS}}", housingCards)
      .replace("{{CITY_CARDS}}", cityCards)
      .replace("{{DETAIL_CARDS}}", detailCards)
      .replace("{{TUITION_JSON}}", tuitionJson)
      .replace("{{HOUSING_JSON}}", housingJson)
      .replace("{{CALC_PLACEHOLDERS}}", calcPlaceholders);

    // 13. 存入資料庫
    console.log("Saving to database...");
    const { error: dbError } = await supabase
      .from("generated_pages")
      .upsert({
        slug: slug,
        html_content: html,
        status: "published",
      }, { onConflict: "slug" });

    if (dbError) throw new Error("資料庫儲存失敗：" + dbError.message);

    const publicUrl = workerUrl
      ? `${workerUrl.replace(/\/$/, "")}/?slug=${encodeURIComponent(slug)}`
      : `${supabaseUrl}/functions/v1/view-page?slug=${encodeURIComponent(slug)}`;

    console.log("Done. URL:", publicUrl);
    return new Response(
      JSON.stringify({ success: true, url: publicUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Error:", String(err));
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
