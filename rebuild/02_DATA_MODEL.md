# 02 — DATA MODEL（資料模型規格,SKU-first,含 DDL）

> 本章是 FY-school-cms **乾淨重建版**的資料層 single source of truth。
> 立場(rebuild stance):保留既有 stack（Postgres/Supabase）、沿用既有資料與已測過的報價引擎，但把
> **SKU + 4 張 LP 內容表 + quotations + 正確 RLS** 從 day 1 就做成一等公民,而不是事後 `ALTER TABLE` 補丁。
> 現行 DB 是 7 張 base 表經過 14 次 additive migration 疊出來的;`tuition_tiers` 至今只有 random UUID、沒有穩定 SKU;
> `quotations / vendors / cases / lp_school_config` 全部停在 `migrations-drafts/`(從未 apply)。本章把這些一次收斂成一份可直接建庫的 DDL。

---

## 0. 設計原則(讀 DDL 前先讀這段)

1. **SKU-first**:可售原子單位 = 一筆 `tuition_tiers`(program × campus × week-band × currency × validity)。
   每筆都要有穩定的 `sku`(`VARCHAR`,衍生 label)+ 一條覆蓋完整 grain 的 `UNIQUE` 約束。random UUID 只當內部 PK,**不再是身分**。
2. **Vendor 是字串 slug,不建 vendors 表**。`schools.vendor` 直接存 `'ILAC' | 'ILSC' | 'KAP' | 'EC' | 'CG'`。
   理由:Nexus master plan 把 vendors 列為 frozen entity,CMS 不該自己長一張 vendors 表跟它打架;報價引擎 `Vendor` 型別本來就是 `string`。
3. **RLS 從 day 1 開**:每張表 `ENABLE ROW LEVEL SECURITY`。
   - 讀寫一律 `TO authenticated`(顧問前端走 ProtectedRoute + useAuth,是 authenticated session)。
   - **永遠不寫 `TO anon`**(anon 在本系統完全不使用)。
   - Cloudflare Worker 與 `generate-page` EF 用 **service_role**,service_role bypass RLS,所以「公開 LP 產生」這條路徑不靠任何 anon policy。
   - 寫入(INSERT/UPDATE/DELETE)在 MVP 由 EF/service_role 與顧問端共用;policy 給 authenticated 完整 CRUD,危險批次寫入走 service_role。
4. **公開 LP 無 runtime DB**:Worker 服務的是 EF 在「產生當下」烤好的 static cached HTML。任何 LP 互動所需資料,必須由 EF 在產生時序列化成 **JSON data island** 一起寫進 `generated_pages.html_content`(或獨立 `data_json` 欄,見 §3.8)。資料表本身不被公開 runtime 直接讀。
5. **Nexus-safe snapshot**:`quotations` 是凍結快照——FK 全部 nullable、`vendor` 存字串、金額與顯示值 **copy 進 JSONB 而非存 UUID 參照**;`case_id` 不建 cases FK(cases 是 frozen entity)。Nexus 接管後,舊報價單不會因為 CMS 改 schema / Nexus 改 entity 而壞掉。
6. **純 additive 思維保留**:所有 `created_at/updated_at/deleted_at` 標配;軟刪除用 `deleted_at`;新內容表全 `ON DELETE CASCADE` 掛回 `schools`。
7. **`code` 是自然鍵,不是裝飾**:`campuses.code` / `programs.code` 是 SKU 的組成 token,必須穩定、人類可讀、ASCII slug。重建時先 nullable 灌資料,backfill 完成後立刻 `SET NOT NULL`。

---

## 1. 與現行 schema 的差異總表(rebuild diff）

| 主題 | 現行(疊出來的) | 重建版(本章) | 為什麼改 |
|---|---|---|---|
| 廠商層 | 無;`schools` flat 列。draft 想建 `vendors` 表 + `schools.vendor_id` | **不建 vendors 表**;`schools.vendor TEXT NOT NULL`(slug) | Nexus frozen entity,不重複造表;報價引擎 `Vendor=string` |
| SKU | 無;`tuition_tiers` 只有 random UUID | `tuition_tiers.sku VARCHAR(64) NOT NULL` 衍生 label + grain `UNIQUE` | 可售單位需要穩定身分,給報價/對帳/Nexus 引用 |
| tuition grain 唯一性 | 無唯一約束,可重複插同一 grain | `UNIQUE(program_id,campus_id,weeks_min,weeks_max,currency,valid_from)` | 防重複報價基準、SKU 對應一筆 |
| `campuses.code` | 無 | `code TEXT`(backfill 後 `NOT NULL`),`UNIQUE(school_id,code)` | SKU token、穩定參照 |
| `programs.code` | 無 | `code TEXT`(backfill 後 `NOT NULL`),`UNIQUE(school_id,code)` | SKU token、穩定參照 |
| `tuition_tiers` 報價欄 | draft 想 `ALTER` 加 `fixed/peak/unit/category` | day 1 內建 `fixed/peak/unit/category` | 報價引擎 `PricingTier`/`Fee` 需要 |
| LP 內容表 | `day_schedule/voices/faq/photos` 已 apply,但**無 RLS、無 `campus_id` FK**(用 `campus TEXT`) | 4 表保留,改掛 `campus_id UUID FK`(nullable),全開 RLS | 正規化、可 join、RLS 補齊 |
| quotations | draft,從未 apply;`payload/result JSONB` 已對齊引擎 | day 1 建表;`vendor` 字串、FK 全 nullable、`quote_number` 用 sequence+trigger | Nexus-safe snapshot first-class |
| cases | draft;`generated_pages.case_id` 有 FK | **保留 cases 表本身**(CMS 內輕量),但 `generated_pages.case_id` 與 `quotations.case_id` **不建 FK**(僅 index) | cases 將被 Nexus/CRM 接管,FK 會綁死 |
| lp_school_config | draft;掛 `programs/housing` FK | day 1 建表,全開 RLS | 諮詢模式每校配置需要 |
| RLS | base 表多半靠 service_role,policy 不齊 | 每張表 `ENABLE RLS` + `TO authenticated` policy | day 1 安全姿態 |
| anon policy | 散落、不該存在 | **零 anon policy** | anon 不使用 |

