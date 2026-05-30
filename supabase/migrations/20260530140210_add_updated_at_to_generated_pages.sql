-- Phase 9: 編輯既有頁面的時間戳記
-- 加 updated_at 欄位讓 Dashboard 顯示「編輯於 ...」並追蹤頁面異動

ALTER TABLE generated_pages
  ADD COLUMN updated_at TIMESTAMPTZ;

-- 回填:舊 row 設定為 created_at(代表「沒被編輯過」)
-- Dashboard 顯示邏輯:updated_at > created_at + 容忍 1 秒 → 顯示「編輯於 X」
UPDATE generated_pages
  SET updated_at = created_at
  WHERE updated_at IS NULL;
