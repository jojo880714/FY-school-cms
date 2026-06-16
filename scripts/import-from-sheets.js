#!/usr/bin/env node
/**
 * Phase 14c — 直連 Google Sheets 匯入腳本
 *
 * 用法:
 *   node scripts/import-from-sheets.js                       # dry-run(預設,只驗證)
 *   node scripts/import-from-sheets.js --commit              # 真實寫入 Supabase
 *   node scripts/import-from-sheets.js --commit --truncate   # 先清空再寫(破壞性)
 *   node scripts/import-from-sheets.js --sheet-id <id>       # 覆寫預設 spreadsheet
 *   node scripts/import-from-sheets.js --verbose             # 印 stack trace
 *
 * 認證(三選一,優先序由上而下):
 *   1. GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
 *   2. GOOGLE_SERVICE_ACCOUNT_KEY=<JSON 字串內容>(整段塞 .env,單行)
 *   3. GOOGLE_SHEETS_API_KEY=<api key>(僅讀「知道連結即可檢視」的 sheet)
 *
 * Supabase 寫入:
 *   SUPABASE_URL=... (or VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY=...  ← 必填(--commit 時),繞 RLS
 *
 * 6 個 tab 名稱必須一字不差:
 *   schools / city_info / campuses / programs / tuition_tiers / housing
 * 缺一或多出未知 tab → 報錯停止。
 *
 * Header-based 對映(不靠欄序);空 cell → null;非整數的 integer 欄會 round + warn。
 *
 * 國籍欄位:**只**讀 sheet 的 nationality_breakdown 寫進 DB。
 * sheet 上若還有 top_nationalities 欄位是 18b 之前的歷史殘留,腳本完全 ignore
 * (DB 該欄已 Phase 18b sub-track 1 DROP)。
 *
 * cost_of_living:寫 cost_of_living_monthly + cost_of_living_currency(Phase 14a 加的新欄)。
 * 舊欄 cost_of_living_monthly_cad 已 Phase 18b 後續 DROP,不再 mirror。
 */

import { readFileSync, existsSync } from 'node:fs';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

// ─── CLI 旗標 ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
}
const flags = {
  dryRun: !args.includes('--commit'),
  truncate: args.includes('--truncate'),
  sheetId: getArg('--sheet-id') ?? '1gOMXk_9efJ-IaXbdjMoRwI1NQRASLr1LKMCdYugptu0',
  verbose: args.includes('--verbose') || args.includes('-v'),
};

// ─── 常數 ────────────────────────────────────────────────────────────────────
const EXPECTED_TABS = ['schools', 'city_info', 'campuses', 'programs', 'tuition_tiers', 'housing'];
const VALID_CURRENCIES = ['CAD', 'USD', 'GBP', 'AUD', 'EUR', 'NZD', 'JPY', 'TWD', 'IEP', 'MTL'];
// Phase 16c master list + Persona vocab 對齊(8240e5b)加 pr_immigration
const PERSONA_VALID = ['exam_prep', 'pathway_uni', 'pathway_grad', 'working_holiday', 'career_change', 'gap_year', 'pr_immigration'];

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

// ─── Supabase client(--commit 才會用)────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase = null;
if (!flags.dryRun) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ --commit 需要 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
    console.error('   ANON key 會被 RLS 擋住,只能用 service_role key');
    process.exit(1);
  }
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── Google Sheets client ────────────────────────────────────────────────────
async function getSheetsClient() {
  // 1. Service account: 檔案路徑
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    return google.sheets({ version: 'v4', auth });
  }
  // 2. Service account: 內容 JSON 字串
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    let creds;
    try {
      creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    } catch (e) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY 不是合法 JSON: ' + e.message);
    }
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    return google.sheets({ version: 'v4', auth });
  }
  // 3. API key(僅讀公開 sheet)
  if (process.env.GOOGLE_SHEETS_API_KEY) {
    return google.sheets({ version: 'v4', auth: process.env.GOOGLE_SHEETS_API_KEY });
  }
  throw new Error(
    '❌ 認證缺失。請設定下列任一:\n' +
    '   GOOGLE_APPLICATION_CREDENTIALS=path/to/sa.json\n' +
    '   GOOGLE_SERVICE_ACCOUNT_KEY=<JSON 字串>\n' +
    '   GOOGLE_SHEETS_API_KEY=<api key>'
  );
}

