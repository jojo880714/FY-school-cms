-- Phase 16c: schools 加 persona_match[]
-- 目的:Section 4「適合什麼樣的你」用「人物 × 校」對應矩陣呈現
--
-- 對應 master list(6 個人物,跟 17e PURPOSE_TAGS 部分重疊但獨立):
--   exam_prep      / 考試衝刺
--   pathway_uni    / 銜接升大學
--   pathway_grad   / 銜接升研究所
--   working_holiday/ 打工度假/WHV 配套
--   career_change  / 職涯轉換(鎖 30+)
--   gap_year       / 學測後 Gap year
--
-- 設計原則:
-- - 純 additive,不動既有欄位(schools.suitable_for[] 維持原樣,顧問自由文字)
-- - DEFAULT '{}' 避免 null/[] 邏輯混亂(同 top_nationalities 處理方式)
-- - 不回填(NULL/[] 都代表「該校 persona 待補」)
-- - Section 4 template / Edge Function 留 16c 後續實作

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS persona_match TEXT[] DEFAULT '{}';

COMMENT ON COLUMN schools.persona_match IS
'學員人物 tag,從 master list 挑選: exam_prep / pathway_uni / pathway_grad / working_holiday / career_change / gap_year';

-- 驗證 SQL(套用完跑一次確認):
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'schools' AND column_name = 'persona_match';
-- 預期: persona_match | ARRAY | '{}'::text[]
