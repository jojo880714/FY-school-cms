-- Phase 19a: generated_pages 加學生諮詢欄位
-- 把比較頁從「比較頁倉庫」升級為「學生 case 倉庫」
-- 顧問可以從 Dashboard 直接看到學生姓名 / 聯絡 / 諮詢日期 / 諮詢備注

-- 設計原則:
-- - 純 additive,不動既有欄位
-- - 全部 nullable(NULL = 學生匿名 / 資料未填,demo 階段允許不填)
-- - consultation_date 預設 CURRENT_DATE,新建時自動帶今天

ALTER TABLE generated_pages
  ADD COLUMN IF NOT EXISTS student_name TEXT,
  ADD COLUMN IF NOT EXISTS student_contact TEXT,
  ADD COLUMN IF NOT EXISTS consultation_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS consultation_notes TEXT;

COMMENT ON COLUMN generated_pages.student_name IS '學生姓名';
COMMENT ON COLUMN generated_pages.student_contact IS '聯絡方式（LINE ID / 電話）';
COMMENT ON COLUMN generated_pages.consultation_date IS '諮詢日期,預設今天';
COMMENT ON COLUMN generated_pages.consultation_notes IS '諮詢後備注(自由文字)';

-- 驗證 SQL(套用完跑一次確認):
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'generated_pages'
--   AND column_name IN ('student_name','student_contact','consultation_date','consultation_notes');
-- 預期: 4 欄,consultation_date default = CURRENT_DATE
