-- Group 2 B 草稿(NOT APPLY)— 新增 vendors 表
--
-- 為什麼:已拍板引入「廠商」這層,跟報價系統一致(Q1 = a)。
-- 之前 CMS 的 schools 表沒有「廠商」概念,所有學校 flat 列。
-- 新結構:vendors(廠商)→ schools(校,可能跨廠商 — 同一校在不同廠商代理)
--                       → campuses(校區)
--
-- 5 廠商初始:EP / ILSC / EC / Kaplan / SGIC
--
-- 套用時機:等 Claude Design 交付 + 整合 phase 開工才正式套用。
--
-- 應用順序:本檔之後是 _DRAFT_tuition_tiers_extension.sql

CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,           -- 'EP', 'ILSC', 'EC', 'Kaplan', 'SGIC'
  name_zh TEXT NOT NULL,                -- 中文全名
  name_en TEXT NOT NULL,                -- 英文全名
  sort_order INT DEFAULT 100,           -- 顯示順序
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- schools 加 vendor_id FK
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id);

-- Seed 5 廠商
INSERT INTO vendors (slug, name_zh, name_en, sort_order) VALUES
  ('EP',     'English Path 語言學校', 'English Path',                       10),
  ('ILSC',   'ILSC 語言學校',           'International Language Schools of Canada', 20),
  ('EC',     'EC 英語學校',             'EC English Language Centres',       30),
  ('Kaplan', 'Kaplan 語言學校',         'Kaplan International Languages',    40),
  ('SGIC',   'SGIC 語言學校',           'SGIC International College',         50)
ON CONFLICT (slug) DO NOTHING;

-- 驗證(套用後跑):
-- SELECT * FROM vendors ORDER BY sort_order;
-- 預期:5 列
