-- Phase 8: 軟刪除支援
-- 加 deleted_at 欄位讓 Dashboard 隱藏被刪除的 row,但保留資料以利誤刪救回
-- 配套 partial index 加速「未刪除頁面」查詢(Dashboard 主要 query path)

ALTER TABLE generated_pages
  ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX idx_generated_pages_deleted_at
  ON generated_pages (deleted_at)
  WHERE deleted_at IS NULL;
