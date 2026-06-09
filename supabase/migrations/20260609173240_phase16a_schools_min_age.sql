-- Phase 16a: 學校年齡門檻
-- 為「依學生年齡過濾學校」的 UX(Phase 16b 未來實作)做 schema 準備
--
-- 設計原則:純 additive,既有資料 NULL(無限制),14c 匯入時填入

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS min_age INTEGER;  -- 該校最低收生年齡(NULL = 無限制 / 待補)

-- 既有資料保持 NULL(代表「資訊未確認」,不過濾)
-- Phase 16b UX:CreatePage 學生年齡 N → schools.min_age IS NULL OR min_age <= N 可選
-- 驗證:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'schools' AND column_name = 'min_age';
-- 期望:1 row (min_age | integer)
