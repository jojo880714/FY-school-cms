-- Phase 18a: schools 加 nationality_breakdown JSONB
-- 目的:存「前 5-7 個主要學生國籍 + 百分比」,給比較頁顯示具體國籍分布
--
-- 注意:Phase 16a 已有 schools.top_nationalities JSONB(同樣存國籍清單,但無 pct)
-- 18a 是更完整的版本(加 pct 百分比)
-- 兩個欄位暫時並存,待顧問決定:
--   選項 A) 兩個共存 — top_nationalities 只給簡單顯示 / nationality_breakdown 給詳細展示
--   選項 B) 廢棄 top_nationalities,全面用 nationality_breakdown
-- 之後 Edge Function / template 改動再定案
--
-- 設計原則:
-- - 純 additive,不動既有欄位
-- - DEFAULT '[]'::jsonb 避免 null/[] 邏輯混亂
-- - 不回填(NULL/[] 都代表「該校國籍 breakdown 待補」)
-- - pct 總和不需精確等於 100(顧問填寫實務不易精準)

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS nationality_breakdown JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN schools.nationality_breakdown IS
'前 5-7 個主要學生國籍,格式: [{"flag":"🇪🇸","name":"西班牙","pct":24},{"flag":"🇧🇷","name":"巴西","pct":18}]. 手動更新,建議每年更新一次. pct 總和不需精確等於 100.';

-- 驗證 SQL(套用完跑一次確認):
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'schools' AND column_name = 'nationality_breakdown';
-- 預期: nationality_breakdown | jsonb | '[]'::jsonb
