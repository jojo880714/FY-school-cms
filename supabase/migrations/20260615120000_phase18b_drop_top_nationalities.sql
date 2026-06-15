-- Phase 18b: 廢棄 schools.top_nationalities,Section 10 國籍卡全面用 nationality_breakdown(含 pct)
--
-- 背景:
-- - Phase 16a 加 top_nationalities JSONB(只有 flag/name,無 pct)
-- - Phase 18a 加 nationality_breakdown JSONB(含 pct)— 兩欄並存,EF 之前只讀 top_nationalities
-- - Phase 14c sanity check 確認 demo DB 兩個欄位都全空(沒回補 backfill 壓力)
--
-- 本 migration:
-- - 切換完 EF 後執行(EF 已先 deploy,Section 10 改讀 nationality_breakdown)
-- - 直接 DROP COLUMN — 不留 deprecation 過渡期(EF 已不再參照,前端從沒讀過)
-- - 同 PR 內配套:
--     supabase/functions/generate-page/index.ts  (Section 10 切讀 nationality_breakdown)
--     IMPORT_TEMPLATES.md                        (移除 top_nationalities 條目 + 雙寫說明)
--     scripts/import-data.js                     (移除 top_nationalities 衍生與寫入)
--
-- 順序:依 OPERATIONS.md「先 deploy Edge Function → 再改 schema」原則,
--      本 migration 應在 EF 已 deploy 後才套用,避免 EF v25 仍讀已不存在的欄位

ALTER TABLE schools DROP COLUMN IF EXISTS top_nationalities;

-- 驗證 SQL(套用完跑一次確認):
-- SELECT column_name
-- FROM information_schema.columns
-- WHERE table_name = 'schools' AND column_name = 'top_nationalities';
-- 預期: 0 列
