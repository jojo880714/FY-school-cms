-- LP 卡片變體(per-LP)— Phase 1.1 C1
-- 對應 generate-page EF 已有的 style 參數(原 A/B/D 補上 C 後 ABCD),persistent 存 DB
-- 命名理由:避開「Phase 20 entity 凍住」域(jojo 拍板)
--
-- 設計原則:
-- - 純 additive,不動既有欄位
-- - NOT NULL + DEFAULT 'A' → 舊 row 自動 backfill 'A'
-- - CHECK constraint 限定 A/B/C/D 4 種
-- - 跟「Phase 20 entity 凍住」無關(這欄純粹是 LP 渲染 hint,不是 entity SSOT)

ALTER TABLE generated_pages
  ADD COLUMN IF NOT EXISTS card_variant TEXT NOT NULL DEFAULT 'A'
    CHECK (card_variant IN ('A','B','C','D'));

COMMENT ON COLUMN generated_pages.card_variant IS
'校區卡片變體 per-LP(A 學員適配 / B 費用導向 / C 氛圍情感 / D 資訊密集)。對應 generate-page EF 的 cardVariant 參數,persistent 存 DB 供 LP 編輯時還原。';

-- 驗證 SQL:
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'generated_pages' AND column_name = 'card_variant';
-- 預期: card_variant | text | 'A'::text | NO
--
-- SELECT card_variant, COUNT(*) FROM generated_pages GROUP BY card_variant;
-- 預期: A | (全 row 數,backfill 自動)
