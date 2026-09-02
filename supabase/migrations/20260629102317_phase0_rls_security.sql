-- Phase 0.1 + 0.2 — RLS 安全修復(HYBRID 最快上線路線)
-- 對應 CLAUDE.md §3.4 / §8 Phase 0 / §11
--
-- 背景(2026-06-29 live 查核):
--   ERROR:day_schedule/voices/faq/photos 4 表 RLS 全關(anon 可讀寫)— Supabase advisor critical
--   WARN :ep_consult_notes/promoted_faqs/qa_items 有 always-true ALL policy(PUBLIC=含 anon 讀寫洞)
--   既有 6 內容表已是正確 pattern(SELECT USING(true) TO authenticated,無寫 policy → 寫入走 service_role)
--
-- 修法(鏡像既有 6 表;authenticated-only,非 anon):
--   0.1 4 新表 ENABLE RLS + SELECT TO authenticated(寫入留 service_role,EF 走這條繞 RLS)
--   0.2 收緊 3 個 always-true 表(前台/EF 皆未使用,grep 確認)→ drop public ALL policy
--       (RLS 仍 on,無 policy = 只 service_role 能碰,鎖死 anon 洞)
--   generated_pages 的 authenticated INSERT/UPDATE policy 保留(顧問共享池,D7 決策,MVP 預期行為)
--   page_templates(RLS on, 0 policy)現狀安全(service_role only),不動
--
-- 安全性:本檔不觸碰任何 row data(純 RLS/policy);down SQL 可完全還原

-- ════════════════════════════════════════════════════════════════════
-- UP
-- ════════════════════════════════════════════════════════════════════

-- 0.1 — 4 新表 RLS(鏡像既有 6 表 pattern)
ALTER TABLE day_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE voices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq          ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read day_schedule" ON day_schedule FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read voices"       ON voices       FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read faq"          ON faq          FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read photos"       ON photos       FOR SELECT TO authenticated USING (true);

-- 0.2 — 收緊 always-true 寫洞(3 表前台/EF 皆未使用 → 鎖成 service_role only)
DROP POLICY IF EXISTS "anon_all"   ON ep_consult_notes;
DROP POLICY IF EXISTS "public_all" ON promoted_faqs;
DROP POLICY IF EXISTS "public_all" ON qa_items;

-- ════════════════════════════════════════════════════════════════════
-- DOWN(還原用,勿在正常流程執行)
-- ════════════════════════════════════════════════════════════════════
-- DROP POLICY IF EXISTS "Authenticated read day_schedule" ON day_schedule;
-- DROP POLICY IF EXISTS "Authenticated read voices"       ON voices;
-- DROP POLICY IF EXISTS "Authenticated read faq"          ON faq;
-- DROP POLICY IF EXISTS "Authenticated read photos"       ON photos;
-- ALTER TABLE day_schedule DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE voices       DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE faq          DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE photos       DISABLE ROW LEVEL SECURITY;
-- CREATE POLICY "anon_all"   ON ep_consult_notes FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "public_all" ON promoted_faqs    FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "public_all" ON qa_items         FOR ALL USING (true) WITH CHECK (true);
