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
      { label: "國家", fn: (item: any) => item.school.country || "—" },
      { label: "城市", fn: (item: any) => (item.campuses || []).map((c: any) => c.city).filter((v: any, i: any, a: any) => a.indexOf(v) === i).join("、") || "—" },
      { label: "最低年齡", fn: (item: any) => item.school.min_age ? `${item.school.min_age}+` : "—" },
      { label: "最短週數", fn: (item: any) => {
        const mins = (item.programs || []).map((p: any) => p.min_weeks).filter((w: any) => w != null);
        return mins.length > 0 ? `${Math.min(...mins)} 週起` : "—";
      } },
      { label: "創立年份", fn: (item: any) => item.school.founded ? `${item.school.founded}年` : "—" },
      { label: "英語政策", fn: (item: any) => item.school.english_only_policy ? '<span class="check">✓ English Only</span>' : '<span class="cross">✗ 無強制</span>' },
      { label: "認證", fn: (item: any) => (item.school.accreditation || []).join("、") || "—" },
      { label: "國籍數量", fn: (item: any) => item.school.nationality_count ? `${item.school.nationality_count}+ 國` : "—" },
      { label: "課程數量", fn: (item: any) => `${item.programs?.length || 0} 種` },
      { label: "住宿選項", fn: (item: any) => [...new Set((item.housing || []).map((h: any) => h.type))].join("、") || "—" },
      { label: "簽證選項", fn: (item: any) => {
        const allVisas = (item.cityInfo || []).flatMap((ci: any) => ci.visa_options || []);
        return [...new Set(allVisas)].join("、") || "—";
      } },
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
      const classSize = s.class_size_typical
        ? `${s.class_size_typical}${s.class_size_max ? "/" + s.class_size_max : ""} 人`
        : "—";
      const strengthsTags = (s.strengths || []).length > 0
        ? `<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">${(s.strengths || []).map((t: string) => `<span class="city-tag">${t}</span>`).join("")}</div>`
        : "";
      return `
      <div class="school-card">
        <div class="card-header">
          <h3>${s.name}</h3>
          <p>${s.full_name}</p>
        </div>
        <div class="card-body">
          <div class="card-row"><span class="card-label">城市</span><span class="card-value">${cities || "—"}</span></div>
          <div class="card-row"><span class="card-label">班級</span><span class="card-value">${classSize}</span></div>
          <div class="card-row"><span class="card-label">創立</span><span class="card-value">${s.founded ? s.founded + "年" : "—"}</span></div>
          <div class="card-row"><span class="card-label">英語政策</span><span class="card-value">${s.english_only_policy ? "✓ English Only" : "無強制"}</span></div>
          <div class="card-row"><span class="card-label">認證</span><span class="card-value">${(s.accreditation || []).join("、") || "—"}</span></div>
          <div class="card-row"><span class="card-label">國籍</span><span class="card-value">${s.nationality_count ? s.nationality_count + "+ 國" : "—"}</span></div>
          ${strengthsTags}
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
        const weeksInfo = p.min_weeks ? ` · ${p.min_weeks}週起` : "";
        const levelLine = (p.entry_level || p.outcome_level)
          ? `<div style="font-size:11px;color:var(--color-text-muted);margin-top:6px">${p.entry_level ? `入:${p.entry_level}` : ""}${p.entry_level && p.outcome_level ? " → " : ""}${p.outcome_level ? `出:${p.outcome_level}` : ""}</div>`
          : "";
        return `
          <div class="card-row">
            <span class="card-label">${p.name}</span>
            <span class="card-value">${priceRange}</span>
          </div>
          <div class="intensity-section">
            <div class="intensity-label">
              <span style="font-size:11px;color:#9ca3af">${p.hours_per_week || "—"}小時/週 · ${p.schedule || ""}${weeksInfo}</span>
            </div>
            <div class="intensity-track"><div class="intensity-fill" data-width="${intensityWidth}%"></div></div>
            ${levelLine}
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
      const housingRows = (item.housing || []).map((h: any) => {
        const extras = [h.includes, h.commute_to_school].filter(Boolean).join(" · ");
        const extraLine = extras
          ? `<div style="font-size:11px;color:var(--color-text-muted);margin-top:4px">${extras}</div>`
          : "";
        return `
        <div class="card-row" style="flex-direction:column;align-items:stretch">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
            <span class="card-label">${h.type}${h.subtype ? " · " + h.subtype : ""}</span>
            <span class="card-value">${h.currency || "CAD"}$${h.price_per_week}/週</span>
          </div>
          ${extraLine}
        </div>`;
      }).join("");
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
      const ci = allCityInfo.find((x: any) => (x.city || "").trim().toLowerCase() === (c.city || "").trim().toLowerCase());
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

    // 11.5 Phase 16b — 新增 section 計算
    // COMPARE_SUMMARY: "3 間學校・5 個校區"
    const uniqueSchoolNames = new Set(schools.map((item: any) => item.school.name));
    const totalCampuses = schools.reduce((sum: number, item: any) => sum + (item.campuses?.length || 0), 0);
    const compareSummary = `${uniqueSchoolNames.size} 間學校・${totalCampuses} 個校區`;

    // TLDR cards
    const tldrCards = schools.map((item: any) => {
      const s = item.school;
      const cityLabel = (item.campuses || []).map((c: any) => c.city).join("、");
      const oneLiner = s.one_liner
        ? s.one_liner
        : `<span style="color:var(--color-text-muted)">請洽顧問取得這間學校的定位描述</span>`;
      return `
      <div class="school-card">
        <div class="card-header">
          <h3>${s.name}${cityLabel ? " · " + cityLabel : ""}</h3>
          <p>${s.country || ""}</p>
        </div>
        <div class="card-body" style="font-size:14px;line-height:1.75">${oneLiner}</div>
      </div>`;
    }).join("\n");

    // Suitable-for chips — 跨校共同 tag 用主色高亮
    const tagCount = new Map<string, number>();
    schools.forEach((item: any) => {
      (item.school.suitable_for || []).forEach((t: string) => tagCount.set(t, (tagCount.get(t) || 0) + 1));
    });
    const suitableForChips = schools.map((item: any) => {
      const s = item.school;
      const tags = (s.suitable_for || []);
      const chipsHtml = tags.length > 0
        ? tags.map((t: string) => {
            const shared = (tagCount.get(t) || 0) > 1 && schools.length > 1;
            const style = shared
              ? "background:var(--color-primary);color:white;font-weight:600"
              : "";
            return `<span class="city-tag" style="${style}">${t}</span>`;
          }).join("")
        : `<span style="color:var(--color-text-muted);font-size:13px">請洽顧問</span>`;
      return `
      <div class="school-card">
        <div class="card-header"><h3>${s.name}</h3><p>適合的學生類型</p></div>
        <div class="card-body" style="display:flex;flex-wrap:wrap;gap:6px">${chipsHtml}</div>
      </div>`;
    }).join("\n");

    // Quality cards — 班級/政策/認證/年資
    const qualityCards = schools.map((item: any) => {
      const s = item.school;
      const classSize = s.class_size_typical
        ? `${s.class_size_typical}${s.class_size_max ? "/" + s.class_size_max : ""} 人`
        : "—";
      const englishPolicy = s.english_only_policy_label
        ? s.english_only_policy_label
        : (s.english_only_policy ? "✓ English Only" : "無強制");
      const accred = (s.accreditation || []).length > 0
        ? (s.accreditation || []).map((a: string) => `<span class="city-tag">${a}</span>`).join("")
        : `<span style="color:var(--color-text-muted);font-size:13px">—</span>`;
      const yearsOld = s.founded ? `${new Date().getFullYear() - s.founded} 年` : "—";
      return `
      <div class="school-card">
        <div class="card-header"><h3>${s.name}</h3><p>教學品質</p></div>
        <div class="card-body">
          <div class="card-row"><span class="card-label">班級人數</span><span class="card-value">${classSize}</span></div>
          <div class="card-row"><span class="card-label">English Only</span><span class="card-value">${englishPolicy}</span></div>
          <div class="card-row" style="flex-direction:column;align-items:stretch">
            <span class="card-label" style="margin-bottom:6px">認證</span>
            <div style="display:flex;flex-wrap:wrap;gap:4px">${accred}</div>
          </div>
          <div class="card-row"><span class="card-label">創立至今</span><span class="card-value">${yearsOld}</span></div>
        </div>
      </div>`;
    }).join("\n");

    // Nationality cards — top_nationalities + 警語
    const nationalityCards = schools.map((item: any) => {
      const s = item.school;
      const tops = Array.isArray(s.top_nationalities) ? s.top_nationalities : [];
      const totalText = s.nationality_count ? `學員來自 ${s.nationality_count}+ 國` : "";
      const list = tops.length > 0
        ? `<ol style="padding-left:20px;font-size:13px;line-height:1.9;margin:0">${tops.map((n: any) => {
            const label = typeof n === "string" ? n : (n.name || n.country || "—");
            const flag = (typeof n === "object" && n && n.flag) ? n.flag + " " : "";
            return `<li>${flag}${label}</li>`;
          }).join("")}</ol>`
        : `<p style="font-size:13px;color:var(--color-text-muted);margin:0">請洽顧問取得當期數據</p>`;
      const footer = tops.length > 0
        ? `<p style="font-size:11px;color:var(--color-text-muted);margin-top:10px">順序為常見度,實際依當期而定</p>`
        : "";
      return `
      <div class="school-card">
        <div class="card-header"><h3>${s.name}</h3><p>${totalText}</p></div>
        <div class="card-body">
          ${list}
          ${footer}
        </div>
      </div>`;
    }).join("\n");

    // 12. 替換所有佔位符
    html = html
      .replaceAll("{{PAGE_TITLE}}", title)
      .replace("{{COMPARE_SUMMARY}}", compareSummary)
      .replace("{{HERO_SCHOOL_CHIPS}}", heroChips)
      .replace("{{TABLE_HEADERS}}", tableHeaders)
      .replace("{{TABLE_ROWS}}", tableRows)
      .replace("{{OVERVIEW_CARDS}}", overviewCards)
      .replace("{{TLDR_CARDS}}", tldrCards)
      .replace("{{SUITABLE_FOR_CHIPS}}", suitableForChips)
      .replace("{{QUALITY_CARDS}}", qualityCards)
      .replace("{{NATIONALITY_CARDS}}", nationalityCards)
      .replace("{{PROGRAM_CARDS}}", programCards)
      .replace("{{HOUSING_CARDS}}", housingCards)
      .replace("{{CITY_CARDS}}", cityCards)
      .replace("{{DETAIL_CARDS}}", detailCards)
      .replace("{{TUITION_JSON}}", tuitionJson)
      .replace("{{HOUSING_JSON}}", housingJson)
      .replace("{{CALC_PLACEHOLDERS}}", calcPlaceholders);

    // 13. 存入資料庫
    console.log("Saving to database...");
    const publicUrl = workerUrl
      ? `${workerUrl.replace(/\/$/, "")}/?slug=${encodeURIComponent(slug)}`
      : `${supabaseUrl}/functions/v1/view-page?slug=${encodeURIComponent(slug)}`;

    const { data, error: dbError } = await supabase
      .from("generated_pages")
      .update({
        html_content: html,
        status: "published",
        html_url: publicUrl,
        public_url: publicUrl,
      })
      .eq("slug", slug)
      .select();

    if (dbError) throw new Error("資料庫儲存失敗：" + dbError.message);
    if (!data || data.length === 0) {
      throw new Error(`找不到要更新的頁面記錄（slug=${slug}），請確認前台是否已建立 row`);
    }

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
