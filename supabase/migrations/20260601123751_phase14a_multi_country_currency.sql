-- Phase 14a: Multi-country / multi-currency 支援
-- 為 Phase 14b/14c 真實資料匯入(20+ 學校、多國家)做 schema 準備
--
-- 設計原則:純 additive,不動既有欄位、不改 Edge Function、不改 template
-- 既有資料統一回填 country='Canada' / currency='CAD' (與目前 Edge Function 假設一致)
-- 14c 真實匯入時再:(a) 寫匯入腳本 (b) 更新 Edge Function 讀新欄位 (c) 更新 template currency 顯示

-- ── schools:加國家 ──────────────────────────────
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Canada';
UPDATE schools SET country = 'Canada' WHERE country IS NULL;

-- ── city_info:加國家 + 通用生活費欄位(舊欄位 cost_of_living_monthly_cad 暫保留)──
ALTER TABLE city_info
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Canada',
  ADD COLUMN IF NOT EXISTS cost_of_living_monthly INTEGER,
  ADD COLUMN IF NOT EXISTS cost_of_living_currency TEXT DEFAULT 'CAD';

UPDATE city_info
  SET country = 'Canada'
  WHERE country IS NULL;

UPDATE city_info
  SET cost_of_living_monthly = cost_of_living_monthly_cad,
      cost_of_living_currency = 'CAD'
  WHERE cost_of_living_monthly IS NULL
    AND cost_of_living_monthly_cad IS NOT NULL;

-- ── tuition_tiers:加幣別 ─────────────────────────
ALTER TABLE tuition_tiers
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'CAD';
UPDATE tuition_tiers SET currency = 'CAD' WHERE currency IS NULL;

-- ── housing:加幣別 ──────────────────────────────
ALTER TABLE housing
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'CAD';
UPDATE housing SET currency = 'CAD' WHERE currency IS NULL;

-- 驗證 SQL(套用完手動跑檢查):
-- SELECT COUNT(*) FROM schools WHERE country IS NULL;        -- 期望 0
-- SELECT COUNT(*) FROM city_info WHERE country IS NULL;      -- 期望 0
-- SELECT COUNT(*) FROM tuition_tiers WHERE currency IS NULL; -- 期望 0
-- SELECT COUNT(*) FROM housing WHERE currency IS NULL;       -- 期望 0
