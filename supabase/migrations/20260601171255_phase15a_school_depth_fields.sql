-- Phase 15a: 深度欄位 schema 擴充
-- 為了讓比較頁從「合規清單」變「有觀點的選校建議」
-- 加 6 個欄位讓顧問把「真正讓學校產生差異」的資訊填進去

-- 設計原則:
-- - 純 additive,不動既有欄位
-- - 全部 nullable,舊資料不回填(NULL = 該欄位資料未蒐集)
-- - Edge Function / template 顯示這些欄位留到 Phase 15b
--   (跟 Phase 14c 灌完資料時一起改 + redeploy 一次)

-- ── schools 加 4 欄 ───────────────────────────────────────
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS class_size_typical INTEGER,  -- 平均班級人數
  ADD COLUMN IF NOT EXISTS class_size_max INTEGER,       -- 班級人數上限
  ADD COLUMN IF NOT EXISTS strengths TEXT[],             -- 強項標籤
  ADD COLUMN IF NOT EXISTS suitable_for TEXT[];          -- 適合的學生類型

-- ── programs 加 2 欄 ──────────────────────────────────────
ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS entry_level TEXT,             -- 入學門檻
  ADD COLUMN IF NOT EXISTS outcome_level TEXT;           -- 學成 outcome

-- 驗證 SQL（套用完跑一次確認）:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name IN ('schools', 'programs')
--   AND column_name IN ('class_size_typical', 'class_size_max',
--                       'strengths', 'suitable_for',
--                       'entry_level', 'outcome_level')
-- ORDER BY table_name, column_name;
-- 預期回 6 列
