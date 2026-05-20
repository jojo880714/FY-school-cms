-- Phase 4 Step 1：generated_pages 新增 campus_ids 欄位
-- 對應後端 migration 紀錄 version 20260519085918
-- 由 Supabase MCP apply_migration 套用，本檔為 repo 端同步副本
ALTER TABLE generated_pages
ADD COLUMN campus_ids uuid[] DEFAULT '{}';
