-- Phase 16a: 比較頁內容架構升級的 schema 擴充
-- 對應 Section 2 TLDR / Section 3 教學品質 / Section 5 總覽表 / Section 8 住宿矩陣 / Section 10 國籍

-- 設計原則:
-- - 純 additive,不動既有欄位
-- - 全部 nullable(NULL = 資料未蒐集)
-- - JSONB 預設空陣列(top_nationalities)避免 null/[] 邏輯混亂
-- - Edge Function / template 改動留到 Phase 16b 一起做

-- ── schools 加 4 欄 ───────────────────────────────────────
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS one_liner TEXT,                      -- Section 2 TLDR 一句話(<40 字)
  ADD COLUMN IF NOT EXISTS english_only_policy_label TEXT,      -- Section 3 顧問用語(<12 字,如「違規警告制」)
  ADD COLUMN IF NOT EXISTS min_age INTEGER,                     -- Section 5 學校最低收生年齡
  ADD COLUMN IF NOT EXISTS top_nationalities JSONB DEFAULT '[]'::jsonb;  -- Section 10 學員國籍順序,[{"name":"Spain","flag":"🇪🇸"}, ...]

-- ── programs 加 1 欄 ──────────────────────────────────────
ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS min_weeks INTEGER;                   -- Section 5 該課程最短週數

-- ── city_info 加 1 欄 ─────────────────────────────────────
ALTER TABLE city_info
  ADD COLUMN IF NOT EXISTS visa_options TEXT[];                 -- Section 5 簽證選項(訪客/YMS/eTA/...)

-- ── housing 加 2 欄 ───────────────────────────────────────
ALTER TABLE housing
  ADD COLUMN IF NOT EXISTS includes TEXT,                       -- Section 8 含什麼(早餐/半膳/自理/含洗衣...)
  ADD COLUMN IF NOT EXISTS commute_to_school TEXT;              -- Section 8 通勤描述(步行 5 分 / 通勤 60 分)

-- 驗證 SQL(套用完跑一次確認):
-- SELECT table_name, column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name IN ('schools', 'programs', 'city_info', 'housing')
--   AND column_name IN (
--     'one_liner', 'english_only_policy_label', 'min_age', 'top_nationalities',
--     'min_weeks', 'visa_options', 'includes', 'commute_to_school'
--   )
-- ORDER BY table_name, column_name;
-- 預期回 8 列