---

## 2. 建表依賴順序(dependency order)

```
1.  schools             （根;vendor 字串、無外部 FK）
2.  city_info           （獨立;被 campuses 用 city 文字對應,不建硬 FK）
3.  campuses            → schools
4.  programs            → schools
5.  tuition_tiers       → programs, campuses     ★ SKU + grain UNIQUE
6.  housing             → schools
7.  day_schedule        → schools, campuses
8.  voices              → schools, campuses
9.  faq                 → schools(nullable)
10. photos              → schools, campuses
11. cases               （CMS 內輕量;advisor_id=auth.users）
12. generated_pages     → schools[], campuses[]；case_id 僅 index（無 FK）
13. lp_school_config    → generated_pages, schools, programs, housing
14. quotations          → (全 nullable) generated_pages/schools；case_id 無 FK ★ Nexus-safe
15. 共用:set_updated_at() trigger fn、quote_number sequence+trigger、RLS policies
```

> 規則:被參照者先建。`tuition_tiers`(5)必須在 `programs`(4)、`campuses`(3)之後;`lp_school_config`(13)、`quotations`(14)放最後,因為它們參照 `generated_pages`(12)。

---

## 3. 逐表規格 + 完整 DDL

> 共通約定:所有表 `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`;`created_at/updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`;
> 軟刪除用 `deleted_at TIMESTAMPTZ`(NULL = 存活)。`updated_at` 由共用 trigger `set_updated_at()` 自動維護(§4)。
> 幣別欄一律 ISO code `CHECK (currency IN ('CAD','USD','GBP','AUD','EUR','NZD','TWD'))`,與報價引擎 `Currency` 型別對齊。

### 3.0 共用 enum / domain / 函式(先建)

```sql
-- 幣別 ISO code（對齊 src/lib/quotation/types.ts Currency）
DO $$ BEGIN
  CREATE DOMAIN currency_code AS TEXT
    CHECK (VALUE IN ('CAD','USD','GBP','AUD','EUR','NZD','TWD'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 計價單位（對齊 PricingUnit）
DO $$ BEGIN
  CREATE DOMAIN pricing_unit AS TEXT
    CHECK (VALUE IN ('按週計算','每週','按堂計算','按天計算','固定金額'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- updated_at 自動維護
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

### 3.1 `schools` — 學校(品牌層)

**用途**:每間語校一筆。是 campuses/programs/housing/LP 內容表的根。重建版新增 `vendor`(字串 slug)作為廠商身分,並把氛圍/情感段欄位(`mood_*`/`pills`)與 Section 內容欄位內建。

**Keys / 約束**
- PK `id`。
- `slug TEXT NOT NULL UNIQUE`:學校層穩定 slug(SKU 不直接用 school slug,但人類可讀路由用)。
- `vendor TEXT NOT NULL`:廠商 slug,5 MVP = `ILAC/ILSC/KAP/EC/CG`。用 `CHECK` 限制初期值(可放寬)。
- `UNIQUE(vendor, name)`:同廠商不重複學校名。

**RLS**:`ENABLE`;SELECT/INSERT/UPDATE/DELETE `TO authenticated`。EF 讀走 service_role。

```sql
CREATE TABLE schools (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                       TEXT NOT NULL UNIQUE,
  vendor                     TEXT NOT NULL
                               CHECK (vendor IN ('ILAC','ILSC','KAP','EC','CG')),
  name                       TEXT NOT NULL,                 -- 短名/通用名 e.g. 'ILAC'
  full_name                  TEXT,                          -- 全名
  country                    TEXT NOT NULL DEFAULT 'Canada',
  founded                    INTEGER,
  english_only_policy        BOOLEAN,
  english_only_policy_label  TEXT,                          -- 顧問用語化（<12 字）
  accreditation              TEXT[],
  nationality_count          INTEGER,
  nationality_breakdown      JSONB NOT NULL DEFAULT '[]'::jsonb,
                               -- [{"flag":"🇪🇸","name":"西班牙","pct":24}, ...]
  class_size_typical         INTEGER,
  class_size_max             INTEGER,
  min_age                    INTEGER,
  strengths                  TEXT[],
  suitable_for               TEXT[],
  persona_match              TEXT[] NOT NULL DEFAULT '{}',
                               -- exam_prep/pathway_uni/pathway_grad/working_holiday/
                               -- career_change/gap_year/pr_immigration（7 個計分 tag）
  one_liner                  TEXT,                          -- Section 2 TLDR（<40 字）
  -- 氛圍/情感段（LP sec04 / 變體 C）
  mood_tag                   TEXT,
  mood_desc                  TEXT,
  mood_scene                 TEXT,
  pills                      TEXT[],
  notes                      TEXT,                          -- 顧問補充
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at                 TIMESTAMPTZ,
  UNIQUE (vendor, name)
);

