-- Phase 15a: 學校行銷欄位 + 課程入學/結業程度
-- 對應 IMPORT_TEMPLATES.md 1./3. 表新增欄位,讓真實資料匯入(14c)時能填這些「打動學生」的關鍵資訊
--
-- 設計原則:純 additive,既有資料統一 NULL(沒值不顯示,Phase 4 防呆已蓋),Edge Function 14c 再讀

-- ── schools:行銷與決策資訊 ──────────────────────
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS class_size_typical INTEGER,  -- 平均班級人數
  ADD COLUMN IF NOT EXISTS class_size_max INTEGER,      -- 班級人數上限
  ADD COLUMN IF NOT EXISTS strengths TEXT[],            -- 該校 2-3 個強項標籤
  ADD COLUMN IF NOT EXISTS suitable_for TEXT[];         -- 適合的學生類型

-- ── programs:CEFR 入學門檻 / 結業程度 ─────────────
ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS entry_level TEXT,    -- 入學門檻(CEFR 或 IELTS)
  ADD COLUMN IF NOT EXISTS outcome_level TEXT;  -- 結業預期程度

-- 既有資料保持 NULL(沒值就不顯示),由 14c 匯入時填入
-- 驗證:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name IN ('schools', 'programs')
--   AND column_name IN ('class_size_typical', 'class_size_max', 'strengths', 'suitable_for', 'entry_level', 'outcome_level');
-- 期望:6 rows
