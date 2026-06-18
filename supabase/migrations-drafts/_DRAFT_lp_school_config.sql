-- Group 2 B 草稿(NOT APPLY)— 新增 lp_school_config 表
--
-- 用途:LP 諮詢模式內,每張 LP 對每校的「方案配置」(course/週數/住宿/反應/即時備注)。
-- 詳見 design prompt v3 區塊 3「LP 諮詢模式」。
--
-- 為什麼獨立表(不塞 generated_pages.advisor_notes JSONB):
--   - 每校配置複雜度高(課程/週數/住宿/雜費/折扣/反應/備注/試算金額)
--   - 顧問 demo 中即時更新,獨立表 partial update 容易
--   - 之後分析「同學校的不同配置」要 query,獨立表好做
--
-- 套用時機:LP 諮詢模式落地時

CREATE TABLE IF NOT EXISTS lp_school_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 關聯
  lp_id UUID NOT NULL REFERENCES generated_pages(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id),

  -- 顧問 demo 中選的方案
  program_id UUID REFERENCES programs(id),  -- 選哪個課程
  weeks INT,                                  -- 上課週數
  start_date DATE,                            -- 預計開始日
  housing_id UUID REFERENCES housing(id),     -- 選哪個住宿
  extras JSONB DEFAULT '[]'::jsonb,           -- 額外勾選的雜費,e.g. [{name:'接機',price:80,currency:'CAD'}]

  -- 折扣
  discount JSONB DEFAULT '{"type":"原價","pct":0,"fixed":0,"schoolDiscount":null}'::jsonb,

  -- 學生反應(諮詢現場顧問點)
  reaction TEXT
    CHECK (reaction IN ('first_choice','interested','neutral','rejected')),
  -- first_choice ⭐ 第一推薦
  -- interested   ✓ 有興趣
  -- neutral      ◌ 中立
  -- rejected     ✗ 不喜歡

  -- 即時備注(諮詢中顧問即時 key)
  advisor_note TEXT,

  -- 即時試算結果(snapshot,LP demo 完才用)
  estimated_total_twd INT,
  estimated_currency TEXT,
  estimated_original NUMERIC,

  -- meta
  position INT DEFAULT 0,                     -- LP 內該校的展示順序(拖拉排序用)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lp_school_config_lp_idx ON lp_school_config(lp_id);
CREATE INDEX IF NOT EXISTS lp_school_config_school_idx ON lp_school_config(school_id);
CREATE INDEX IF NOT EXISTS lp_school_config_reaction_idx ON lp_school_config(reaction);

-- dedup 約束:同 LP 同校只一條
CREATE UNIQUE INDEX IF NOT EXISTS lp_school_config_lp_school_idx
  ON lp_school_config(lp_id, school_id);

-- 驗證:
-- SELECT COUNT(*) FROM lp_school_config;