CREATE INDEX idx_schools_vendor  ON schools(vendor) WHERE deleted_at IS NULL;
CREATE INDEX idx_schools_country ON schools(country) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_schools_updated
  BEFORE UPDATE ON schools
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

> **Diff**:現行 `schools` 無 `vendor`、無 `slug`、`top_nationalities` 已被 18b drop(本表不含)。重建版把 `vendor` 設 `NOT NULL`、`nationality_breakdown` 設 `NOT NULL DEFAULT '[]'`。

---

### 3.2 `city_info` — 城市資訊(獨立表)

**用途**:每個城市一筆。被 `campuses.city` 以**文字**對應(`city` 必須一字不差),刻意不建硬 FK(沿用現行匯入慣例,城市是參考資料)。

**Keys / 約束**:`UNIQUE(city, country)`。

```sql
CREATE TABLE city_info (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city                     TEXT NOT NULL,
  country                  TEXT NOT NULL DEFAULT 'Canada',
  climate                  TEXT,
  population               TEXT,                  -- 字串避免單位處理
  cost_of_living_monthly   INTEGER,
  cost_of_living_currency  currency_code DEFAULT 'CAD',
  highlights               TEXT[],
  visa_options             TEXT[],
  flight_estimate          TEXT,                  -- 台灣飛當地機票估算（TWD 範圍）
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (city, country)
);

CREATE TRIGGER trg_city_info_updated
  BEFORE UPDATE ON city_info
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

> **Diff**:現行 `cost_of_living_monthly_cad` 已被 18b drop;重建版只留通用 `cost_of_living_monthly + cost_of_living_currency`。加 `UNIQUE(city,country)`(現行無)。

---

### 3.3 `campuses` — 校區(地點)

**用途**:一校多城市,每校區一筆。**重建版新增 `code`**(SKU token)。

**Keys / 約束**
- FK `school_id → schools(id) ON DELETE CASCADE`。
- `code TEXT`:校區 slug,ASCII,e.g. `TOR`、`VAN`、`LON`。backfill 後 `SET NOT NULL`。
- `UNIQUE(school_id, code)`:同校內校區 code 唯一(SKU 穩定性的基礎)。

```sql
CREATE TABLE campuses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code          TEXT,                  -- ★ SKU token；backfill 後 SET NOT NULL
  city          TEXT NOT NULL,         -- 與 city_info.city 一致
  metro_station TEXT,
  walk_minutes  INTEGER,
  highlight     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  UNIQUE (school_id, code)
);

CREATE INDEX idx_campuses_school ON campuses(school_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_campuses_city   ON campuses(city);

CREATE TRIGGER trg_campuses_updated
  BEFORE UPDATE ON campuses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- backfill 後執行：
-- UPDATE campuses SET code = ... WHERE code IS NULL;  -- 顧問/腳本灌值
-- ALTER TABLE campuses ALTER COLUMN code SET NOT NULL;
```

> **Diff**:現行用 `campus TEXT` 散落各內容表、`campuses` 無 `code`。重建版加 `code` + `UNIQUE(school_id,code)`,讓 SKU 與內容表都改用 `campus_id`。

---

### 3.4 `programs` — 課程方案

**用途**:每校多課程(General English / IELTS / Business …)。**重建版新增 `code`**(SKU token)。

**Keys / 約束**
- FK `school_id → schools(id) ON DELETE CASCADE`。
- `code TEXT`:課程 slug,ASCII,e.g. `GE`、`IELTS`、`PWR`。backfill 後 `SET NOT NULL`。
- `UNIQUE(school_id, code)`。

```sql
CREATE TABLE programs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code           TEXT,                 -- ★ SKU token；backfill 後 SET NOT NULL
  name           TEXT NOT NULL,        -- 'General English'
  category       TEXT,                 -- 課程類別（對齊報價引擎 Course.category）
  hours_per_week INTEGER,
  schedule       TEXT,
  entry_level    TEXT,                 -- 入學門檻（CEFR/IELTS）
  outcome_level  TEXT,                 -- 學成 outcome
  min_weeks      INTEGER,              -- 該課程最短週數（Section 5）
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  UNIQUE (school_id, code)
);

