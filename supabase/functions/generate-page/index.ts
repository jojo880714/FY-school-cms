import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// FX rates(per-LP build-time fix;client-side 後續用 LPCalcState 可覆寫)
const FX_RATES: Record<string, number> = {
  '£': 40, '€': 35, 'USD': 32, 'CA$': 23, 'AU$': 21, 'NZ$': 20, 'CAD': 23, 'AUD': 21,
};

// HTML escape
function escapeHtml(s: any): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string));
}

// grid column class based on N
function gridColClass(n: number): string {
  if (n === 1) return 'cols-1';
  if (n === 2) return 'cols-2';
  if (n === 3) return 'cols-3';
  return 'cols-many';
}

// Q3 opt-in — 把學生條件 profile 組成 hero 下方的摘要句
function buildProfileSummary(profile: any): string {
  if (!profile) return '';
  const parts: string[] = [];
  if (profile.age) parts.push(`${profile.age} 歲`);
  if (profile.budgetWeekly && profile.budgetCurrency) {
    parts.push(`預算 $${Number(profile.budgetWeekly).toLocaleString()} ${profile.budgetCurrency}/週`);
  }
  if (profile.examCefr) {
    const examLabels: Record<string, string> = { toeic: '多益', ielts: '雅思', toefl: '托福 iBT' };
    if (profile.examType && !String(profile.examType).startsWith('none') && profile.examScore != null) {
      parts.push(`${examLabels[profile.examType] ?? profile.examType} ${profile.examScore}（${profile.examCefr}）`);
    } else {
      parts.push(`無檢定（${profile.examCefr}）`);
    }
  }
  if (profile.maxWeeks) parts.push(`${profile.maxWeeks} 週以內`);
  if (Array.isArray(profile.selectedPurposes) && profile.selectedPurposes.length > 0) {
    const labels: Record<string, string> = {
      lang_school: '語言進修', exam_prep: '考試衝刺', working_holiday: '打工度假',
      pathway_uni: '銜接升大學', pathway_grad: '銜接升研究所', career_change: '職涯轉換',
      short_tour: '遊學團', custom_tour: '客製化遊學', pr_immigration: '移民規劃', undecided: '方向未定',
    };
    parts.push(profile.selectedPurposes.map((id: string) => labels[id] ?? id).join('・'));
  }
  if (parts.length === 0) return '';
  return `<p class="hero-sub" style="font-size:12px;opacity:0.72;margin-bottom:16px;margin-top:-6px;letter-spacing:0.02em;">為 ${parts.join('・')} 整理</p>`;
}

// persona label master(對齊 IMPORT_TEMPLATES.md 7 個有效計分 tag + Phase 18b pr_immigration)
const personaLabels: Record<string, string> = {
  exam_prep: '考試衝刺', pathway_uni: '銜接升大學', pathway_grad: '銜接升研究所',
  working_holiday: '打工度假', career_change: '職涯轉換', gap_year: '學測後 Gap year',
  pr_immigration: '移民/PR 規劃',
};

// Per-school helpers(供 renderA/B/C/D + scroll 新 6 個 renderSec 共用)
const cityList = (item: any): string =>
  [...new Set((item.campuses || []).map((c: any) => c.city))].join('、') || '—';
const classSizeText = (s: any): string =>
  s.class_size_typical ? `${s.class_size_typical}${s.class_size_max ? '/' + s.class_size_max : ''} 人` : '—';
const avgTuition = (item: any): { value: number; currency: string } | null => {
  const tiers = (item.tiers || []);
  if (tiers.length === 0) return null;
  const sum = tiers.reduce((a: number, t: any) => a + Number(t.price_per_week || 0), 0);
  const currency = tiers.find((t: any) => t.currency)?.currency || 'CAD';
  return { value: Math.round(sum / tiers.length), currency };
};
const minHousing = (item: any): { value: number; currency: string } | null => {
  const housing = (item.housing || []);
  if (housing.length === 0) return null;
  const min = Math.min(...housing.map((h: any) => Number(h.price_per_week || 0)));
  const currency = housing.find((h: any) => h.currency)?.currency || 'CAD';
  return { value: min, currency };
};

// ════════════════════════════════════════════════════════════════════
//  Card variant renderers(renderA/B/C/D)— C2 帶過來,per-school input
// ════════════════════════════════════════════════════════════════════

function renderA(item: any): string {
  const s = item.school;
  const oneLiner = s.one_liner
    ? `<div style="font-size:16px;line-height:1.7;color:var(--color-accent,var(--ink2));font-weight:500;margin-bottom:12px">${escapeHtml(s.one_liner)}</div>`
    : "";
  const personas = (s.persona_match || []).length > 0
    ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${(s.persona_match || []).map((p: string) =>
        `<span class="city-tag persona-tag">${escapeHtml(personaLabels[p] || p)}</span>`).join("")}</div>`
    : "";
  const suitable = (s.suitable_for || []).length > 0
    ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">${(s.suitable_for || []).map((t: string) =>
        `<span class="city-tag persona-tag">${escapeHtml(t)}</span>`).join("")}</div>`
    : "";
  const yearsOld = s.founded ? `${new Date().getFullYear() - s.founded}年` : "—";
  return `
  <div class="card school-card">
    <div class="card-header"><h3>${escapeHtml(s.name)}</h3><p>${escapeHtml(s.full_name || '')}</p></div>
    <div class="card-body">
      ${oneLiner}
      ${personas}
      ${suitable}
      <div class="card-row"><span class="card-label">城市</span><span class="card-value">${cityList(item)}</span></div>
      <div class="card-row"><span class="card-label">班級</span><span class="card-value">${classSizeText(s)}</span></div>
      <div class="card-row"><span class="card-label">國籍</span><span class="card-value">${s.nationality_count ? s.nationality_count + "+ 國" : "—"}</span></div>
      <div class="card-row"><span class="card-label">創立至今</span><span class="card-value">${yearsOld}</span></div>
      ${item.note ? `<div class="advisor-note"><div class="advisor-note-label">顧問備注</div><div class="advisor-note-text">${escapeHtml(item.note)}</div></div>` : ""}
    </div>
  </div>`;
}