// ─── 讀 spreadsheet ─────────────────────────────────────────────────────────
async function readSpreadsheet(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: flags.sheetId });
  const sheetNames = meta.data.sheets.map(s => s.properties.title);

  const missing = EXPECTED_TABS.filter(n => !sheetNames.includes(n));
  const unexpected = sheetNames.filter(n => !EXPECTED_TABS.includes(n));
  if (missing.length || unexpected.length) {
    const parts = [];
    if (missing.length) parts.push(`缺 tab: ${missing.join(', ')}`);
    if (unexpected.length) parts.push(`多出未知 tab: ${unexpected.join(', ')}`);
    throw new Error('Spreadsheet tab 不符 — ' + parts.join(' | '));
  }

  const tabs = {};
  for (const name of EXPECTED_TABS) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: flags.sheetId,
      range: `${name}!A:Z`,
    });
    const rows = res.data.values || [];
    if (rows.length === 0) {
      tabs[name] = [];
      continue;
    }
    const header = rows[0].map(h => String(h).trim());
    tabs[name] = rows.slice(1).map(row => {
      const obj = {};
      header.forEach((h, i) => {
        const raw = row[i];
        const val = (raw === undefined || raw === null) ? null
          : (typeof raw === 'string' ? raw.trim() : String(raw).trim());
        obj[h] = (val === null || val === '') ? null : val;
      });
      return obj;
    }).filter(r => Object.values(r).some(v => v !== null && v !== ''));
  }
  return tabs;
}

// ─── 型別轉換 helpers ────────────────────────────────────────────────────────
function csvArr(s) {
  if (s === undefined || s === null || s === '') return null;
  return String(s).split(',').map(x => x.trim()).filter(Boolean);
}
function csvBool(s) {
  if (s === undefined || s === null || s === '') return null;
  const v = String(s).trim().toUpperCase();
  if (['TRUE', 'T', 'YES', 'Y', '1'].includes(v)) return true;
  if (['FALSE', 'F', 'NO', 'N', '0'].includes(v)) return false;
  return null;
}
function csvNum(s) {
  if (s === undefined || s === null || s === '') return null;
  const n = parseFloat(String(s).trim());
  return Number.isFinite(n) ? n : null;
}
// integer 欄位:non-integer 值 round + warn(避免靜默截斷)
function csvInt(s, tab, row, field) {
  if (s === undefined || s === null || s === '') return null;
  const n = parseFloat(String(s).trim());
  if (!Number.isFinite(n)) return null;
  if (!Number.isInteger(n)) {
    warn(tab, row, `${field}=${n} 非整數,自動 round 到 ${Math.round(n)}`);
  }
  return Math.round(n);
}
function csvJsonArr(s) {
  if (s === undefined || s === null || s === '') return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    throw new Error(`JSON 陣列格式錯誤: ${String(s).slice(0, 80)}`);
  }
}
function normalizeCurrency(code, ctx) {
  if (!code) return null;
  const c = String(code).trim().toUpperCase();
  if (!VALID_CURRENCIES.includes(c)) {
    throw new Error(`${ctx}: 幣別 "${code}" 不是 ISO code(允許: ${VALID_CURRENCIES.join('/')})`);
  }
  return c;
}

// ─── error / warning 收集 ───────────────────────────────────────────────────
const errors = [];
const warnings = [];
const err = (tab, row, msg) => errors.push({ tab, row, msg });
const warn = (tab, row, msg) => warnings.push({ tab, row, msg });