CREATE INDEX idx_programs_school ON programs(school_id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_programs_updated
  BEFORE UPDATE ON programs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- backfill 後執行：
-- ALTER TABLE programs ALTER COLUMN code SET NOT NULL;
```

> **Diff**:現行 `programs` 無 `code`、無 `category`。重建版加 `code` + `category`(報價引擎按 category 分群明細)。

---

### 3.5 `tuition_tiers` — 學費價位（★ 可售原子單位 / SKU 之家）

**用途**:**這是整個系統唯一的「可售 SKU」**。一筆 = 一個可報價的價位點 = `program × campus × week-band × currency × validity`。報價引擎 `calculate()` 以這層為基準算 6 層定價。

**Keys / 約束(本章最重要)**
- PK `id`(內部用,**不再是身分**)。
- **`sku VARCHAR(64) NOT NULL`**:衍生 label,格式 `VENDOR-CAMPUS-PROGRAM-WEEKS-CUR`,
  e.g. `ILAC-TOR-GE-12_23-CAD`、`EC-LON-IELTS-24P-USD`。由 trigger 在 INSERT/UPDATE 時組出(§4)。
  `WEEKS` token = `{weeks_min}_{weeks_max}`,`weeks_max IS NULL`(開放上限)時用 `{weeks_min}P`(P=plus)。
- **`UNIQUE(sku)`**:對外引用鍵(報價單、Nexus、對帳)。
- **`UNIQUE(program_id, campus_id, weeks_min, weeks_max, currency, valid_from)`**:
  **完整 grain 自然鍵**——同課程同校區同週段同幣別同生效日不可重複。這是防止「同一可售單位被插兩次」的硬約束。
  > 注意:`campus_id` 允許 NULL(語意=跨校區同價)。Postgres 預設 NULL 在 UNIQUE 中互不相等,
  > 為避免「多筆 campus_id=NULL 同 grain」漏網,額外建一條 `NULLS NOT DISTINCT` 唯一索引(PG15+),見下。
- FK `program_id → programs(id) ON DELETE CASCADE`(必填);`campus_id → campuses(id) ON DELETE SET NULL`(nullable)。

**RLS**:`TO authenticated` 全 CRUD;EF/匯入腳本走 service_role。

```sql
CREATE TABLE tuition_tiers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- SKU 衍生 label（由 trigger 維護）
  sku            VARCHAR(64) NOT NULL,

  -- grain：program × campus × week-band × currency × validity
  program_id     UUID NOT NULL REFERENCES programs(id)  ON DELETE CASCADE,
  campus_id      UUID          REFERENCES campuses(id)  ON DELETE SET NULL,
  weeks_min      INTEGER NOT NULL,
  weeks_max      INTEGER,                  -- NULL = 開放上限（24+）
  currency       currency_code NOT NULL DEFAULT 'CAD',
  valid_from     DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until    DATE,

  -- 定價（對齊報價引擎 PricingTier / Fee）
  price_per_week NUMERIC NOT NULL DEFAULT 0,
  fixed          NUMERIC NOT NULL DEFAULT 0,   -- 固定金額（替代 price，如註冊費）
  peak           NUMERIC NOT NULL DEFAULT 0,   -- 尖峰季加價（每單位額外加）
  unit           pricing_unit NOT NULL DEFAULT '按週計算',
  category       TEXT,                          -- 課程/教材/註冊/銀行/行政

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,

  -- ★ 完整 grain 自然鍵
  CONSTRAINT tuition_tiers_grain_uniq
    UNIQUE (program_id, campus_id, weeks_min, weeks_max, currency, valid_from),

  -- ★ SKU 對外唯一
  CONSTRAINT tuition_tiers_sku_uniq UNIQUE (sku),

  -- 週段合法性
  CONSTRAINT tuition_tiers_weeks_chk
    CHECK (weeks_max IS NULL OR weeks_max >= weeks_min)
);

-- 補強：campus_id=NULL 也要參與 grain 去重（PG15+ NULLS NOT DISTINCT）
CREATE UNIQUE INDEX tuition_tiers_grain_nullsafe
  ON tuition_tiers (program_id, campus_id, weeks_min, weeks_max, currency, valid_from)
  NULLS NOT DISTINCT;

