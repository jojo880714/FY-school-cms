-- LP 內容欄位升級包 — Phase 2 補 5 段渲染所需資料層
-- 對應 Step 3 5 段渲染:
--   ① 氛圍/情感段(mood_*)
--   ② 在當地的一天 sec08(day_schedule)
--   ③ 學員見證 sec_voices(voices,取代「schema 尚無 testimonials」placeholder)
--   ④ 校區照片 sec_photos(photos,advisor-only)
--   ⑤ FAQ sec_faq(faq)
--
-- 命名:lp_ 前綴(避開「Phase 20 entity 凍住」域)
--
-- 設計原則:
-- - 純 additive(IF NOT EXISTS / CREATE TABLE IF NOT EXISTS)
-- - 4 新表全 school_id FK ON DELETE CASCADE(刪 school 自動清子 row)
-- - faq.school_id 可 NULL(通用 FAQ 全 LP 共用,例:簽證 / 退費等通則)
-- - photos sort_order + caption 支援 LP advisor 段 masonry 排序
-- - 既有 25 LP html_content 不受影響(view-page 不重新生成)

-- A. schools 加 4 欄(氛圍/情感段)
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS mood_tag   TEXT,
  ADD COLUMN IF NOT EXISTS mood_desc  TEXT,
  ADD COLUMN IF NOT EXISTS mood_scene TEXT,
  ADD COLUMN IF NOT EXISTS pills      TEXT[];

COMMENT ON COLUMN schools.mood_tag   IS '氛圍標語(短,變體 C / 氛圍段 hero 用)';
COMMENT ON COLUMN schools.mood_desc  IS '氛圍描述句';
COMMENT ON COLUMN schools.mood_scene IS '場景金句(quote-box)';
COMMENT ON COLUMN schools.pills      IS '氛圍 chip 標籤陣列';

-- B. city_info 加 1 欄(機票估算)
ALTER TABLE city_info
  ADD COLUMN IF NOT EXISTS flight_estimate TEXT;

COMMENT ON COLUMN city_info.flight_estimate IS '台灣飛當地的機票估算範圍(台幣)';

-- C. 新表 day_schedule(在當地的一天 sec08)
CREATE TABLE IF NOT EXISTS day_schedule (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID REFERENCES schools(id) ON DELETE CASCADE,
  campus      TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  time        TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_day_schedule_school ON day_schedule(school_id);
COMMENT ON TABLE day_schedule IS '一天時間軸(LP sec08「在當地的一天」,每校多 row,sort_order 排序)';

-- D. 新表 voices(學員見證 sec_voices)
CREATE TABLE IF NOT EXISTS voices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID REFERENCES schools(id) ON DELETE CASCADE,
  quote           TEXT NOT NULL,
  student_name    TEXT,
  student_detail  TEXT,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_voices_school ON voices(school_id);
COMMENT ON TABLE voices IS '學員見證(LP sec_voices,取代「schema 尚無 testimonials」placeholder)';

-- E. 新表 faq(FAQ sec_faq;school_id NULL = 通用 FAQ 全 LP 共用)
CREATE TABLE IF NOT EXISTS faq (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID REFERENCES schools(id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_faq_school ON faq(school_id);
COMMENT ON TABLE faq IS 'FAQ(LP sec_faq;school_id NULL = 通用 FAQ 全 LP 共用)';

-- F. 新表 photos(校區照片 sec_photos,advisor-only)
CREATE TABLE IF NOT EXISTS photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID REFERENCES schools(id) ON DELETE CASCADE,
  campus      TEXT,
  image_url   TEXT NOT NULL,
  caption     TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_photos_school ON photos(school_id);
COMMENT ON TABLE photos IS '校區照片(LP sec_photos advisor-only 段,顧問檢視才露出)';

-- 驗證 SQL:
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='schools' AND column_name IN ('mood_tag','mood_desc','mood_scene','pills');
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='city_info' AND column_name='flight_estimate';
-- SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('day_schedule','voices','faq','photos') AND table_schema='public';
