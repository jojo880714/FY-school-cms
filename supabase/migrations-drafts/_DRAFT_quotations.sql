-- Group 2 B 草稿(NOT APPLY)— 新增 quotations 表(報價單)
--
-- 用途:報價系統併進 CMS 後,儲存顧問每張開出的報價單。
-- 報價跟 LP 多對一:一張 LP 可能因學生要不同方案出多張報價單。
-- 報價跟案件多對一:同案件可能改幾次方案各出一張報價。
--
-- 套用時機:報價 wizard 落地時

CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 編號(對外可見)
  quote_number TEXT UNIQUE,                   -- e.g. 'Q20260618-0001'

  -- 關聯
  case_id UUID REFERENCES cases(id),           -- 屬於哪個案件
  lp_id UUID REFERENCES generated_pages(id),   -- 從哪張 LP 來(可選,直接開報價時為 null)
  school_id UUID REFERENCES schools(id),       -- 哪間學校

  -- 報價內容(完整 QuotationInput snapshot,等同呼叫 calculate() 的輸入)
  payload JSONB NOT NULL,
  -- {
  --   vendor: 'EP',
  --   campus: 'Brisbane',
  --   course: {...},
  --   weeks: 12,
  --   accomm: {...},
  --   extras: {...},
  --   disc: {...},
  --   campusFees: [...],
  --   rates: {...},
  --   adminSettings: {...}
  -- }

  -- 計算結果 snapshot(QuotationResult,鎖價用)
  result JSONB NOT NULL,
  -- 含 items / rawCostTWD / costTWD / preTaxSell / finalTWD / netProfit / etc

  -- 顯示金額(常用 query,從 result 抽出方便 index)
  final_twd INT NOT NULL,
  currency_primary TEXT NOT NULL,             -- 主幣別 e.g. 'AUD'
  weeks INT NOT NULL,
  start_date DATE,

  -- 狀態
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','accepted','rejected','expired')),
  -- draft     草稿
  -- sent      已寄出
  -- accepted  學生接受
  -- rejected  學生拒絕
  -- expired   過期(預設 7 天)

  -- 期限
  valid_until DATE,                            -- 預設 created_at + 7 days

  -- meta
  created_by UUID,                             -- auth.users.id
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  pdf_url TEXT,                                -- 出 PDF 後存放位置

  notes TEXT
);

CREATE INDEX IF NOT EXISTS quotations_case_idx ON quotations(case_id);
CREATE INDEX IF NOT EXISTS quotations_lp_idx ON quotations(lp_id);
CREATE INDEX IF NOT EXISTS quotations_status_idx ON quotations(status);
CREATE INDEX IF NOT EXISTS quotations_created_by_idx ON quotations(created_by);
CREATE INDEX IF NOT EXISTS quotations_created_at_idx ON quotations(created_at DESC);

-- 自動編號 sequence(可選)
CREATE SEQUENCE IF NOT EXISTS quote_number_seq START 1;

-- 驗證:
-- SELECT COUNT(*) FROM quotations;  -- 期望 0