function renderB(item: any, idx: number, totalsForBar: number[], maxTotal: number): string {
  const s = item.school;
  const t = avgTuition(item);
  const h = minHousing(item);
  const tuitionText = t ? `${t.currency} $${t.value.toLocaleString()}` : "—";
  const housingText = h ? `${h.currency} $${h.value.toLocaleString()}` : "—";
  const total = totalsForBar[idx];
  const barWidth = Math.round(total / maxTotal * 100);
  const totalCurrency = t?.currency || h?.currency || '';
  return `
  <div class="card school-card">
    <div class="card-header"><h3>${escapeHtml(s.name)}</h3><p>${cityList(item)}</p></div>
    <div class="card-body">
      <div style="display:flex;gap:14px;margin-bottom:14px">
        <div style="flex:1">
          <div style="font-size:11px;color:var(--ink3);margin-bottom:4px">課程費 / 週(平均)</div>
          <div style="font-size:22px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums">${tuitionText}</div>
        </div>
        <div style="flex:1">
          <div style="font-size:11px;color:var(--ink3);margin-bottom:4px">住宿費 / 週(最低)</div>
          <div style="font-size:22px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums">${housingText}</div>
        </div>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
          <span style="font-size:11px;color:var(--ink3)">每週總開銷水位</span>
          <span style="font-size:12px;color:var(--ink3);font-variant-numeric:tabular-nums">${totalCurrency} $${total.toLocaleString()}</span>
        </div>
        <div style="height:6px;background:var(--sur2);border-radius:3px;overflow:hidden">
          <div style="width:${barWidth}%;height:100%;background:var(--ink)"></div>
        </div>
        <p style="font-size:10px;color:var(--ink3);margin-top:6px">⚠ 滿格代表本頁學校中最高週費。跨幣別未換算,同幣比較較準。完整費用以放洋報價單為準。</p>
      </div>
      ${item.note ? `<div class="advisor-note" style="margin-top:14px"><div class="advisor-note-label">顧問備注</div><div class="advisor-note-text">${escapeHtml(item.note)}</div></div>` : ""}
    </div>
  </div>`;
}

// renderC — variant C(氛圍情感型),per-school 欄位映射 LP variant C 精神
// (LP source 的 c.moodTag/moodDesc/moodScene 是 per-campus hardcode demo,
//  schema 沒對應欄位 → 用 strengths[0] / one_liner / 第一個 campus.highlight 映射)
function renderC(item: any): string {
  const s = item.school;
  const moodTag = (s.strengths && s.strengths[0]) || s.country || '城市氛圍';
  const moodDesc = s.one_liner || `${s.name} 的學習氛圍`;
  const pillsArr = (s.persona_match || []).slice(0, 4);
  const pills = pillsArr.length > 0
    ? `<div style="display:flex;flex-wrap:wrap;gap:6px">${pillsArr.map((p: string) =>
        `<span class="city-tag icon-pill">${escapeHtml(personaLabels[p] || p)}</span>`).join("")}</div>`
    : "";
  const firstHighlight = (item.campuses || []).map((c: any) => c.highlight).filter(Boolean)[0];
  const moodScene = firstHighlight || moodDesc;
  const t = avgTuition(item);
  const tuitionText = t ? `${t.currency} $${t.value.toLocaleString()}` : "—";
  const minAge = s.min_age ? `${s.min_age}+` : "—";
  return `
  <div class="card school-card">
    <div class="card-header"><h3>${escapeHtml(s.name)}</h3><p>${cityList(item)}</p></div>
    <div class="card-body" style="display:flex;flex-direction:column;gap:12px">
      <div class="mood-tag" style="font-size:13px;color:var(--ink3);letter-spacing:0.06em;text-transform:uppercase;font-weight:600">${escapeHtml(moodTag)}</div>
      <div class="mood-desc" style="font-size:14px;color:var(--ink3);line-height:1.6">${escapeHtml(moodDesc)}</div>
      ${pills}
      <div class="quote-box" style="background:var(--sur2);border-left:3px solid var(--line2);padding:12px 14px;border-radius:0 8px 8px 0;font-size:15px;color:var(--ink);line-height:1.55">「${escapeHtml(moodScene)}」</div>
      <div class="card-foot" style="font-size:12px;color:var(--ink3);margin-top:auto;padding-top:8px;border-top:1px solid var(--line);font-variant-numeric:tabular-nums">週費起 ${tuitionText}・最低年齡 ${minAge}</div>
      ${item.note ? `<div class="advisor-note"><div class="advisor-note-label">顧問備注</div><div class="advisor-note-text">${escapeHtml(item.note)}</div></div>` : ""}
    </div>
  </div>`;
}