// ─── per-tab 解析 ──────────────────────────────────────────────────────────
function parseSchools(rows) {
  const out = [];
  rows.forEach((r, i) => {
    const row = i + 2;
    if (!r.name) return err('schools', row, 'name 必填');

    // nationality_breakdown 必填 + pct 必填
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

    // persona_match 對 master list 驗證
    const persona = csvArr(r.persona_match) ?? [];
    for (const p of persona) {
      if (!PERSONA_VALID.includes(p)) {
        warn('schools', row, `persona_match "${p}" 不在 master list(allowed: ${PERSONA_VALID.join('/')})`);
      }
    }

    // Phase 18b sub-track 1:不再讀 top_nationalities sheet 欄(完全 ignore)
    out.push({
      name: r.name,
      full_name: r.full_name || r.name,
      country: r.country || 'Canada',
      founded: csvInt(r.founded, 'schools', row, 'founded'),
      english_only_policy: csvBool(r.english_only_policy),
      accreditation: csvArr(r.accreditation),
      nationality_count: csvInt(r.nationality_count, 'schools', row, 'nationality_count'),
      notes: r.notes || null,
      class_size_typical: csvInt(r.class_size_typical, 'schools', row, 'class_size_typical'),
      class_size_max: csvInt(r.class_size_max, 'schools', row, 'class_size_max'),
      strengths: csvArr(r.strengths),
      suitable_for: csvArr(r.suitable_for),
      one_liner: r.one_liner || null,
      english_only_policy_label: r.english_only_policy_label || null,
      min_age: csvInt(r.min_age, 'schools', row, 'min_age'),
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

    const monthlyInt = csvInt(r.cost_of_living_monthly, 'city_info', row, 'cost_of_living_monthly');

    out.push({
      city: r.city,
      country: r.country,
      climate: r.climate || null,
      population: r.population || null,
      cost_of_living_monthly: monthlyInt,
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
      walk_minutes: csvInt(r.walk_minutes, 'campuses', row, 'walk_minutes'),
      highlight: r.highlight || null,
    });
  });
  return out;
}

function parsePrograms(rows, schoolMap) {
  const out = [];
  rows.forEach((r, i) => {
    const row = i + 2;
    if (!r.school_name) return err('programs', row, 'school_name 必填');
    if (!r.name) return err('programs', row, 'name 必填');

    const school_id = schoolMap.get(r.school_name);
    if (!school_id) {
      return err('programs', row, `school_name "${r.school_name}" 找不到對應 schools 列`);
    }
    if (csvInt(r.lessons_per_week, 'programs', row, 'lessons_per_week') === null) {
      return err('programs', row, 'lessons_per_week 必填(DB NOT NULL)');
    }
    out.push({
      _csvKey: `${r.school_name}|${r.name}`,
      school_id,
      name: r.name,
      lessons_per_week: csvInt(r.lessons_per_week, 'programs', row, 'lessons_per_week'),
      lesson_minutes: csvInt(r.lesson_minutes, 'programs', row, 'lesson_minutes') ?? 50,
      hours_per_week: csvNum(r.hours_per_week),
      schedule: r.schedule || null,
      entry_level: r.entry_level || null,
      outcome_level: r.outcome_level || null,
      min_weeks: csvInt(r.min_weeks, 'programs', row, 'min_weeks'),
    });
  });
  return out;
}

function parseTuitionTiers(rows, programMap, campusMap) {
  const out = [];
  rows.forEach((r, i) => {
    const row = i + 2;
    if (!r.school_name) return err('tuition_tiers', row, 'school_name 必填');
    if (!r.program_name) return err('tuition_tiers', row, 'program_name 必填');

    const programKey = `${r.school_name}|${r.program_name}`;
    const program_id = programMap.get(programKey);
    if (!program_id) {
      return err('tuition_tiers', row, `(${r.school_name}, ${r.program_name}) 找不到對應 programs 列`);
    }

    // campus_id 可選(DB nullable)— 缺 city 不擋,給 WARN
    let campus_id = null;
    if (r.city) {
      campus_id = campusMap.get(`${r.school_name}|${r.city}`) ?? null;
      if (!campus_id) {
        return err('tuition_tiers', row, `(${r.school_name}, ${r.city}) 找不到對應 campuses 列`);
      }
    } else {
      warn('tuition_tiers', row, `(${r.school_name}, ${r.program_name}) 無 city 欄,campus_id=null(課程跨校區同價)`);
    }

    const weeks_min = csvInt(r.weeks_min ?? r.min_weeks, 'tuition_tiers', row, 'weeks_min');
    if (weeks_min === null) return err('tuition_tiers', row, 'weeks_min(或 min_weeks)必填');
    if (csvNum(r.price_per_week) === null) return err('tuition_tiers', row, 'price_per_week 必填');

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
      weeks_max: csvInt(r.weeks_max ?? r.max_weeks, 'tuition_tiers', row, 'weeks_max'),
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
    if (!r.school_name) return err('housing', row, 'school_name 必填');
    if (!r.city) return err('housing', row, 'city 必填(DB NOT NULL,無法 fallback)');
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

// 跨表 orphan:campuses.city / housing.city 必須在 city_info.city 有列
function checkCityOrphans(parsed) {
  const knownCities = new Set(parsed.city_info.map(c => c.city));
  parsed.campuses.forEach((c, i) => {
    if (!knownCities.has(c.city)) {
      err('campuses', i + 2, `city "${c.city}" 在 city_info 找不到對應`);
    }
  });
  parsed.housing.forEach((h, i) => {
    if (!knownCities.has(h.city)) {
      err('housing', i + 2, `city "${h.city}" 在 city_info 找不到對應`);
    }
  });
}

// ─── insert / plan ──────────────────────────────────────────────────────────
async function insertOrPlan(table, rows) {
  if (rows.length === 0) return { count: 0, ids: [] };
  if (flags.dryRun) {
    return { count: rows.length, ids: rows.map((_, i) => ({ id: `dry_${table}_${i}` })) };
  }
  const clean = rows.map(r => {
    const c = { ...r };
    Object.keys(c).filter(k => k.startsWith('_')).forEach(k => delete c[k]);
    return c;
  });
  const { data, error } = await supabase.from(table).insert(clean).select('id');
  if (error) throw new Error(`${table} insert 失敗: ${error.message}`);
  return { count: data.length, ids: data };
}

async function countTables() {
  if (flags.dryRun) return {};
  const result = {};
  for (const t of EXPECTED_TABS) {
    const { count, error } = await supabase.from(t).select('id', { count: 'exact', head: true });
    if (error) throw new Error(`count ${t} 失敗: ${error.message}`);
    result[t] = count ?? 0;
  }
  return result;
}

async function truncateAll() {
  // FK 順序反向 DELETE
  const order = ['tuition_tiers', 'housing', 'programs', 'campuses', 'schools', 'city_info'];
  for (const t of order) {
    const { error } = await supabase.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw new Error(`truncate ${t} 失敗: ${error.message}`);
    console.log(`   🗑  ${t} 已清空`);
  }
}

// ─── main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n=== Phase 14c Sheets-direct 匯入 ===');
  console.log(`模式      : ${flags.dryRun ? '🔍 dry-run(不寫 DB)' : '⚡ COMMIT(寫入 DB)'}`);
  console.log(`Sheet ID  : ${flags.sheetId}`);
  console.log(`Truncate  : ${flags.truncate ? '✅(先清空)' : '❌'}`);
  console.log('');

  // 1. 認證 + 讀 sheet
  let tabs;
  try {
    const sheets = await getSheetsClient();
    console.log('📖 連 Google Sheets...');
    tabs = await readSpreadsheet(sheets);
    for (const name of EXPECTED_TABS) {
      console.log(`   ${name}: ${tabs[name].length} 列(去除空列後)`);
    }
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
  console.log('');

  // 2. 寫入前檢查:目前 DB 各表筆數
  if (!flags.dryRun) {
    console.log('🔎 寫入前檢查 DB 現有筆數...');
    const before = await countTables();
    for (const t of EXPECTED_TABS) console.log(`   ${t}: ${before[t]}`);
    const totalExisting = Object.values(before).reduce((a, b) => a + b, 0);
    if (totalExisting > 0 && !flags.truncate) {
      console.error('\n❌ DB 已有資料,預設 abort 避免重複插入。');
      console.error('   要重灌請加 --truncate(破壞性,會 DELETE 全部 6 個 table)。');
      process.exit(1);
    }
    if (flags.truncate) {
      console.log('\n⚠️  --truncate 模式:準備 DELETE 全部 6 個 table...');
      await truncateAll();
    }
    console.log('');
  }

  // 3. 解析(無 FK 依賴):schools + city_info
  const schoolsRows = parseSchools(tabs.schools);
  const cityRows = parseCityInfo(tabs.city_info);

  // 4. 解析需要 schoolMap 之前先暫不執行,先收 schools-level error
  if (errors.length) return reportAndExit();

  // 5. 寫 schools + city_info
  const schoolRes = await insertOrPlan('schools', schoolsRows);
  const cityRes = await insertOrPlan('city_info', cityRows);
  console.log(`${flags.dryRun ? '🔍' : '✓'} schools         : ${schoolRes.count}`);
  console.log(`${flags.dryRun ? '🔍' : '✓'} city_info       : ${cityRes.count}`);

  const schoolMap = new Map();
  schoolRes.ids.forEach((s, i) => schoolMap.set(schoolsRows[i].name, s.id));

  // 6. campuses + programs + housing(需 school_id)
  const campusRows = parseCampuses(tabs.campuses, schoolMap);
  const programRows = parsePrograms(tabs.programs, schoolMap);
  const housingRows = parseHousing(tabs.housing, schoolMap);

  // 跨表 orphan 檢查
  checkCityOrphans({ city_info: cityRows, campuses: campusRows, housing: housingRows });

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

  // 7. tuition_tiers
  const tierRows = parseTuitionTiers(tabs.tuition_tiers, programMap, campusMap);
  if (errors.length) return reportAndExit();

  const tierRes = await insertOrPlan('tuition_tiers', tierRows);
  console.log(`${flags.dryRun ? '🔍' : '✓'} tuition_tiers   : ${tierRes.count}`);

  // 8. 摘要
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
    warnings.forEach(w => console.log(`   [${w.tab} row ${w.row}] ${w.msg}`));
  }

  console.log('');
  if (flags.dryRun) {
    console.log('🔍 dry-run 完成 — 沒寫進 DB。確認 OK 後加 --commit 真實匯入。');
  } else {
    console.log('⚡ 匯入完成。請跑 scripts/validate-import.sql 驗證。');
  }
}

function reportAndExit() {
  console.log('');
  console.log(`❌ ${errors.length} 個 blocking error(已解析的不會在 dry-run 留痕):`);
  errors.forEach(e => console.log(`   [${e.tab} row ${e.row}] ${e.msg}`));
  if (warnings.length) {
    console.log('');
    console.log(`⚠️  另有 ${warnings.length} warning:`);
    warnings.forEach(w => console.log(`   [${w.tab} row ${w.row}] ${w.msg}`));
  }
  process.exit(1);
}

main().catch(e => {
  console.error('\n❌ 腳本異常:', e.message);
  if (flags.verbose) console.error(e.stack);
  process.exit(1);
});
