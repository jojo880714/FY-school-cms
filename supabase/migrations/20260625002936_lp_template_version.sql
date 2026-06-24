-- LP template 版本(per-LP)— Phase 2 Batch 1 B1-0
-- 區分舊 tabs LP(legacy 用 comparison)vs 新 scroll 長頁(scroll_v1 用 comparison_scroll)
-- 命名理由:避開「Phase 20 entity 凍住」域(同 card_variant 用 lp_ 開頭)
--
-- R-B 拍板:Batch 1-3 進行期間,新 scroll 模板只套用在新建 LP;既有 25 row(全 backfill 'legacy')
-- 即使顧問重新生成也維持舊 tabs 模板,避免顧問改個學生名字就無預警拿到半成品長頁。
-- Phase 2 三批全部完成、長頁穩定後,另開獨立 commit + 另外 GO 把舊頁統一切到 scroll(屆時 backfill)。
--
-- 設計原則:
-- - 純 additive,不動既有欄位
-- - NOT NULL + DEFAULT 'legacy' → 舊 25 row 自動 backfill 'legacy'(safe path)
-- - CHECK constraint 限定 ('legacy', 'scroll_v1') 兩種
-- - CreatePage 改寫(B1-3)後新建 LP 才開始寫 'scroll_v1'
-- - EF(B1-2)讀 template_version 決定 page_templates row id

ALTER TABLE generated_pages
  ADD COLUMN IF NOT EXISTS template_version TEXT NOT NULL DEFAULT 'legacy'
    CHECK (template_version IN ('legacy', 'scroll_v1'));

COMMENT ON COLUMN generated_pages.template_version IS
'LP template 版本。legacy=舊 tabs 模板 comparison;scroll_v1=新 scroll 長頁 comparison_scroll。
舊 25 row backfill legacy(由 DEFAULT 自動)。CreatePage 新建 LP 寫 scroll_v1。
Phase 2 三批完成後另開 commit 統一切舊頁到 scroll(屆時 backfill)。';

-- 驗證 SQL:
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'generated_pages' AND column_name = 'template_version';
-- 預期: template_version | text | 'legacy'::text | NO
--
-- SELECT template_version, COUNT(*) FROM generated_pages GROUP BY template_version;
-- 預期: legacy | 25(全 backfill 'legacy',B1-3 改寫前沒人寫 'scroll_v1')
