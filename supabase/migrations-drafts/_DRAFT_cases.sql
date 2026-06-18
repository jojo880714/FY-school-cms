-- Group 2 B 草稿(NOT APPLY)— 新增 cases 表(案件 MVP)
--
-- 設計原則(已拍板):
--   - 案件由 CRM 之後接管,CMS 內輕量,**預留 crm_case_id** 給將來指向
--   - 1 個學生 = 1 個案件,1 個案件 = N 張 LP(generated_pages)
--   - dedup 用 student_name + student_contact(隱性建立,顧問無感)
--
-- 套用時機:Wizard step 1 落地時(隱性建案件)

CREATE TABLE IF NOT EXISTS cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 基本資料(MVP)
  student_name TEXT NOT NULL,
  student_contact TEXT,                  -- LINE / email / phone 任一
  consultation_date DATE DEFAULT CURRENT_DATE,

  -- 狀態(顧問 / 案件 funnel)
  status TEXT NOT NULL DEFAULT 'in_consult'
    CHECK (status IN ('in_consult','lp_done','quote_done','signed','abandoned')),
  -- in_consult     諮詢中
  -- lp_done        LP 完成
  -- quote_done     已開報價
  -- signed         已收單
  -- abandoned      已放棄

  -- 顧問
  advisor_id UUID,                       -- 對應 auth.users.id

  -- CRM 接管預留
  crm_case_id TEXT,                      -- 等 CRM 上線時指向 CRM 對應案件

  -- meta
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,                -- 軟刪除
  notes TEXT                              -- 簡易備注(若有需要)
);

-- 索引:常用查詢
CREATE INDEX IF NOT EXISTS cases_advisor_idx ON cases(advisor_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS cases_status_idx ON cases(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS cases_student_idx ON cases(student_name) WHERE deleted_at IS NULL;
-- dedup 用:同 advisor + 同學生名 + 同聯絡 視為同案件
CREATE UNIQUE INDEX IF NOT EXISTS cases_dedup_idx
  ON cases(advisor_id, student_name, COALESCE(student_contact, ''))
  WHERE deleted_at IS NULL;

-- generated_pages 加 case_id FK
ALTER TABLE generated_pages
  ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES cases(id);
CREATE INDEX IF NOT EXISTS generated_pages_case_idx ON generated_pages(case_id) WHERE deleted_at IS NULL;

-- 驗證:
-- SELECT COUNT(*) FROM cases;  -- 期望 0(待匯入)
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name='generated_pages' AND column_name='case_id';