function renderD(item: any): string {
  const s = item.school;
  const oneLiner = s.one_liner
    ? `<div style="font-size:13px;line-height:1.6;color:var(--ink2);font-style:italic;margin-bottom:10px">${escapeHtml(s.one_liner)}</div>`
    : "";
  const englishPolicy = s.english_only_policy_label
    || (s.english_only_policy ? "✓ English Only" : "無強制");
  const programCount = (item.programs || []).length;
  const housingTypes = [...new Set((item.housing || []).map((h: any) => h.type))].join("、") || "—";
  const personasChips = (s.persona_match || []).length > 0
    ? (s.persona_match || []).map((p: string) =>
        `<span class="city-tag persona-tag">${escapeHtml(personaLabels[p] || p)}</span>`).join("")
    : "";
  const suitableChips = (s.suitable_for || []).map((t: string) =>
    `<span class="city-tag persona-tag">${escapeHtml(t)}</span>`).join("");
  const strengthsTags = (s.strengths || []).map((t: string) =>
    `<span class="city-tag persona-tag">${escapeHtml(t)}</span>`).join("");
  const allChips = personasChips + suitableChips + strengthsTags;
  const chipsBlock = allChips
    ? `<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">${allChips}</div>` : "";
  return `
  <div class="card school-card">
    <div class="card-header"><h3>${escapeHtml(s.name)}</h3><p>${escapeHtml(s.full_name || '')}</p></div>
    <div class="card-body" style="font-size:12px">
      ${oneLiner}
      <div class="card-row"><span class="card-label">城市</span><span class="card-value">${cityList(item)}</span></div>
      <div class="card-row"><span class="card-label">班級</span><span class="card-value">${classSizeText(s)}</span></div>
      <div class="card-row"><span class="card-label">創立</span><span class="card-value">${s.founded ? s.founded + "年" : "—"}</span></div>
      <div class="card-row"><span class="card-label">英語政策</span><span class="card-value">${escapeHtml(englishPolicy)}</span></div>
      <div class="card-row"><span class="card-label">認證</span><span class="card-value">${(s.accreditation || []).join("、") || "—"}</span></div>
      <div class="card-row"><span class="card-label">國籍</span><span class="card-value">${s.nationality_count ? s.nationality_count + "+ 國" : "—"}</span></div>
      <div class="card-row"><span class="card-label">課程</span><span class="card-value">${programCount} 種</span></div>
      <div class="card-row"><span class="card-label">住宿</span><span class="card-value">${housingTypes}</span></div>
      ${chipsBlock}
      ${item.note ? `<div class="advisor-note"><div class="advisor-note-label">顧問備注</div><div class="advisor-note-text">${escapeHtml(item.note)}</div></div>` : ""}
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════════════════
//  Phase 2 Batch 1 — Scroll template section renderers(per-school)
//  對應 LP source(fanyang-consult.html)精神,適配 EF schoolsInfo per-school
// ════════════════════════════════════════════════════════════════════

// renderSec01 Hero — port from LP line 3488-3517(精神:動態 headline based on N)
// per-school 映射:LP c.name(per-campus)→ item.school.name(per-school)
function renderSec01(schools: any[]): string {
  const n = schools.length;
  let headline = '';
  let citiesLine = '';
  if (n === 0) {
    headline = `<span class="accent">選一間學校</span>，<br>開始說英語的人生。`;
  } else if (n === 1) {
    headline = `你的英語旅程，<br>從 <span class="accent">${escapeHtml(schools[0].school.name)}</span> 開始。`;
  } else if (n === 2) {
    headline = `<span class="accent">${escapeHtml(schools[0].school.name)}</span> 還是 <span class="accent">${escapeHtml(schools[1].school.name)}</span>，<br>哪一間在等你？`;
  } else {
    headline = `比較這幾間學校，<br>找到<span class="accent">你的下一站</span>。`;
    citiesLine = schools.map((item: any) => {
      const cities = (item.campuses || []).map((c: any) => c.city).filter(Boolean).join('、');
      return `<span>${escapeHtml(item.school.name)}${cities ? ' · ' + escapeHtml(cities) : ''}</span>`;
    }).join('·');
  }
  return `
    <div class="hero-eyebrow">放洋諮詢專屬</div>
    <div class="wrap">
      <div class="hero-line">${headline}</div>
      ${citiesLine ? `<div class="hero-cities">${citiesLine}</div>` : ''}
      <div class="hero-foot">往下滑，一起找到最適合你的學校 ↓</div>
    </div>
  `;
}

// renderSec02 卡片 grid + ABCD dispatch — port from LP line 3518-3537
// per-school 映射:dispatch 用 EF 自己的 renderA/B/C/D(per-school)而非 LP renderCard
function renderSec02(schools: any[], cardVariant: 'A' | 'B' | 'C' | 'D'): string {
  if (schools.length === 0) {
    return `
      <div class="wrap">
        <div class="sec-h">
          <div class="sec-eyebrow">尚未選校</div>
          <div class="sec-title">請先選擇學校</div>
        </div>
      </div>`;
  }
  // fx for renderB(per-school 跨校水位比較)
  const totalsForBar = schools.map((it: any) => {
    const t = avgTuition(it)?.value || 0;
    const h = minHousing(it)?.value || 0;
    return t + h;
  });
  const maxTotal = Math.max(1, ...totalsForBar);

  const cls = gridColClass(schools.length);
  const cards = schools.map((item: any, idx: number) => {
    if (cardVariant === 'B') return renderB(item, idx, totalsForBar, maxTotal);
    if (cardVariant === 'C') return renderC(item);
    if (cardVariant === 'D') return renderD(item);
    return renderA(item);
  }).join('');

  const eyebrow = schools.length === 1 ? '關於這間學校' : '比較這幾間學校';
  const title = schools.length === 1 ? '你的這間學校' : '同時比較這些學校';
  return `
    <div class="wrap">
      <div class="sec-h">
        <div class="sec-eyebrow">${eyebrow}</div>
        <div class="sec-title">${title}</div>
        <div class="sec-sub">同一份資料,不同的選校切角。每張卡片可以從不同切角呈現(學員適配 / 費用導向 / 氛圍情感 / 資訊密集)。</div>
      </div>
      <div class="cards-grid ${cls}">${cards}</div>
    </div>
  `;
}

// renderSec03 比較表 — port from LP line 3668-3784
// per-school 映射:LP 13 rows per-campus → 12 rows per-school,column 級欄位移除
function renderSec03(schools: any[]): string {
  if (schools.length === 0) {
    return `
      <div class="wrap">
        <div class="sec-h">
          <div class="sec-eyebrow">數字並排,一目瞭然</div>
          <div class="sec-title">比較表</div>
        </div>
        <p style="color:var(--ink3);font-size:14px;text-align:center;padding:48px 0">尚未選校,無資料可比較。</p>
      </div>`;
  }

  const rowDefs: Array<{ label: string; fn: (item: any) => string }> = [
    { label: '國家', fn: (item) => escapeHtml(item.school.country || '—') },
    { label: '城市', fn: (item) => {
      const cities = [...new Set((item.campuses || []).map((c: any) => c.city).filter(Boolean))];
      return cities.length > 0 ? escapeHtml(cities.join('、')) : '—';
    } },
    { label: '最低年齡', fn: (item) => item.school.min_age ? `${item.school.min_age}+` : '—' },
    { label: '最短週數', fn: (item) => {
      const mins = (item.programs || []).map((p: any) => p.min_weeks).filter((w: any) => w != null);
      return mins.length > 0 ? `${Math.min(...mins)} 週起` : '—';
    } },
    { label: '創立年份', fn: (item) => item.school.founded ? `${item.school.founded}` : '—' },
    { label: '班級人數', fn: (item) => classSizeText(item.school) },
    { label: 'English Only', fn: (item) => {
      const s = item.school;
      return escapeHtml(s.english_only_policy_label || (s.english_only_policy ? '✓ English Only' : '無強制'));
    } },
    { label: '認證', fn: (item) => {
      const a = item.school.accreditation || [];
      return a.length > 0 ? a.map((x: string) => `<span class="mini-tag">${escapeHtml(x)}</span>`).join(' ') : '—';
    } },
    { label: '國籍多樣性', fn: (item) => item.school.nationality_count ? `${item.school.nationality_count}+ 國` : '—' },
    { label: '課程數量', fn: (item) => `${(item.programs || []).length} 種` },
    { label: '住宿選項', fn: (item) => {
      const types = [...new Set((item.housing || []).map((h: any) => h.type))];
      return types.length > 0 ? escapeHtml(types.join('、')) : '—';
    } },
    { label: '簽證選項', fn: (item) => {
      const visas = (item.cityInfo || []).flatMap((ci: any) => ci.visa_options || []);
      const uniq = [...new Set(visas)];
      return uniq.length > 0 ? escapeHtml(uniq.join('、')) : '—';
    } },
  ];

  const headers = schools.map((item: any) =>
    `<th>${escapeHtml(item.school.name)}</th>`).join('');

  const rows = rowDefs.map(r =>
    `<tr><td class="col-label">${escapeHtml(r.label)}</td>${
      schools.map((item: any) => `<td>${r.fn(item)}</td>`).join('')
    }</tr>`
  ).join('');

  return `
    <div class="wrap-wide">
      <div class="sec-h">
        <div class="sec-eyebrow">數字並排,一目瞭然</div>
        <div class="sec-title">把每一格對齊著看</div>
        <div class="sec-sub">同一個條件,所有學校並排呈現,理性決策最快的方式。</div>
      </div>
      <div class="tbl-wrap">
        <div class="tbl-scroll">
          <table class="cmp-tbl">
            <thead><tr><th class="col-label">項目</th>${headers}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ════════════════════════════════════════════════════════════════════
//  Phase 2 Batch 2 ① 氛圍/情感段 sec04 helper
// ════════════════════════════════════════════════════════════════════

// country → flag(支援已有的 8 國 + 其他預設 🌍)
const countryFlag: Record<string, string> = {
  'Canada': '🇨🇦', 'UK': '🇬🇧', 'USA': '🇺🇸', 'Australia': '🇦🇺',
  'New Zealand': '🇳🇿', 'Ireland': '🇮🇪', 'Philippines': '🇵🇭', 'Malta': '🇲🇹',
};

// country → vibe-card 漸層([from, to, glow])
//   LP source 用 per-campus hardcode demo 色票,EF per-school 改用 country-level 預設色
const countryGradient: Record<string, [string, string, string]> = {
  'Canada':      ['#1a2b4a', '#0d1d35', 'rgba(239,68,68,0.18)'],
  'UK':          ['#2a1f3d', '#1a1326', 'rgba(168,85,247,0.18)'],
  'USA':         ['#1f2a3d', '#0d1525', 'rgba(59,130,246,0.18)'],
  'Australia':   ['#3d1f0d', '#2a1306', 'rgba(251,191,36,0.18)'],
  'New Zealand': ['#0d3d2e', '#082a20', 'rgba(34,197,94,0.18)'],
  'Ireland':     ['#0d2e1f', '#082015', 'rgba(34,197,94,0.18)'],
  'Philippines': ['#0d2e3d', '#082030', 'rgba(34,197,94,0.18)'],
  'Malta':       ['#3d2d1f', '#2a1d10', 'rgba(251,191,36,0.18)'],
};
const defaultGradient: [string, string, string] = ['#1a1a2e', '#16213e', 'rgba(100,120,200,0.18)'];

// renderSec04 氛圍/情感段 — port from LP line 3785-3818
// per-school 映射:LP per-campus vibe-card → per-school vibe-card
//   無料(全 mood_* 為 NULL 且 pills 為空)→ return '' 整段隱藏
//   無 country mapping → 用 defaultGradient + 🌍 flag
function renderSec04(schools: any[]): string {
  const withMood = schools.filter((it: any) => {
    const s = it.school || {};
    return s.mood_tag || s.mood_desc || s.mood_scene || (Array.isArray(s.pills) && s.pills.length > 0);
  });
  if (withMood.length === 0) return '';

  const n = withMood.length;
  const gridCls = n === 1 ? 'vibe-grid-1'
    : n === 2 ? 'vibe-grid-2'
    : n === 3 ? 'vibe-grid-3'
    : n === 4 ? 'vibe-grid-4'
    : 'vibe-grid-5';

  const cards = withMood.map((item: any, idx: number) => {
    const s = item.school || {};
    const isHero = (n === 1) || (n >= 3 && idx === 0);
    const [from, to, glow] = countryGradient[s.country] || defaultGradient;
    const flag = countryFlag[s.country] || '🌍';
    const cities = [...new Set((item.campuses || []).map((c: any) => c.city).filter(Boolean))].slice(0, 2).join('・');
    const region = `${escapeHtml(s.country || '')}${cities ? '・' + escapeHtml(cities) : ''}`;
    const moodTag = s.mood_tag || '';
    const moodDesc = s.mood_desc || '';
    const moodScene = s.mood_scene || '';
    const pills: string[] = Array.isArray(s.pills) ? s.pills : [];

    return `
      <div class="vibe-card${isHero ? ' vibe-card-hero' : ''}" style="background:linear-gradient(135deg,${from} 0%,${to} 100%);--vibe-glow:radial-gradient(ellipse 400px 200px at 80% 20%,${glow},transparent 60%);">
        <div class="vibe-region">${flag} ${region}</div>
        ${moodTag ? `<div class="vibe-mood">${escapeHtml(moodTag)}</div>` : ''}
        ${moodDesc ? `<div style="font-size:14px;color:rgba(255,255,255,0.82);line-height:1.6;margin-top:4px;">${escapeHtml(moodDesc)}</div>` : ''}
        ${moodScene ? `<div class="vibe-scene">「${escapeHtml(moodScene)}」</div>` : ''}
        ${pills.length ? `<div class="vibe-pills">${pills.map((p: string) => `<span class="vibe-pill">${escapeHtml(p)}</span>`).join('')}</div>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="wrap">
      <div class="sec-h">
        <div class="sec-eyebrow">選一座城市,選一種生活</div>
        <div class="sec-title">這座城市的「感覺」是什麼?</div>
        <div class="sec-sub">不只看規格,也看你會走進什麼樣的日常。</div>
      </div>
      <div class="vibe-grid ${gridCls}">${cards}</div>
    </div>
  `;
}

// ════════════════════════════════════════════════════════════════════
//  Phase 2 Batch 2 ② 在當地的一天 sec08 helper
// ════════════════════════════════════════════════════════════════════

// renderSec08 在當地的一天 — port from LP line 4902-4959(renderSec08 + renderDayTimeline)
// per-school 映射:LP tab(per-campus 切換 Sec08State.activeKey)→ EF 多校 stack(對齊 voices 段)
//   一校多 campus 有 day_schedule → 各 campus 一塊 sub-timeline
//   無料整段隱藏(return '')
//   day_schedule 從 EF 內 query(client 不抓新表)
function renderSec08(schools: any[], daySchedule: any[]): string {
  if (schools.length === 0 || daySchedule.length === 0) return '';

  const blocks = schools.map((item: any) => {
    const s = item.school || {};
    const schoolDays = daySchedule.filter((d: any) => d.school_id === s.id);
    if (schoolDays.length === 0) return '';

    // group by campus(支援未來多校區情境)
    const byCampus: Record<string, any[]> = {};
    for (const d of schoolDays) {
      const k = d.campus || '(預設校區)';
      if (!byCampus[k]) byCampus[k] = [];
      byCampus[k].push(d);
    }

    const campusBlocks = Object.entries(byCampus).map(([campus, days]) => {
      const sorted = [...days].sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
      const rows = sorted.map((d: any) => `
        <div class="day-row">
          <div class="day-time-col">${escapeHtml(d.time || '')}</div>
          <div class="day-content-col">
            <div class="day-title">${escapeHtml(d.title || '')}</div>
            ${d.description ? `<div class="day-desc">${escapeHtml(d.description)}</div>` : ''}
          </div>
        </div>
      `).join('');
      const campusHead = Object.keys(byCampus).length > 1
        ? `<div style="font-size:14px;color:var(--ink3);font-weight:500;margin:18px 0 6px;letter-spacing:0.04em">${escapeHtml(campus)} 校區</div>`
        : '';
      return `${campusHead}<div class="day-timeline-full">${rows}</div>`;
    }).join('');

    return `
      <div style="margin-bottom:36px">
        <div style="font-family:var(--display);font-weight:600;font-size:20px;color:var(--ink);margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid var(--line)">${escapeHtml(s.name)}</div>
        ${campusBlocks}
      </div>
    `;
  }).filter(Boolean).join('');

  if (!blocks) return '';

  return `
    <div class="wrap">
      <div class="sec-h">
        <div class="sec-eyebrow">你在那裡的一天</div>
        <div class="sec-title">閉眼想像,這就是你的日常</div>
        <div class="sec-sub">從早晨醒來到晚上睡前,這是你在那裡每一天會發生的事。</div>
      </div>
      ${blocks}
    </div>
  `;
}

// renderSec07 學費試算 — port from LP line 4659-4901
// per-school 映射 + Batch 1 簡化:
//   LP 有 dropdown(course / accomm)+ weeks select + Sec07State client-side
//   Batch 1 EF 簡化:固定 12 週 + 取 avgTuition + minHousing(無 dropdown)
//   Client-side LPCalcState shell 在 page_template 內,Batch 2/3 補 dropdown 互動
function renderSec07(schools: any[]): string {
  if (schools.length === 0) return '';
  const weeks = 12;

  const cards = schools.map((item: any) => {
    const s = item.school;
    const t = avgTuition(item);
    const h = minHousing(item);
    const cur = t?.currency || h?.currency || 'CAD';
    const cpw = t?.value || 0;
    const apw = h?.value || 0;
    const cTot = cpw * weeks;
    const aTot = apw * weeks;
    const tot = cTot + aTot;
    const rate = FX_RATES[cur] || 30;
    const twd = Math.round(tot * rate);
    return `
      <div class="calc-card">
        <div class="calc-head">
          <div class="calc-city">${escapeHtml(s.name)}</div>
          <div class="calc-flag">${escapeHtml(s.country || '')}</div>
        </div>
        <div class="calc-breakdown">
          <div class="calc-line"><span class="calc-line-l">課程費(平均/週)</span><span class="calc-line-v">${cur} ${cpw.toLocaleString()} × ${weeks} = ${cur} ${cTot.toLocaleString()}</span></div>
          <div class="calc-line"><span class="calc-line-l">住宿費(最低/週)</span><span class="calc-line-v">${cur} ${apw.toLocaleString()} × ${weeks} = ${cur} ${aTot.toLocaleString()}</span></div>
          <div class="calc-divider"></div>
          <div class="calc-total">
            <span class="l">小計(${weeks} 週)</span>
            <span class="v">${cur} ${tot.toLocaleString()}</span>
          </div>
          <div class="calc-twd">≈ 台幣 ${twd.toLocaleString()}</div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="wrap">
      <div class="sec-h">
        <div class="sec-eyebrow">現在,我們來算</div>
        <div class="sec-title">把費用說清楚,而不是猜一個數字</div>
        <div class="sec-sub">
          以 12 週為基準試算課程費(平均) + 住宿費(最低),含台幣換算。
          <span style="color:var(--ink3);font-weight:500;">⚠ 試算為估算值,不含機票 / 報名費 / 保險費 / 教材費 等一次性費用,完整費用以放洋報價單為準。匯率僅供參考,跨幣別未統一換算。</span>
        </div>
      </div>
      <div class="calc-cols">${cards}</div>
      <div class="calc-rate-note">匯率參考:£1≈NT$40 · €1≈NT$35 · USD$1≈NT$32 · CA$1≈NT$23 · AU$1≈NT$21</div>
    </div>
  `;
}

// renderSec09 適合誰 — port from LP line 4960-5012
// per-school 映射:LP c.personasDetail(per-campus,role/why/tags 結構)
//   schema 沒對應,用 suitable_for[] + persona_match[] 簡化
function renderSec09(schools: any[]): string {
  if (schools.length === 0) return '';
  const rows = schools.map((item: any, idx: number) => {
    const s = item.school;
    const reverse = idx % 2 === 1;
    const cities = [...new Set((item.campuses || []).map((c: any) => c.city))].join('、');
    const borderStyle = reverse
      ? `border-right:3px solid var(--rose);padding-right:18px`
      : `border-left:3px solid var(--rose);padding-left:18px`;
    const head = `
      <div class="persona-col-head-side" style="${borderStyle}">
        <div>${escapeHtml(s.name)}</div>
        <div class="persona-col-region">${escapeHtml(cities || s.country || '')}</div>
      </div>`;

    const suitableTags = (s.suitable_for || []);
    const personaTags = (s.persona_match || []).slice(0, 4);

    const cards = suitableTags.length === 0
      ? `<div class="persona-cards-side"><p style="color:var(--ink4);font-size:13px;padding:16px 0">⚠ 請洽顧問取得適合學生類型(schema 待補 suitable_for)</p></div>`
      : `<div class="persona-cards-side">
          ${suitableTags.map((tag: string) => `
            <div class="persona-card">
              <div class="persona-role">${escapeHtml(tag)}</div>
              <div class="persona-why">這間學校適合「${escapeHtml(tag)}」屬性的學員</div>
              ${personaTags.length > 0 ? `
                <div class="persona-tags-row">
                  ${personaTags.map((p: string) =>
                    `<span class="persona-mini">${escapeHtml(personaLabels[p] || p)}</span>`).join('')}
                </div>` : ''}
            </div>
          `).join('')}
        </div>`;
    return `<div class="persona-section-row${reverse ? ' is-reverse' : ''}">${head}${cards}</div>`;
  }).join('');

  return `
    <div class="wrap">
      <div class="sec-h">
        <div class="sec-eyebrow">哪一種你,去哪一間</div>
        <div class="sec-title">在這些選項裡,找到你自己</div>
        <div class="sec-sub">如果其中一個聽起來像你,那這間學校可能就是答案。</div>
      </div>
      <div>${rows}</div>
    </div>
  `;
}

// renderSec_voices 學員見證 + 國籍 — port from LP line 4417-4491
// per-school 映射:LP c.testimonials(per-campus,LP source 是 hardcode)+ c.nationalities
//   testimonials → S3.3 改從 voices 表(新表)抓真實 quote/name/detail
//     有 voices → 渲染 N 個 testimonial-card(non-placeholder)
//     沒 voices → 維持 placeholder「請洽顧問取得 X 學員見證」
//   nationalities → nationality_breakdown(Phase 18a 已 migrate,本段不動)
// Batch 1 簡化:tab 機制移除(switchTab JS 沒包進 page_template),改 stack 多校
function renderSec_voices(schools: any[], voices: any[]): string {
  if (schools.length === 0) return '';

  const blocks = schools.map((item: any) => {
    const s = item.school;
    const breakdown = Array.isArray(s.nationality_breakdown) ? s.nationality_breakdown : [];
    const sortedNats = [...breakdown].sort((a: any, b: any) => (b?.pct || 0) - (a?.pct || 0));

    const natRows = sortedNats.map((n: any) => {
      const flag = n?.flag ? escapeHtml(n.flag) : '';
      const name = escapeHtml(n?.name || '—');
      const pct = (n?.pct != null && Number.isFinite(n.pct)) ? Number(n.pct) : null;
      const pctText = pct != null ? `${pct}%` : '';
      const barWidth = pct != null ? Math.min(100, Math.max(0, pct)) : 0;
      return `
        <div class="nat-row">
          <div>
            <div class="nat-label"><span class="nat-flag">${flag}</span>${name}</div>
            ${pct != null ? `<div class="nat-bar"><div class="nat-bar-fill" style="width:${barWidth}%"></div></div>` : ''}
          </div>
          <div class="nat-pct">${pctText}</div>
        </div>`;
    }).join('');

    const natContent = breakdown.length === 0
      ? `<p style="font-size:13px;color:var(--ink4);margin:0">⚠ 請洽顧問取得當期國籍分布數據</p>`
      : `<div class="nat-bars">${natRows}</div>
         <div class="nat-note">★ 本比例為示意參考值,<b>非官方公布數據</b>。實際國籍組成依當期入學學員不同,請以該校公布為準。</div>`;

    // S3.3:voices 表抓該校學員見證(sort_order 排序)
    const schoolVoices = voices
      .filter((v: any) => v.school_id === s.id)
      .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));

    const tmCards = schoolVoices.length > 0
      ? schoolVoices.map((v: any) => `
          <div class="testimonial-card">
            <div class="tm-quote">「${escapeHtml(v.quote || '')}」</div>
            <div class="tm-meta">
              <div class="tm-avatar">👤</div>
              <div class="tm-meta-text">
                <div class="tm-name">${escapeHtml(v.student_name || '—')}</div>
                ${v.student_detail ? `<div class="tm-detail">${escapeHtml(v.student_detail)}</div>` : ''}
              </div>
            </div>
          </div>
        `).join('')
      : `<div class="testimonial-card is-placeholder">
          <div class="tm-quote">「請洽顧問取得 ${escapeHtml(s.name)} 學員見證」</div>
          <div class="tm-meta">
            <div class="tm-avatar">⚠</div>
            <div class="tm-meta-text">
              <div class="tm-name">待補</div>
              <div class="tm-detail">該校尚未提供學員見證</div>
            </div>
          </div>
        </div>`;

    return `
      <div style="margin-bottom:36px">
        <div style="font-family:var(--display);font-weight:600;font-size:20px;color:var(--ink);margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid var(--line)">${escapeHtml(s.name)}</div>
        <div class="voices-grid">
          <div class="testimonials-col">
            ${tmCards}
          </div>
          <div class="nationalities-col">
            <div class="nat-col-title">這間學校的同學來自哪裡</div>
            <div class="nat-col-sub">${escapeHtml(s.name)}・參考分布</div>
            ${natContent}
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="wrap">
      <div class="sec-h">
        <div class="sec-eyebrow">跟你一樣的人都來這裡</div>
        <div class="sec-title">真實學員怎麼說,班上都是誰</div>
        <div class="sec-sub">過來人的話 + 班級國籍組成,幫你回答「我會不會班上都是台灣人」這個問題。</div>
      </div>
      ${blocks}
    </div>
  `;
}

// ════════════════════════════════════════════════════════════════════
//  serve(主入口)
// ════════════════════════════════════════════════════════════════════

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { schoolsInfo, selectedFields, title, slug, studentProfile } = body;

    // Phase 1.1 C2: 雙名接受(零停機:CreatePage 還在送 style)
    //   B1-4 cleanup 會把 ?? body.style 拿掉,當 CreatePage 改名 cardVariant 後
    const raw = body.cardVariant ?? body.style ?? 'A';
    const overviewStyle: 'A' | 'B' | 'C' | 'D' = (raw === 'B' || raw === 'C' || raw === 'D') ? raw : 'A';

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const workerUrl = Deno.env.get("WORKER_URL");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── Phase 2 Batch 1 B1-0/B1-2: 讀 template_version 條件選 template ──
    // R-B 防護:舊 25 row template_version='legacy' → 走舊 comparison(現有邏輯不變)
    //          CreatePage 改寫(B1-3)後新建 LP 才會寫 'scroll_v1' → 走新 comparison_scroll
    const { data: pageRow, error: pageErr } = await supabase
      .from("generated_pages")
      .select("template_version")
      .eq("slug", slug)
      .maybeSingle();
    if (pageErr) {
      console.error("Failed to read template_version, fallback to legacy:", pageErr.message);
    }
    const templateVersion: 'legacy' | 'scroll_v1' = (pageRow?.template_version === 'scroll_v1') ? 'scroll_v1' : 'legacy';
    const templateId = templateVersion === 'scroll_v1' ? 'comparison_scroll' : 'comparison';

    console.log("Received schools:", schoolsInfo?.length, "slug:", slug,
      "cardVariant:", overviewStyle, "templateVersion:", templateVersion, "→ template:", templateId);

    // ── 讀模板 ──
    const { data: templateData, error: templateError } = await supabase
      .from("page_templates")
      .select("html_content")
      .eq("id", templateId)
      .single();
    if (templateError || !templateData) {
      throw new Error(`無法讀取模板 ${templateId}:` + (templateError?.message || 'no data'));
    }

    let html = templateData.html_content as string;
    const schools = schoolsInfo || [];

    // ── Phase 2 Batch 2: EF 端 query 新 4 表(client 不抓)──
    //   day_schedule(S3.2)/ voices(S3.3)/ photos(S3.4)/ faq(S3.5)
    //   S3.2 先 query day_schedule
    const schoolIds: string[] = (schools as any[]).map((it: any) => it.school?.id).filter(Boolean);
    let daySchedule: any[] = [];
    let voicesRows: any[] = [];
    if (templateVersion === 'scroll_v1' && schoolIds.length > 0) {
      const { data: dsData, error: dsErr } = await supabase
        .from('day_schedule')
        .select('*')
        .in('school_id', schoolIds);
      if (dsErr) console.error('day_schedule fetch error:', dsErr.message);
      daySchedule = dsData || [];

      const { data: vData, error: vErr } = await supabase
        .from('voices')
        .select('*')
        .in('school_id', schoolIds);
      if (vErr) console.error('voices fetch error:', vErr.message);
      voicesRows = vData || [];
    }
    console.log('day_schedule rows:', daySchedule.length, 'voices rows:', voicesRows.length);

    // ════════════════════════════════════════════════════════
    //  分流:scroll_v1 走新 6 個 renderSec / legacy 走舊邏輯
    // ════════════════════════════════════════════════════════

    if (templateVersion === 'scroll_v1') {
      // ── Batch 1:填 6 個 section + Hero/profile ──
      const profileSummary = buildProfileSummary(studentProfile);
      html = html
        .replaceAll("{{PAGE_TITLE}}", escapeHtml(title || ''))
        .replace("{{PROFILE_SUMMARY}}", profileSummary)
        .replace("{{SEC01_HTML}}", renderSec01(schools))
        .replace("{{SEC02_HTML}}", renderSec02(schools, overviewStyle))
        .replace("{{SEC03_HTML}}", renderSec03(schools))
        .replace("{{SEC04_HTML}}", renderSec04(schools))
        .replace("{{SEC08_HTML}}", renderSec08(schools, daySchedule))
        .replace("{{SEC07_HTML}}", renderSec07(schools))
        .replace("{{SEC09_HTML}}", renderSec09(schools))
        .replace("{{SEC_VOICES_HTML}}", renderSec_voices(schools, voicesRows));
    } else {
      // ── legacy:既有 tabs template,所有 placeholder 邏輯保留不動 ──
      const schoolCount = schools.length;

      // Hero chips
      const heroChips = schools.map((item: any) =>
        `<span class="hero-school-chip">${escapeHtml(item.school.name)}</span>`
      ).join("\n      ");

      // 比較表 headers + rows(legacy tabs version)
      const tableHeaders = schools.map((item: any) =>
        `<th>${escapeHtml(item.school.name)}</th>`).join("\n              ");

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
        const cells = schools.map((item: any) => `<td>${row.fn(item)}</td>`).join("\n              ");
        return `<tr>\n              <td>${row.label}</td>\n              ${cells}\n            </tr>`;
      }).join("\n            ");

      // Overview cards dispatch(C2 已支援 ABCD)
      const totalsForBar = schools.map((it: any) => {
        const t = avgTuition(it)?.value || 0;
        const h = minHousing(it)?.value || 0;
        return t + h;
      });
      const maxTotal = Math.max(1, ...totalsForBar);
      const overviewCards = schools.map((item: any, idx: number) => {
        if (overviewStyle === 'B') return renderB(item, idx, totalsForBar, maxTotal);
        if (overviewStyle === 'C') return renderC(item);
        if (overviewStyle === 'D') return renderD(item);
        return renderA(item);
      }).join("\n");

      // Program cards / Housing cards / City cards / Detail cards / 計算器 / 額外 cards(既有邏輯保留)
      const programCards = schools.map((item: any) => {
        const programs = (item.programs || []);
        const programRows = programs.map((p: any) => {
          const tiers = (item.tiers || []).filter((t: any) => t.program_id === p.id);
          const priceRange = tiers.length > 0
            ? `CAD$${Math.min(...tiers.map((t: any) => Number(t.price_per_week)))}/週起` : "詳洽";
          const intensityWidth = Math.min(100, (p.hours_per_week || 20) / 30 * 100).toFixed(0);
          const weeksInfo = p.min_weeks ? ` · ${p.min_weeks}週起` : "";
          const levelLine = (p.entry_level || p.outcome_level)
            ? `<div style="font-size:11px;color:var(--ink3);margin-top:6px">${p.entry_level ? `入:${p.entry_level}` : ""}${p.entry_level && p.outcome_level ? " → " : ""}${p.outcome_level ? `出:${p.outcome_level}` : ""}</div>` : "";
          return `
            <div class="card-row"><span class="card-label">${escapeHtml(p.name)}</span><span class="card-value">${priceRange}</span></div>
            <div class="intensity-section">
              <div class="intensity-label"><span style="font-size:11px;color:#9ca3af">${p.hours_per_week || "—"}小時/週 · ${escapeHtml(p.schedule || '')}${weeksInfo}</span></div>
              <div class="intensity-track"><div class="intensity-fill" data-width="${intensityWidth}%"></div></div>
              ${levelLine}
            </div>`;
        }).join("");
        return `<div class="school-card"><div class="card-header"><h3>${escapeHtml(item.school.name)}</h3><p>課程方案</p></div><div class="card-body">${programRows || "<p style='font-size:13px;color:#9ca3af'>無資料</p>"}</div></div>`;
      }).join("\n");

      const housingCards = schools.map((item: any) => {
        const housingRows = (item.housing || []).map((h: any) => {
          const extras = [h.includes, h.commute_to_school].filter(Boolean).join(" · ");
          const extraLine = extras ? `<div style="font-size:11px;color:var(--ink3);margin-top:4px">${escapeHtml(extras)}</div>` : "";
          return `<div class="card-row" style="flex-direction:column;align-items:stretch"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px"><span class="card-label">${escapeHtml(h.type)}${h.subtype ? " · " + escapeHtml(h.subtype) : ""}</span><span class="card-value">${h.currency || "CAD"}$${h.price_per_week}/週</span></div>${extraLine}</div>`;
        }).join("");
        return `<div class="school-card"><div class="card-header"><h3>${escapeHtml(item.school.name)}</h3><p>住宿費用</p></div><div class="card-body">${housingRows || "<p style='font-size:13px;color:#9ca3af'>無資料</p>"}</div></div>`;
      }).join("\n");

      const allCityInfo = schools.flatMap((item: any) => item.cityInfo || []);
      const seenCities = new Set<string>();
      const cityCards = schools.flatMap((item: any) => (item.campuses || []).map((c: any) => c)).filter((c: any) => {
        if (seenCities.has(c.city)) return false;
        seenCities.add(c.city);
        return true;
      }).map((c: any) => {
        const ci = allCityInfo.find((x: any) => (x.city || "").trim().toLowerCase() === (c.city || "").trim().toLowerCase());
        return `<div class="city-card"><div class="city-name">${escapeHtml(c.city)}</div>${ci ? `<div class="city-tags">${ci.climate ? `<span class="city-tag">${escapeHtml(ci.climate)}</span>` : ""}${ci.population ? `<span class="city-tag">人口 ${escapeHtml(ci.population)}</span>` : ""}${ci.cost_of_living_monthly ? `<span class="city-tag">生活費 ${ci.cost_of_living_currency || 'CAD'}$${ci.cost_of_living_monthly}/月</span>` : ""}</div><p style="font-size:13px;color:#6b7280">${(ci.highlights || []).join("・") || ""}</p>` : "<p style='font-size:13px;color:#9ca3af'>城市資訊待補充</p>"}${c.metro_station ? `<p style="font-size:12px;color:#6b7280;margin-top:8px">📍 ${escapeHtml(c.metro_station)}（步行 ${c.walk_minutes} 分鐘）</p>` : ""}</div>`;
      }).join("\n");

      const detailCards = schools.map((item: any) => {
        const s = item.school;
        const campusHighlights = (item.campuses || []).map((c: any) =>
          c.highlight ? `<div class="card-row"><span class="card-label">${escapeHtml(c.city)}</span><span class="card-value" style="font-size:12px">${escapeHtml(c.highlight)}</span></div>` : ""
        ).join("");
        return `<div class="school-card"><div class="card-header"><h3>${escapeHtml(s.name)}</h3><p>${escapeHtml(s.full_name || '')}</p></div><div class="card-body">${campusHighlights}${s.notes ? `<div style="font-size:13px;color:#6b7280;margin-top:8px;line-height:1.6">${escapeHtml(s.notes)}</div>` : ""}${item.note ? `<div class="advisor-note"><div class="advisor-note-label">顧問備注</div><div class="advisor-note-text">${escapeHtml(item.note)}</div></div>` : ""}</div></div>`;
      }).join("\n");

      const tuitionJson = JSON.stringify(schools.map((item: any) => {
        const allTiers = (item.tiers || []);
        const avgPrice = allTiers.length > 0 ? allTiers.reduce((sum: number, t: any) => sum + Number(t.price_per_week), 0) / allTiers.length : 0;
        const housingMin = (item.housing || []).length > 0 ? Math.min(...(item.housing || []).map((h: any) => Number(h.price_per_week))) : 0;
        return { name: item.school.name, price_per_week: Math.round(avgPrice), housing_min: housingMin };
      }));
      const housingJson = JSON.stringify(schools.map((item: any) => ({
        name: item.school.name,
        options: (item.housing || []).map((h: any) => ({ type: h.type, price: h.price_per_week })),
      })));
      const calcPlaceholders = schools.map((item: any) =>
        `<div class="calc-result-card"><div class="calc-school-name">${escapeHtml(item.school.name)}</div><div class="calc-amount">計算中...</div></div>`
      ).join("\n");

      const uniqueSchoolNames = new Set(schools.map((item: any) => item.school.name));
      const totalCampuses = schools.reduce((sum: number, item: any) => sum + (item.campuses?.length || 0), 0);
      const compareSummary = `${uniqueSchoolNames.size} 間學校・${totalCampuses} 個校區`;

      const tldrCards = schools.map((item: any) => {
        const s = item.school;
        const cityLabel = (item.campuses || []).map((c: any) => c.city).join("、");
        const oneLiner = s.one_liner ? escapeHtml(s.one_liner) : `<span style="color:var(--ink3)">請洽顧問取得這間學校的定位描述</span>`;
        return `<div class="school-card"><div class="card-header"><h3>${escapeHtml(s.name)}${cityLabel ? " · " + escapeHtml(cityLabel) : ""}</h3><p>${escapeHtml(s.country || '')}</p></div><div class="card-body" style="font-size:14px;line-height:1.75">${oneLiner}</div></div>`;
      }).join("\n");

      const tagCount = new Map<string, number>();
      schools.forEach((item: any) => { (item.school.suitable_for || []).forEach((t: string) => tagCount.set(t, (tagCount.get(t) || 0) + 1)); });
      const suitableForChips = schools.map((item: any) => {
        const s = item.school;
        const tags = (s.suitable_for || []);
        const chipsHtml = tags.length > 0
          ? tags.map((t: string) => {
              const shared = (tagCount.get(t) || 0) > 1 && schools.length > 1;
              const style = shared ? "background:var(--rose);color:white;font-weight:600" : "";
              return `<span class="city-tag" style="${style}">${escapeHtml(t)}</span>`;
            }).join("")
          : `<span style="color:var(--ink3);font-size:13px">請洽顧問</span>`;
        return `<div class="school-card"><div class="card-header"><h3>${escapeHtml(s.name)}</h3><p>適合的學生類型</p></div><div class="card-body" style="display:flex;flex-wrap:wrap;gap:6px">${chipsHtml}</div></div>`;
      }).join("\n");

      const qualityCards = schools.map((item: any) => {
        const s = item.school;
        const classSize = classSizeText(s);
        const englishPolicy = s.english_only_policy_label || (s.english_only_policy ? "✓ English Only" : "無強制");
        const accred = (s.accreditation || []).length > 0
          ? (s.accreditation || []).map((a: string) => `<span class="city-tag">${escapeHtml(a)}</span>`).join("")
          : `<span style="color:var(--ink3);font-size:13px">—</span>`;
        const yearsOld = s.founded ? `${new Date().getFullYear() - s.founded} 年` : "—";
        return `<div class="school-card"><div class="card-header"><h3>${escapeHtml(s.name)}</h3><p>教學品質</p></div><div class="card-body"><div class="card-row"><span class="card-label">班級人數</span><span class="card-value">${classSize}</span></div><div class="card-row"><span class="card-label">English Only</span><span class="card-value">${escapeHtml(englishPolicy)}</span></div><div class="card-row" style="flex-direction:column;align-items:stretch"><span class="card-label" style="margin-bottom:6px">認證</span><div style="display:flex;flex-wrap:wrap;gap:4px">${accred}</div></div><div class="card-row"><span class="card-label">創立至今</span><span class="card-value">${yearsOld}</span></div></div></div>`;
      }).join("\n");

      const nationalityCards = schools.map((item: any) => {
        const s = item.school;
        const breakdown = Array.isArray(s.nationality_breakdown) ? s.nationality_breakdown : [];
        const totalText = s.nationality_count ? `學員來自 ${s.nationality_count}+ 國` : "";
        const list = breakdown.length > 0
          ? `<ul style="list-style:none;padding:0;margin:0;font-size:13px;line-height:1.5">${breakdown.map((n: any) => {
              const flag = n && n.flag ? n.flag + " " : "";
              const name = (n && n.name) || "—";
              const pct = (n && typeof n.pct === "number" && Number.isFinite(n.pct)) ? n.pct : null;
              const pctText = pct !== null ? `${pct}%` : "";
              const barWidth = pct !== null ? Math.min(100, Math.max(0, pct)) : 0;
              const bar = pct !== null ? `<div style="height:4px;background:#F0E9DD;border-radius:2px;overflow:hidden;margin-top:3px"><div style="width:${barWidth}%;height:100%;background:var(--rose)"></div></div>` : "";
              return `<li style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><span>${escapeHtml(flag + name)}</span><span style="font-variant-numeric:tabular-nums;color:var(--ink3);font-size:12px">${pctText}</span></div>${bar}</li>`;
            }).join("")}</ul>`
          : `<p style="font-size:13px;color:var(--ink3);margin:0">請洽顧問取得當期數據</p>`;
        const footer = breakdown.length > 0 ? `<p style="font-size:11px;color:var(--ink3);margin-top:10px">百分比為顧問估算,實際依當期而定</p>` : "";
        return `<div class="school-card"><div class="card-header"><h3>${escapeHtml(s.name)}</h3><p>${totalText}</p></div><div class="card-body">${list}${footer}</div></div>`;
      }).join("\n");

      // 替換所有 legacy placeholder
      html = html
        .replaceAll("{{PAGE_TITLE}}", escapeHtml(title || ''))
        .replace("{{COMPARE_SUMMARY}}", compareSummary)
        .replace("{{PROFILE_SUMMARY}}", buildProfileSummary(studentProfile))
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
    }

    // ── 存入資料庫 ──
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
      throw new Error(`找不到要更新的頁面記錄（slug=${slug}）,請確認前台是否已建立 row`);
    }

    console.log("Done. templateVersion:", templateVersion, "URL:", publicUrl);
    return new Response(
      JSON.stringify({ success: true, url: publicUrl, templateVersion }),
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