CREATE INDEX idx_tuition_program ON tuition_tiers(program_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tuition_campus  ON tuition_tiers(campus_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_tuition_sku     ON tuition_tiers(sku);

CREATE TRIGGER trg_tuition_updated
  BEFORE UPDATE ON tuition_tiers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

> **Diff(最大)**:現行 `tuition_tiers` 只有 `id, program_id, campus_id, weeks_min, weeks_max, price_per_week, currency, valid_from, valid_until`——**無 SKU、無 grain UNIQUE、無 fixed/peak/unit/category**。
> 重建版把 draft 的 `tuition_tiers_extension`(fixed/peak/unit/category)併進來,並第一次加上 `sku` + grain `UNIQUE`。
> SKU token 對照:`VENDOR` 來自 `schools.vendor`(經 program→school join)、`CAMPUS`=`campuses.code`(NULL 時用 `ALL`)、`PROGRAM`=`programs.code`。

---

### 3.6 `housing` — 住宿

**用途**:每校多住宿選項;報價引擎 `Accommodation` 的資料源。

```sql
CREATE TABLE housing (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  type              TEXT NOT NULL,          -- Homestay/Residence/Apartment/Hotel
  subtype           TEXT,
  price_per_week    NUMERIC NOT NULL DEFAULT 0,
  fixed             NUMERIC NOT NULL DEFAULT 0,
  unit              pricing_unit NOT NULL DEFAULT '按週計算',
  currency          currency_code NOT NULL DEFAULT 'CAD',
  includes          TEXT,                   -- 早餐/半膳/自理（Section 8）
  commute_to_school TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_housing_school ON housing(school_id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_housing_updated
  BEFORE UPDATE ON housing
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

> **Diff**:重建版加 `fixed/unit`(對齊報價引擎 `Accommodation`,現行 housing 無這兩欄)。

---

### 3.7 LP 內容表 ×4(`day_schedule` / `voices` / `faq` / `photos`)

**用途**:23-section LP 的內容資料層。EF 在產生時把它們 join 出來序列化進 data island。
**重建版改動**:`campus TEXT` → `campus_id UUID FK`(nullable,語意=該校通用);全 4 表 day 1 開 RLS。

```sql
-- 在當地的一天（LP sec08 時間軸）
CREATE TABLE day_schedule (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  campus_id   UUID          REFERENCES campuses(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  time        TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_day_schedule_school ON day_schedule(school_id);

-- 學員見證（LP sec_voices）
CREATE TABLE voices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  campus_id      UUID          REFERENCES campuses(id) ON DELETE CASCADE,
  quote          TEXT NOT NULL,
  student_name   TEXT,
  student_detail TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_voices_school ON voices(school_id);

-- FAQ（LP sec_faq；school_id NULL = 通用 FAQ 全 LP 共用）
CREATE TABLE faq (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID          REFERENCES schools(id) ON DELETE CASCADE,  -- nullable=通用
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_faq_school ON faq(school_id);

-- 校區照片（LP sec_photos，advisor-only）
CREATE TABLE photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  campus_id   UUID          REFERENCES campuses(id) ON DELETE CASCADE,
  image_url   TEXT NOT NULL,
  caption     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_photos_school ON photos(school_id);
```

> **Diff**:現行 4 表用 `campus TEXT`,且 migration 未建任何 RLS policy。重建版改 `campus_id UUID FK`、`faq.school_id` 保留 nullable(通用 FAQ)、其餘 `school_id NOT NULL`,並全部納入 §5 的 RLS 批次。

---

### 3.8 `generated_pages` — LP 頁面(顧問 case 倉庫 + 烤好的 HTML)

**用途**:一張 LP 一筆。存 EF 烤出的 `html_content`(含 data island)、學生諮詢資料、LP 渲染 hint(`card_variant`/`template_version`)。Worker 對外服務的就是這張表的 `html_content`。

**Keys / 約束**
- `slug TEXT NOT NULL UNIQUE`:公開 URL 路由鍵。
- `school_ids UUID[]` / `campus_ids UUID[]`:這張 LP 選了哪些校/校區(陣列,非 FK)。
- `case_id UUID`:**僅 index,不建 cases FK**(case 將被 Nexus/CRM 接管,FK 會綁死遷移)。

**新增 `data_json JSONB`**:把 data island 與 HTML 拆開存(現行塞在 html_content 字串裡)。Worker 仍只吐 `html_content`;`data_json` 給 EF 重生與未來分析用。

```sql
CREATE TABLE generated_pages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               TEXT NOT NULL UNIQUE,
  title              TEXT,
  html_content       TEXT,                  -- EF 烤好的 static HTML（含 data island）
  data_json          JSONB,                 -- ★ 結構化 data island（重生/互動用）
  school_ids         UUID[] NOT NULL DEFAULT '{}',
  campus_ids         UUID[] NOT NULL DEFAULT '{}',

  -- LP 渲染 hint
  style              TEXT,                  -- EF style 參數
  card_variant       TEXT NOT NULL DEFAULT 'A'
                       CHECK (card_variant IN ('A','B','C','D')),
  template_version   TEXT NOT NULL DEFAULT 'scroll_v1'
                       CHECK (template_version IN ('legacy','scroll_v1')),

  -- 學生諮詢（demo 階段可全 NULL）
  case_id            UUID,                  -- ★ 僅 index，無 cases FK（Nexus-safe）
  student_name       TEXT,
  student_contact    TEXT,
  consultation_date  DATE DEFAULT CURRENT_DATE,
  consultation_notes TEXT,

  created_by         UUID,                  -- auth.users.id
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ,
  deleted_at         TIMESTAMPTZ
);

CREATE INDEX idx_generated_pages_deleted_at ON generated_pages(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_generated_pages_case       ON generated_pages(case_id)    WHERE deleted_at IS NULL;
CREATE INDEX idx_generated_pages_slug       ON generated_pages(slug);

CREATE TRIGGER trg_generated_pages_updated
  BEFORE UPDATE ON generated_pages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

> **Diff**:重建版 (a) `template_version` 預設改 `scroll_v1`(新長頁是預設,legacy 只為相容保留);(b) 新增 `data_json` 拆出 data island;(c) `case_id` **不建 FK**(現行 draft 的 cases.sql 建了 FK——本章刻意移除);(d) `created_by` 補上。

---

### 3.9 `cases` — 案件(CMS 內輕量,Nexus 將接管)

**用途**:1 學生 = 1 案件,1 案件 = N 張 LP / N 張報價。CMS 內只做隱性建案 + funnel 狀態,**預留 `crm_case_id`** 給 Nexus 接管。

**Keys / 約束**
- `advisor_id UUID`:對應 `auth.users.id`(不建跨 schema FK)。
- dedup:`UNIQUE(advisor_id, student_name, COALESCE(student_contact,''))` partial(`deleted_at IS NULL`)。
- **被 `generated_pages.case_id` / `quotations.case_id` 以 ID 參照,但對方不建 FK**(單向、可斷)。

```sql
CREATE TABLE cases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name      TEXT NOT NULL,
  student_contact   TEXT,                  -- LINE / email / phone 任一
  consultation_date DATE DEFAULT CURRENT_DATE,
  status            TEXT NOT NULL DEFAULT 'in_consult'
                      CHECK (status IN ('in_consult','lp_done','quote_done','signed','abandoned')),
  advisor_id        UUID,                  -- auth.users.id
  crm_case_id       TEXT,                  -- ★ Nexus/CRM 接管預留
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX cases_advisor_idx ON cases(advisor_id) WHERE deleted_at IS NULL;
CREATE INDEX cases_status_idx  ON cases(status)      WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX cases_dedup_idx
  ON cases(advisor_id, student_name, COALESCE(student_contact, ''))
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_cases_updated
  BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

> **Diff**:draft 在 `generated_pages` 上建了 `case_id ... REFERENCES cases(id)`。**本章移除該 FK**——cases 是 frozen/未來遷移的 entity,反向硬 FK 會卡住 Nexus 接管。CMS 仍可 join,只是靠 index 不靠 referential integrity。

---

### 3.10 `lp_school_config` — LP 諮詢模式每校配置

**用途**:諮詢模式內,每張 LP 對每校的即時方案配置(課程/週數/住宿/折扣/學生反應/即時試算)。獨立表方便 partial update 與後續分析。

**Keys / 約束**
- FK `lp_id → generated_pages(id) ON DELETE CASCADE`(必填)。
- FK `school_id → schools(id)`;`program_id → programs(id)`;`housing_id → housing(id)`(後三者皆 CMS 內穩定 entity,建 FK 安全)。
- `UNIQUE(lp_id, school_id)`:同 LP 同校只一條。

```sql
CREATE TABLE lp_school_config (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lp_id               UUID NOT NULL REFERENCES generated_pages(id) ON DELETE CASCADE,
  school_id           UUID NOT NULL REFERENCES schools(id),
  program_id          UUID          REFERENCES programs(id),
  weeks               INTEGER,
  start_date          DATE,
  housing_id          UUID          REFERENCES housing(id),
  extras              JSONB NOT NULL DEFAULT '[]'::jsonb,
  discount            JSONB NOT NULL
                        DEFAULT '{"type":"原價","pct":0,"fixed":0,"schoolDiscount":null}'::jsonb,
  reaction            TEXT CHECK (reaction IN ('first_choice','interested','neutral','rejected')),
  advisor_note        TEXT,
  -- 即時試算 snapshot
  estimated_total_twd INTEGER,
  estimated_currency  currency_code,
  estimated_original  NUMERIC,
  position            INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lp_id, school_id)
);

CREATE INDEX lp_school_config_lp_idx       ON lp_school_config(lp_id);
CREATE INDEX lp_school_config_school_idx   ON lp_school_config(school_id);
CREATE INDEX lp_school_config_reaction_idx ON lp_school_config(reaction);

CREATE TRIGGER trg_lp_school_config_updated
  BEFORE UPDATE ON lp_school_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

### 3.11 `quotations` — 報價單(★ Nexus-safe snapshot)

**用途**:顧問每開一張報價存一筆。**這是凍結快照**:`payload`=`QuotationInput`、`result`=`QuotationResult`(直接是報價引擎 `calculate()` 的入出),金額抽出來方便 index。報價跟 LP / 案件多對一。

**Nexus-safe 設計(逐條)**
- `vendor TEXT`:**存字串 slug**(不存 vendors UUID;本系統根本無 vendors 表)。
- `case_id UUID`:**不建 cases FK**(只 index)。
- `lp_id` / `school_id`:FK 但 **nullable + `ON DELETE SET NULL`**——LP 或 school 被刪,報價單金額仍完整(數字在 JSONB 裡)。
- 顯示用值(`final_twd` / `currency_primary` / `weeks` / `start_date`)**copy** 自 result,不靠 join 還原。
- `quote_number` 用 sequence + trigger 自動產(格式 `Q{YYYYMMDD}-{0001}`)。

**Keys / 約束**
- `quote_number TEXT UNIQUE`(由 trigger 填,不依賴前端)。
- `final_twd INTEGER NOT NULL`、`currency_primary currency_code NOT NULL`、`weeks INTEGER NOT NULL`。

```sql
-- 自動編號 sequence
CREATE SEQUENCE IF NOT EXISTS quote_number_seq START 1;

CREATE TABLE quotations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number     TEXT UNIQUE,                 -- 由 trigger 填，例 'Q20260626-0001'

  -- 關聯（全 nullable，Nexus-safe）
  case_id          UUID,                                         -- ★ 無 cases FK，僅 index
  lp_id            UUID REFERENCES generated_pages(id) ON DELETE SET NULL,
  school_id        UUID REFERENCES schools(id)         ON DELETE SET NULL,
  vendor           TEXT,                          -- ★ 廠商 slug 字串（非 UUID）

  -- 快照（= calculate() 的 input / output）
  payload          JSONB NOT NULL,                -- QuotationInput
  result           JSONB NOT NULL,                -- QuotationResult

  -- 從 result copy 出來方便 index 的顯示值
  final_twd        INTEGER NOT NULL,
  currency_primary currency_code NOT NULL,
  weeks            INTEGER NOT NULL,
  start_date       DATE,

  -- 狀態 / 期限
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','sent','accepted','rejected','expired')),
  valid_until      DATE,                          -- 預設 created_at + 7 天（app 層帶入）

  -- meta
  created_by       UUID,                          -- auth.users.id
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at          TIMESTAMPTZ,
  pdf_url          TEXT,
  notes            TEXT
);

CREATE INDEX quotations_case_idx       ON quotations(case_id);
CREATE INDEX quotations_lp_idx         ON quotations(lp_id);
CREATE INDEX quotations_status_idx     ON quotations(status);
CREATE INDEX quotations_created_by_idx ON quotations(created_by);
CREATE INDEX quotations_created_at_idx ON quotations(created_at DESC);

CREATE TRIGGER trg_quotations_updated
  BEFORE UPDATE ON quotations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

> **Diff**:draft 的 `quotations` 給 `case_id REFERENCES cases(id)`——本章移除該 FK 改純 index;新增 `vendor` 字串欄;`quote_number` 改由 trigger 自動產(draft 只建了 sequence 沒接 trigger,§4)。

---

## 4. Derived label triggers(SKU + quote_number)

### 4.1 `tuition_tiers.sku` 自動產生

格式 `VENDOR-CAMPUS-PROGRAM-WEEKS-CUR`。token 來源:
- `VENDOR` = `schools.vendor`(經 `programs.school_id` join)。
- `CAMPUS` = `campuses.code`(`campus_id IS NULL` → `ALL`)。
- `PROGRAM` = `programs.code`。
- `WEEKS` = `{weeks_min}_{weeks_max}`,`weeks_max IS NULL` → `{weeks_min}P`。
- `CUR` = `currency`。

```sql
CREATE OR REPLACE FUNCTION build_tuition_sku()
RETURNS TRIGGER AS $$
DECLARE
  v_vendor       TEXT;
  v_program_code TEXT;
  v_campus_code  TEXT;
  v_weeks        TEXT;
BEGIN
  SELECT s.vendor, p.code
    INTO v_vendor, v_program_code
    FROM programs p JOIN schools s ON s.id = p.school_id
   WHERE p.id = NEW.program_id;

  IF NEW.campus_id IS NULL THEN
    v_campus_code := 'ALL';
  ELSE
    SELECT code INTO v_campus_code FROM campuses WHERE id = NEW.campus_id;
  END IF;

  IF NEW.weeks_max IS NULL THEN
    v_weeks := NEW.weeks_min || 'P';
  ELSE
    v_weeks := NEW.weeks_min || '_' || NEW.weeks_max;
  END IF;

  NEW.sku := upper(v_vendor) || '-' || upper(v_campus_code) || '-' ||
             upper(v_program_code) || '-' || v_weeks || '-' || NEW.currency;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tuition_sku
  BEFORE INSERT OR UPDATE OF program_id, campus_id, weeks_min, weeks_max, currency
  ON tuition_tiers
  FOR EACH ROW EXECUTE FUNCTION build_tuition_sku();
```

> 因為 `programs.code` / `campuses.code` 重建後是 `NOT NULL`,SKU 永遠可組出。backfill 階段(code 仍 nullable)時,trigger 對 NULL code 會產出含 `NULL` 字面的壞 SKU——所以 **先灌 code、再 SET NOT NULL、最後一次性 `UPDATE tuition_tiers SET sku = sku`** 觸發重算。

### 4.2 `quotations.quote_number` 自動產生

```sql
CREATE OR REPLACE FUNCTION build_quote_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quote_number IS NULL THEN
    NEW.quote_number := 'Q' || to_char(now(),'YYYYMMDD') || '-' ||
                        lpad(nextval('quote_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_quote_number
  BEFORE INSERT ON quotations
  FOR EACH ROW EXECUTE FUNCTION build_quote_number();
```

---

## 5. RLS — 統一姿態(每張表)

**規則(day 1 一致套用)**
- 每張表 `ENABLE ROW LEVEL SECURITY`。
- policy 一律 `TO authenticated`;**沒有任何 `TO anon` policy**。
- service_role bypass RLS(EF / Worker generate / 匯入腳本走這條)——不需也不應為它寫 policy。
- MVP 顧問共享資料池:authenticated 給 `SELECT/INSERT/UPDATE/DELETE` 全開(顧問彼此可見彼此的 LP/報價);
  之後要做「只看自己的」時,把 `quotations` / `cases` / `generated_pages` 的 policy 收緊成 `created_by = auth.uid()` 即可,不動其餘表。

```sql
-- 內容/目錄表：authenticated 完整 CRUD
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'schools','city_info','campuses','programs','tuition_tiers','housing',
    'day_schedule','voices','faq','photos',
    'cases','generated_pages','lp_school_config','quotations'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format($f$
      CREATE POLICY %1$s_auth_all ON %1$I
        FOR ALL TO authenticated
        USING (true) WITH CHECK (true);
    $f$, t);
  END LOOP;
END $$;
```

> **未來收緊範本**(擇一表替換上面的 `USING(true)`):
> ```sql
> DROP POLICY quotations_auth_all ON quotations;
> CREATE POLICY quotations_owner ON quotations
>   FOR ALL TO authenticated
>   USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
> ```

---

## 6. data island(公開 LP 互動的橋)

因為 Worker runtime 無 DB,LP 互動(切校區、看不同方案、報價試算前的呈現)所需資料,必須由 `generate-page` EF 在**產生當下**從上述表 join 出來,序列化成一個 JSON object,同時:
1. 寫進 `generated_pages.data_json`(結構化、可重生/分析);
2. 以 `<script id="lp-data" type="application/json">…</script>` 內嵌進 `html_content`(Worker 直接吐這份 static HTML,前端 JS 從 DOM 讀)。

**data island 最小 schema(EF 產生時組)**
```jsonc
{
  "lp": { "slug": "...", "title": "...", "template_version": "scroll_v1", "card_variant": "C" },
  "schools": [
    {
      "id": "...", "vendor": "ILAC", "name": "ILAC", "country": "Canada",
      "one_liner": "...", "mood": { "tag": "...", "desc": "...", "scene": "...", "pills": ["..."] },
      "nationality_breakdown": [{ "flag": "🇪🇸", "name": "西班牙", "pct": 24 }],
      "campuses": [{ "id": "...", "code": "TOR", "city": "Toronto", "metro_station": "Yonge" }],
      "programs": [{ "code": "GE", "name": "General English", "min_weeks": 4,
        "tiers": [{ "sku": "ILAC-TOR-GE-12_23-CAD", "weeks_min": 12, "weeks_max": 23,
                    "price_per_week": 360, "currency": "CAD" }] }],
      "housing": [{ "type": "Homestay", "price_per_week": 270, "currency": "CAD", "includes": "半膳" }],
      "day_schedule": [...], "voices": [...], "photos": [...]
    }
  ],
  "faq": [{ "question": "...", "answer": "..." }]   // 通用 + 校級合併
}
```
> 設計重點:island 內所有可售項目都帶 `sku`,讓「LP demo → 開報價」可以用 SKU 一路串到 `quotations.payload`,不靠 UUID 在公開頁流轉。

---

## 7. 一頁總覽(全 14 表)

| # | 表 | 角色 | 關鍵約束 | RLS |
|---|---|---|---|---|
| 1 | `schools` | 學校(品牌層) | `UNIQUE(vendor,name)`、`vendor NOT NULL` | auth all |
| 2 | `city_info` | 城市參考 | `UNIQUE(city,country)` | auth all |
| 3 | `campuses` | 校區 | `code` + `UNIQUE(school_id,code)` | auth all |
| 4 | `programs` | 課程 | `code` + `UNIQUE(school_id,code)` | auth all |
| 5 | `tuition_tiers` | **可售 SKU** | `sku` + `UNIQUE(sku)` + **grain UNIQUE** | auth all |
| 6 | `housing` | 住宿 | `fixed/unit`(報價對齊) | auth all |
| 7 | `day_schedule` | LP sec08 | `campus_id` FK | auth all |
| 8 | `voices` | LP sec_voices | `campus_id` FK | auth all |
| 9 | `faq` | LP sec_faq | `school_id` nullable=通用 | auth all |
| 10 | `photos` | LP sec_photos | advisor-only 段 | auth all |
| 11 | `cases` | 案件(輕量) | dedup UNIQUE、`crm_case_id` 預留 | auth all |
| 12 | `generated_pages` | LP 頁面 | `slug UNIQUE`、`case_id` 無 FK、`data_json` | auth all |
| 13 | `lp_school_config` | 諮詢配置 | `UNIQUE(lp_id,school_id)` | auth all |
| 14 | `quotations` | **報價快照** | `quote_number` trigger、FK 全 nullable、`vendor` 字串、`case_id` 無 FK | auth all |
