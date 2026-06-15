#!/usr/bin/env node
/**
 * Phase 14c — 語校資料匯入腳本
 *
 * 用法:
 *   node scripts/import-data.js                          # dry-run (預設,不寫 DB)
 *   node scripts/import-data.js --commit                 # 真實匯入
 *   node scripts/import-data.js --data-dir my-data       # 換資料夾(預設 scripts/sample-data)
 *   node scripts/import-data.js --keep-samples           # 不跳過範例列
 *   node scripts/import-data.js --verbose                # 印 stack trace
 *
 * 6 張 CSV → 依 FK 安全順序匯入 Supabase:
 *   schools → city_info → campuses → programs → tuition_tiers → housing
 *
 * FK 以名稱解析(不用 UUID):
 *   - campuses / programs / housing  : school_name → schools.id
 *   - tuition_tiers                  : (school_name, program_name) → program_id
 *                                     (school_name, city) → campus_id (可選)
 *
 * 國籍欄位雙寫:nationality_breakdown(含 pct,必填) + top_nationalities(從前者衍生)。
 * Phase 18b 切斷 top_nationalities,在那之前都要雙寫,否則 EF Section 10 國籍卡空白。
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
}
const flags = {
  dryRun: !args.includes('--commit'),
  dataDir: getArg('--data-dir') ?? 'scripts/sample-data',
  keepSamples: args.includes('--keep-samples'),
  verbose: args.includes('--verbose') || args.includes('-v'),
};

// ─── constants ────────────────────────────────────────────────────────────────
const VALID_CURRENCIES = ['CAD', 'USD', 'GBP', 'AUD', 'EUR', 'NZD', 'JPY', 'TWD', 'IEP', 'MTL'];
const PERSONA_VALID = ['exam_prep', 'pathway_uni', 'pathway_grad', 'working_holiday', 'career_change', 'gap_year'];

// 跳過範例列:任一儲存格以 marker 開頭就跳過;主鍵在硬編黑名單就跳過
const SAMPLE_MARKERS = ['__SAMPLE__', '__EXAMPLE__', '#', '//'];
const TEMPLATE_EXAMPLE_NAMES = new Set(['ILAC', 'Kaplan', 'EC']);

// ─── env 載入 ────────────────────────────────────────────────────────────────
function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  }
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;
if (!flags.dryRun) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error(
      '❌ --commit 模式需要 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 在環境變數(或 .env / .env.local)。'
    );
    console.error('   ANON key 通常會被 RLS 擋住寫入,實際匯入建議用 service_role key。');
    process.exit(1);
  }
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── CSV 讀檔 ────────────────────────────────────────────────────────────────
function readCsv(name) {
  const path = join(flags.dataDir, `${name}.csv`);
  if (!existsSync(path)) throw new Error(`CSV 找不到: ${path}`);
  const content = readFileSync(path, 'utf8');
  return parse(content, {
    columns: (header) => header.map((h) => h.trim()),
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
}

// ─── 範例列偵測 ──────────────────────────────────────────────────────────────
function isSampleRow(r, primaryKey) {
  if (flags.keepSamples) return false;
  for (const v of Object.values(r)) {
    if (typeof v !== 'string') continue;
    for (const m of SAMPLE_MARKERS) if (v.startsWith(m)) return true;
  }
  if (primaryKey && TEMPLATE_EXAMPLE_NAMES.has(r[primaryKey])) return true;
  return false;
}

// ─── 型別轉換 helpers ────────────────────────────────────────────────────────
function csvArr(s) {
  if (s === undefined || s === null || s === '') return null;
  return String(s)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}
function csvBool(s) {
  if (s === undefined || s === null || s === '') return null;
  const v = String(s).trim().toUpperCase();
  if (['TRUE', 'T', 'YES', 'Y', '1'].includes(v)) return true;
  if (['FALSE', 'F', 'NO', 'N', '0'].includes(v)) return false;
  return null;
}
function csvInt(s) {
  if (s === undefined || s === null || s === '') return null;
  const n = parseInt(String(s).trim(), 10);
  return Number.isFinite(n) ? n : null;
}
function csvNum(s) {
  if (s === undefined || s === null || s === '') return null;
  const n = parseFloat(String(s).trim());
  return Number.isFinite(n) ? n : null;
}
function csvJsonArr(s) {
  if (s === undefined || s === null || s === '') return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    throw new Error(`JSONB 陣列格式錯誤: ${String(s).slice(0, 80)}`);
  }
}

// 從 nationality_breakdown(含 pct)衍生 top_nationalities(只 flag + name)
function deriveTopNats(breakdown) {
  return Array.isArray(breakdown) ? breakdown.map(({ flag, name }) => ({ flag, name })) : [];
}

function normalizeCurrency(code, ctx) {
  if (!code) return null;
  const c = String(code).trim().toUpperCase();
  if (!VALID_CURRENCIES.includes(c)) {
    throw new Error(`${ctx}: 幣別 "${code}" 不是 ISO code(允許: ${VALID_CURRENCIES.join('/')})`);
  }
  return c;
}

// ─── error/warning 收集器 ────────────────────────────────────────────────────
const errors = [];
const warnings = [];
const err = (table, row, msg) => errors.push({ table, row, msg });
const warn = (table, row, msg) => warnings.push({ table, row, msg });

// ─── per-table 解析 ──────────────────────────────────────────────────────────
function parseSchools(rows) {
  const out = [];
  rows.forEach((r, i) => {
    const row = i + 2; // header=row 1
    if (isSampleRow(r, 'name')) return;
    if (!r.name) return err('schools', row, 'name 必填');

    let breakdown = [];
    try {
      breakdown = csvJsonArr(r.nationality_breakdown);
    } catch (e) {
      return err('schools', row, e.message);
    }
    for (const b of breakdown) {
      if (typeof b !== 'object' || b === null) {
        return err('schools', row, `nationality_breakdown 條目非物件: ${JSON.stringify(b)}`);
      }
      if (typeof b.pct !== 'number' || !Number.isFinite(b.pct)) {
        return err('schools', row, `nationality_breakdown.pct 必填且須為數字: ${JSON.stringify(b)}`);
      }
      if (!b.name || !b.flag) {
        warn('schools', row, `nationality_breakdown 條目缺 flag/name: ${JSON.stringify(b)}`);
      }
    }

    const persona = csvArr(r.persona_match) ?? [];
    for (const p of persona) {
      if (!PERSONA_VALID.includes(p)) {
        warn('schools', row, `persona_match "${p}" 不在 master list (${PERSONA_VALID.join('/')})`);
      }
    }

    out.push({
      name: r.name,
      full_name: r.full_name || r.name, // DB NOT NULL — fallback to name
      country: r.country || 'Canada',
      founded: csvInt(r.founded),
      english_only_policy: csvBool(r.english_only_policy),
      accreditation: csvArr(r.accreditation),
      nationality_count: csvInt(r.nationality_count),
      notes: r.notes || null,
      class_size_typical: csvInt(r.class_size_typical),
      class_size_max: csvInt(r.class_size_max),
      strengths: csvArr(r.strengths),
      suitable_for: csvArr(r.suitable_for),
      one_liner: r.one_liner || null,
      english_only_policy_label: r.english_only_policy_label || null,
      min_age: csvInt(r.min_age),
      top_nationalities: deriveTopNats(breakdown), // 雙寫:衍生
      nationality_breakdown: breakdown,
      persona_match: persona,
    });
  });
  return out;
}

function parseCityInfo(rows) {
  const out = [];
  rows.forEach((r, i) => {
    const row = i + 2;
    if (isSampleRow(r, 'city')) return;
    if (!r.city) return err('city_info', row, 'city 必填');
    if (!r.country) return err('city_info', row, 'country 必填');

    let currency = null;
    try {
      currency = normalizeCurrency(
        r.cost_of_living_currency,
        `city_info[${r.city}].cost_of_living_currency`
      );
    } catch (e) {
      return err('city_info', row, e.message);
    }

    out.push({
      city: r.city,
      country: r.country,
      climate: r.climate || null,
      population: r.population || null,
      cost_of_living_monthly: csvInt(r.cost_of_living_monthly),
      cost_of_living_currency: currency,
      highlights: csvArr(r.highlights),
      visa_options: csvArr(r.visa_options),
    });
  });
  return out;
}

function parseCampuses(rows, schoolMap) {
  const out = [];
  rows.forEach((r, i) => {
    const row = i + 2;
    if (isSampleRow(r, 'school_name')) return;
    if (!r.school_name) return err('campuses', row, 'school_name 必填');
    if (!r.city) return err('campuses', row, 'city 必填(DB NOT NULL)');

    const school_id = schoolMap.get(r.school_name);
    if (!school_id) {
      return err('campuses', row, `school_name "${r.school_name}" 找不到對應 schools 列`);
    }
    out.push({
      _csvKey: `${r.school_name}|${r.city}`,
      school_id,
      city: r.city,
      metro_station: r.metro_station || null,
      walk_minutes: csvInt(r.walk_minutes),
      highlight: r.highlight || null,
    });
  });
  return out;
}

function parsePrograms(rows, schoolMap) {
  const out = [];
  rows.forEach((r, i) => {
    const row = i + 2;
    if (isSampleRow(r, 'school_name')) return;
    if (!r.school_name) return err('programs', row, 'school_name 必填');
    if (!r.name) return err('programs', row, 'name 必填');

    const school_id = schoolMap.get(r.school_name);
    if (!school_id) {
      return err('programs', row, `school_name "${r.school_name}" 找不到對應 schools 列`);
    }
    if (csvInt(r.lessons_per_week) === null) {
      return err(
        'programs',
        row,
        'lessons_per_week 必填(DB NOT NULL,IMPORT_TEMPLATES.md 未列出但 DB 有)'
      );
    }
    out.push({
      _csvKey: `${r.school_name}|${r.name}`,
      school_id,
      name: r.name,
      lessons_per_week: csvInt(r.lessons_per_week),
      lesson_minutes: csvInt(r.lesson_minutes) ?? 50,
      hours_per_week: csvNum(r.hours_per_week),
      schedule: r.schedule || null,
      entry_level: r.entry_level || null,
      outcome_level: r.outcome_level || null,
      min_weeks: csvInt(r.min_weeks),
    });
  });
  return out;
}

function parseTuitionTiers(rows, programMap, campusMap) {
  const out = [];
  rows.forEach((r, i) => {
    const row = i + 2;
    if (isSampleRow(r, 'school_name')) return;
    if (!r.school_name) return err('tuition_tiers', row, 'school_name 必填');
    if (!r.program_name) return err('tuition_tiers', row, 'program_name 必填');

    const programKey = `${r.school_name}|${r.program_name}`;
    const program_id = programMap.get(programKey);
    if (!program_id) {
      return err(
        'tuition_tiers',
        row,
        `(${r.school_name}, ${r.program_name}) 找不到對應 programs 列`
      );
    }

    // campus_id 可選 — 有 city 才解
    let campus_id = null;
    if (r.city) {
      campus_id = campusMap.get(`${r.school_name}|${r.city}`) ?? null;
      if (!campus_id) {
        return err(
          'tuition_tiers',
          row,
          `(${r.school_name}, ${r.city}) 找不到對應 campuses 列 — 若不分校區計費請留空 city`
        );
      }
    }

    // 支援 weeks_min/weeks_max(DB 名)或 min_weeks/max_weeks(IMPORT_TEMPLATES 名)
    const weeks_min = csvInt(r.weeks_min ?? r.min_weeks);
    if (weeks_min === null) return err('tuition_tiers', row, 'weeks_min(或 min_weeks)必填');
    if (csvNum(r.price_per_week) === null)
      return err('tuition_tiers', row, 'price_per_week 必填');

    let currency = null;
    try {
      currency = normalizeCurrency(
        r.currency,
        `tuition_tiers[${r.school_name}/${r.program_name}].currency`
      );
    } catch (e) {
      return err('tuition_tiers', row, e.message);
    }
    if (!currency) return err('tuition_tiers', row, 'currency 必填');

    out.push({
      program_id,
      campus_id,
      weeks_min,
      weeks_max: csvInt(r.weeks_max ?? r.max_weeks),
      price_per_week: csvNum(r.price_per_week),
      currency,
      note: r.note || null,
    });
  });
  return out;
}

function parseHousing(rows, schoolMap) {
  const out = [];
  rows.forEach((r, i) => {
    const row = i + 2;
    if (isSampleRow(r, 'school_name')) return;
    if (!r.school_name) return err('housing', row, 'school_name 必填');
    if (!r.city) return err('housing', row, 'city 必填(DB NOT NULL)');
    if (!r.type) return err('housing', row, 'type 必填');
    if (csvNum(r.price_per_week) === null) return err('housing', row, 'price_per_week 必填');

    const school_id = schoolMap.get(r.school_name);
    if (!school_id) {
      return err('housing', row, `school_name "${r.school_name}" 找不到對應 schools 列`);
    }

    let currency = null;
    try {
      currency = normalizeCurrency(r.currency, `housing[${r.school_name}/${r.type}].currency`);
    } catch (e) {
      return err('housing', row, e.message);
    }
    if (!currency) return err('housing', row, 'currency 必填');

    out.push({
      school_id,
      city: r.city,
      type: r.type,
      subtype: r.subtype || null,
      price_per_week: csvNum(r.price_per_week),
      currency,
      includes: r.includes || null,
      commute_to_school: r.commute_to_school || null,
    });
  });
  return out;
}

// ─── insert / plan ──────────────────────────────────────────────────────────
async function insertOrPlan(table, rows) {
  if (rows.length === 0) return { count: 0, ids: [] };

  if (flags.dryRun) {
    // 給合成 id,讓後續 FK 解析能往下走
    return {
      count: rows.length,
      ids: rows.map((_, i) => ({ id: `dry_${table}_${i}` })),
    };
  }

  const clean = rows.map((r) => {
    const c = { ...r };
    Object.keys(c)
      .filter((k) => k.startsWith('_'))
      .forEach((k) => delete c[k]);
    return c;
  });

  const { data, error } = await supabase.from(table).insert(clean).select('id');
  if (error) throw new Error(`${table} insert 失敗: ${error.message}`);
  return { count: data.length, ids: data };
}

// ─── main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n=== Phase 14c 語校資料匯入 ===');
  console.log(`模式  : ${flags.dryRun ? '🔍 dry-run(不寫 DB)' : '⚡ COMMIT(寫入 DB)'}`);
  console.log(`資料夾: ${resolve(flags.dataDir)}`);
  console.log(`跳範例: ${!flags.keepSamples}`);
  console.log('');

  const csvs = {};
  for (const name of ['schools', 'city_info', 'campuses', 'programs', 'tuition_tiers', 'housing']) {
    try {
      csvs[name] = readCsv(name);
      console.log(`📄 ${name}.csv: ${csvs[name].length} 列`);
    } catch (e) {
      console.error(`❌ ${e.message}`);
      process.exit(1);
    }
  }
  console.log('');

  // schools + city_info(無 FK 依賴)
  const schoolsRows = parseSchools(csvs.schools);
  const cityRows = parseCityInfo(csvs.city_info);
  if (errors.length) return reportAndExit();

  const schoolRes = await insertOrPlan('schools', schoolsRows);
  const cityRes = await insertOrPlan('city_info', cityRows);
  console.log(`${flags.dryRun ? '🔍' : '✓'} schools         : ${schoolRes.count}`);
  console.log(`${flags.dryRun ? '🔍' : '✓'} city_info       : ${cityRes.count}`);

  const schoolMap = new Map();
  schoolRes.ids.forEach((s, i) => schoolMap.set(schoolsRows[i].name, s.id));

  // campuses + programs + housing(需要 school_id)
  const campusRows = parseCampuses(csvs.campuses, schoolMap);
  const programRows = parsePrograms(csvs.programs, schoolMap);
  const housingRows = parseHousing(csvs.housing, schoolMap);
  if (errors.length) return reportAndExit();

  const campusRes = await insertOrPlan('campuses', campusRows);
  const programRes = await insertOrPlan('programs', programRows);
  const housingRes = await insertOrPlan('housing', housingRows);
  console.log(`${flags.dryRun ? '🔍' : '✓'} campuses        : ${campusRes.count}`);
  console.log(`${flags.dryRun ? '🔍' : '✓'} programs        : ${programRes.count}`);
  console.log(`${flags.dryRun ? '🔍' : '✓'} housing         : ${housingRes.count}`);

  const campusMap = new Map();
  campusRes.ids.forEach((c, i) => campusMap.set(campusRows[i]._csvKey, c.id));
  const programMap = new Map();
  programRes.ids.forEach((p, i) => programMap.set(programRows[i]._csvKey, p.id));

  // tuition_tiers(需要 program_id + 可選 campus_id)
  const tierRows = parseTuitionTiers(csvs.tuition_tiers, programMap, campusMap);
  if (errors.length) return reportAndExit();

  const tierRes = await insertOrPlan('tuition_tiers', tierRows);
  console.log(`${flags.dryRun ? '🔍' : '✓'} tuition_tiers   : ${tierRes.count}`);

  console.log('');
  console.log('=== 摘要 ===');
  console.log(`schools          ${schoolRes.count}`);
  console.log(`city_info        ${cityRes.count}`);
  console.log(`campuses         ${campusRes.count}`);
  console.log(`programs         ${programRes.count}`);
  console.log(`housing          ${housingRes.count}`);
  console.log(`tuition_tiers    ${tierRes.count}`);

  if (warnings.length) {
    console.log('');
    console.log(`⚠️  ${warnings.length} 個 warning(不阻擋):`);
    warnings.forEach((w) => console.log(`   [${w.table} row ${w.row}] ${w.msg}`));
  }

  console.log('');
  if (flags.dryRun) {
    console.log('🔍 dry-run 完成 — 沒寫進 DB。確認 OK 後加 --commit 真實匯入。');
  } else {
    console.log('⚡ 匯入完成。請跑 scripts/README.md 內的驗證 SQL。');
  }
}

function reportAndExit() {
  console.log('');
  console.log(`❌ ${errors.length} 個錯誤,中止(已解析的 schools / city_info 不會在 dry-run 留下痕跡):`);
  errors.forEach((e) => console.log(`   [${e.table} row ${e.row}] ${e.msg}`));
  if (warnings.length) {
    console.log('');
    console.log(`⚠️  另有 ${warnings.length} warning:`);
    warnings.forEach((w) => console.log(`   [${w.table} row ${w.row}] ${w.msg}`));
  }
  process.exit(1);
}

main().catch((e) => {
  console.error('\n❌ 腳本異常:', e.message);
  if (flags.verbose) console.error(e.stack);
  process.exit(1);
});
