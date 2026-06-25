-- 啟用 pg_net extension(supabase 預裝,放 extensions schema)
-- 用途:從 SQL 內 invoke EF endpoint(S3 各段驗證 / 後續 DEMO 自動 regenerate)
-- 純 additive,IF NOT EXISTS 安全 idempotent
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
