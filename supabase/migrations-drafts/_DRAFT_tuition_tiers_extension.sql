-- Group 2 B 草稿(NOT APPLY)— tuition_tiers 加報價系統需要的欄位
--
-- 現有 tuition_tiers(Phase 14a + 18b 演進後):
--   id, program_id, campus_id, weeks_min, weeks_max, price_per_week, currency, valid_from, valid_until
--
-- 報價系統 SCHOOL_DATA 的 tier 結構需要額外欄位:
--   - fixed:固定金額(替代 price 用,例如註冊費、教材費)
--   - peak:尖峰季加價(每單位額外加)
--   - unit:計價單位(按週 / 按堂 / 按天 / 固定金額)
--   - category:課程類別(課程 / 教材 / 註冊 / 銀行 / 行政)
--
-- 套用時機:等 SCHOOL_DATA ETL 進來時一起套(見 _DRAFT_etl_plan.md)

ALTER TABLE tuition_tiers
  ADD COLUMN IF NOT EXISTS fixed NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT '按週計算',
  ADD COLUMN IF NOT EXISTS category TEXT;

-- 驗證:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name='tuition_tiers' AND column_name IN ('fixed','peak','unit','category');
-- 預期:4 列
