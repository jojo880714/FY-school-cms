# 08 · CONSOLIDATION / MIGRATION PLAN（彙整與搬遷計畫）

> 本章是整套 rebuild spec kit 的「**怎麼從零開始而不丟東西**」實作章。
> 立場：clean rebuild app 結構，**保留**已驗證的 stack（React + Vite + TS + Supabase + Cloudflare Worker）、**搬遷**現有資料 + 已測過的報價引擎 + LP 設計，**重建** SKU / 23 段 LP / 報價流程 / 正確 RLS。
> 所有數字皆 2026-06-26 對現役 Supabase 專案 `uxxpagylkdljjaxslmyj` live 查核，非記憶。
> 衝突時以 `CLAUDE.md` > 本章 > 其他 docs。

---

## 8.0 一句話

現役系統的**資料與引擎是資產，app 結構與半套 LP 是負債**。搬遷策略 = 把 8 張內容資料表 + 27 個 legacy LP 的 `html_content` 當「凍結快照」原樣搬走，報價引擎 / LP 設計 / 過濾邏輯整包 carry over，其餘 UI 與 schema 在新骨架重建。**Cut-over 的單一成敗點 = 27 個 legacy LP 學生還看得到。**

---

## 8.1 現役系統 INVENTORY（live 查核，2026-06-26）

### 8.1.1 連線座標（搬遷起點）

| 項 | 值 |
|---|---|
| 現役 Supabase project ref | `uxxpagylkdljjaxslmyj` |
| Supabase URL | `https://uxxpagylkdljjaxslmyj.supabase.co` |
| EF `generate-page` | **v39** ACTIVE（verify_jwt=true）— 注意：`PROJECT_STATUS.md` 寫 v28 已過期 |
| EF `view-page` | **v7** ACTIVE（verify_jwt=false）— docs 寫 v6 已過期 |
| Cloudflare Worker | 讀 `generated_pages.html_content`，service_role，`?slug=` 路由，邊緣 cache `s-maxage=300` |
| 後台 demo | gh-pages `https://jojo880714.github.io/FY-school-cms/` |
| LP 設計源 | `/Users/jojowu/fanyang-consult/fanyang-consult.html`（5257 行，23 段） |
| 資料 master sheet | Google Sheet `1gOMXk_9efJ-IaXbdjMoRwI1NQRASLr1LKMCdYugptu0` |

> ⚠️ docs 的 EF 版本號全數過期（v28/v6 vs live v39/v7）。搬遷前**不要信任 docs 的版本號**，一律以 `mcp__supabase__list_edge_functions` live 結果為準。這本身就是「為什麼要 rebuild」的一個證據：狀態漂移嚴重。

### 8.1.2 資料表盤點（live row count）

**A. 核心內容 6 表（SKU 化主資料，rebuild 必搬）**

| 表 | rows | 欄數 | RLS | 搬遷決議 |
|---|---:|---:|---|---|
| `schools` | 6 | 25 | on, 1 policy | reload-into-clean-schema |
| `campuses` | 10 | 14 | on, 1 policy | reload（**加 code 欄**） |
| `programs` | 24 | 15 | on, 1 policy | reload（**backfill 18 NULL code**） |
| `tuition_tiers` | 38 | 11 | on, 1 policy | reload（**加 grain UNIQUE + sku**） |
| `housing` | 23 | 14 | on, 1 policy | reload-into-clean-schema |
| `city_info` | 6 | 13 | on, 1 policy | reload-into-clean-schema |

> 6 個 school 含 2 個 DEMO（`DEMO_ISLAND` / `DEMO_MAPLE` / `DEMO_THAMES` 其中數筆）+ 真實 `CG` / `ILAC` / `ILSC`。MVP 5 校（ILAC/ILSC/KAP/EC/CG）中 **KAP / EC 尚未進 DB**——這不是「搬遷既有資料」而是「rebuild 後新灌」，列入 §8.5 開放決策。

**B. LP 內容 4 新表（Phase 2 Batch 2 建，rebuild 必搬）**

| 表 | rows | 欄數 | RLS | 搬遷決議 |
|---|---:|---:|---|---|
| `day_schedule` | 16 | 8 | **OFF, 0 policy** 🔴 | reload；**新 schema 開 RLS** |
| `voices` | 6 | 7 | **OFF, 0 policy** 🔴 | reload；**新 schema 開 RLS** |
| `faq` | 4 | 6 | **OFF, 0 policy** 🔴 | reload；**新 schema 開 RLS** |
| `photos` | 4 | 7 | **OFF, 0 policy** 🔴 | reload（URL 全 placehold.co，§8.5）；**新 schema 開 RLS** |

> 🔴 這 4 表現役 RLS 全關（anon 可讀寫）。**rebuild 的紅利就在這裡**：clean schema 從 day 1 就 `ENABLE RLS` + `TO authenticated`，不必背現役的補洞債。

**C. 其他現役表（部分搬、部分丟）**

| 表 | rows | RLS | 搬遷決議 |
|---|---:|---|---|
| `generated_pages` | 36（34 live） | on, 3 policy | **混合**：legacy LP 的 `html_content` carry-over-as-is；scroll_v1 重生成；schema rebuild（見 §8.1.3） |
| `page_templates` | 2 | on, **0 policy** | rebuild-fresh（template source = repo `comparison_scroll.html`，不靠 DB 搬） |
| `ep_consult_notes` | 3 | on, 1 policy（always-true 寫） | discard or reload-as-test（3 筆是測試/早期資料，非真案件） |
| `promoted_faqs` | 0 | on, 1 policy | discard（空表，FAQ 重新由 `faq` + `sec_faq` 設計取代） |
| `qa_items` | 1 | on, 1 policy（always-true 寫） | discard（1 筆，舊 QA 概念） |

### 8.1.3 generated_pages 細盤（搬遷最敏感的表）

`generated_pages` 22 欄。關鍵：`slug`(NOT NULL)、`html_content`、`template_version`(NOT NULL)、`status`、`deleted_at`、`student_name/contact/consultation_*`、`card_variant`(NOT NULL)。

LP 依 `template_version` 分群（live count）：

| template_version | 總 | live(未刪) | 有 html | 性質 | 搬遷決議 |
|---|---:|---:|---:|---|---|
| `legacy` | 27 | 25 | 23 | **學生在看的真實 LP** | 🔴 **carry-over-as-is**（`html_content` 原封不動搬，永不重生成） |
| `scroll_v1` | 9 | 9 | 9 | 全 `_test-*` DEMO（非真實學生） | reload-as-test 或 rebuild-fresh（重生成即可） |

> **legacy 27 的真相**（逐筆查核，影響 cut-over 驗收門檻）：
> - 27 筆裡 **2 筆 soft-deleted**（`...9726`、`...7615`，`deleted_at` 非空）→ 學生看不到，不必驗。
> - 4 筆 `html_len=0`（`ilac-ilsc-2815/5342/8006/8654`）→ 空殼，搬了也是 404，**但仍要原樣搬**（保持 slug 命名空間，避免有人手動補）。
> - 1 筆 `_test-batch1-legacy` 是測試假扮 legacy。
> - **真正「學生點開有內容」的 legacy LP ≈ 20 筆**（25 live − 4 空 − 1 test）。
> - Cut-over 驗收（§8.4 G-CUT）= 這 ~20 筆 byte-for-byte 一致 + Worker 200。

---

## 8.2 非資料資產盤點（程式碼 / 設計 / 文件）

| 資產 | 位置 | 證據 | 搬遷決議 |
|---|---|---|---|
| **報價引擎** | `src/lib/quotation/`（calculate/types/helpers/index + test，888 行） | 6 層純函式，**19 測試全過**，但**從未被呼叫** | **carry-over-as-is**（整包複製，0 改動；rebuild 只加 mapper） |
| **學生過濾** | `src/lib/student-filter/`（7 模組 + 6 test，73 測試） | 純函式，CEFR/persona/age/weeks/budget/level | **carry-over-as-is** |
| **API 層** | `src/lib/api/`（5 檔） | Supabase queries 集中、fail-throw | carry-over（`cases.ts` 查不存在的表 → discard 該檔） |
| **Hooks 層** | `src/hooks/`（3 hook + useAuth） | React state 包裝 | carry-over（接新 schema 微調） |
| **視覺 token** | `src/styles/tokens.css` | 玫瑰+金 | carry-over-as-is |
| **LP 設計源** | `/Users/jojowu/fanyang-consult/fanyang-consult.html` | 23 段、ABCD variant、Sec07State 計算邏輯 | **carry-over-as-is（設計藍本）**；React/EF 重寫對齊（rebuild） |
| **EF generate-page** | `supabase/functions/generate-page/index.ts`（~1170 行 inline，10 renderSec） | live v39 | **rebuild-fresh**（只 port 10 renderSec 邏輯，補滿 23 段；改 CLI deploy） |
| **Worker** | `cloudflare-worker/src/index.ts`（67 行） | service_role 讀 html_content，無 runtime DB 邏輯 | **carry-over-as-is**（只改 env 指向新專案，見 §8.4） |
| **灌入腳本** | `scripts/import-from-sheets.js`（delete+reinsert + name-match） | 主路徑 | rebuild-fresh（改 upsert by grain + code-match，§8.3） |
| **CSV 備援腳本** | `scripts/import-data.js` + `sample-data/` | 備援 | carry-over（同步改 upsert） |
| **驗證 SQL** | `scripts/validate-import.sql`（7 區塊） | read-only | carry-over（補 SKU/RLS 檢查） |
| **文件** | `CLAUDE.md` / `ARCHITECTURE.md` / `MVP_PLAN.md` / `IMPORT_TEMPLATES.md` / `data-loading-rules.md` | 主線知識 | carry-over（rebuild 後修版本號漂移） |
| **migrations-drafts** | `_DRAFT_quotations/tuition_tiers_extension`（解凍）；`cases/vendors/lp_school_config`（凍） | 草稿 | 部分 carry-over（§8.3） |
| **migrations（11+5=16 檔）** | `supabase/migrations/` | 增量演進史 | **discard 為「演進史」，rebuild 為「終態 baseline」**（§8.3） |

---

## 8.3 每資產 DECIDE 總表（carry / reload / rebuild / discard）

> 四種處置定義：
> - **carry-over-as-is** — bytes/檔案原封搬，零改動。
> - **reload-into-clean-schema** — 資料 dump 出來，灌進 rebuild 的新 schema（可能補欄、改 key）。
> - **rebuild-fresh** — 不搬舊產物，照新 spec 重做（資料可能重生成）。
> - **discard** — 不搬，明確丟棄。

| # | 資產 | 處置 | 一句話理由 |
|---|---|---|---|
| 1 | `schools` 6 rows | reload | 真實學校事實，但 schema 加 SKU 前置欄 |
| 2 | `campuses` 10 rows | reload + **加 code** | SKU 前置：現役無 code 欄 |
| 3 | `programs` 24 rows | reload + **backfill 18 code** | SKU 前置：18/24 NULL（jojo 核可慣例） |
| 4 | `tuition_tiers` 38 rows | reload + **grain UNIQUE + sku** | 可賣單位，現役只有隨機 UUID |
| 5 | `housing` 23 rows | reload | 真實住宿事實 |
| 6 | `city_info` 6 rows | reload | 真實城市事實 |
| 7 | `day_schedule/voices/faq/photos` 30 rows | reload + **新 schema 開 RLS** | 真實 LP 內容，修掉 RLS-off 債 |
| 8 | `generated_pages` legacy 27（html_content） | **carry-over-as-is** | 🔴 學生在看，永不重生成 |
| 9 | `generated_pages` scroll_v1 9（DEMO） | rebuild-fresh | 測試頁，重生成即可 |
| 10 | `generated_pages` schema/其餘欄 | reload-into-clean-schema | 表結構 rebuild、保留資料行 |
| 11 | 報價引擎 `src/lib/quotation/` | carry-over-as-is | 19 測試是合約 |
| 12 | 學生過濾 `src/lib/student-filter/` | carry-over-as-is | 73 測試 |
| 13 | API/Hooks/tokens | carry-over | 跟 entity 解耦 |
| 14 | LP 設計源 fanyang-consult.html | carry-over（藍本） | 23 段對照 |
| 15 | EF generate-page | rebuild-fresh | 補 23 段 + CLI deploy |
| 16 | Worker | carry-over-as-is（改 env） | 純轉發 |
| 17 | 灌入腳本 | rebuild-fresh（upsert） | delete+reinsert → idempotent |
| 18 | `_DRAFT_tuition_tiers_extension.sql` | reload（apply 改良版） | additive，無 FK |
| 19 | `_DRAFT_quotations.sql` | rebuild-fresh | 現役有 cases 硬 FK，必改 |
| 20 | `_DRAFT_cases/vendors/lp_school_config.sql` | **discard（凍）** | Nexus SSOT，等 master plan |
| 21 | 16 個現役 migration 檔 | **discard 為演進史** | rebuild baseline 取代 |
| 22 | `ep_consult_notes/promoted_faqs/qa_items` | discard | 測試/空/廢概念 |
| 23 | `page_templates`（DB 2 rows） | rebuild-fresh | source = repo HTML，不靠 DB |
| 24 | `src/lib/api/cases.ts` | discard | 查不存在的表 |

### 8.3.1 「discard 16 個 migration 檔」的關鍵決策

rebuild 不是「把 16 個增量 migration 重跑」，而是**把 live schema dump 成一份 `0001_baseline.sql`**，當 clean schema 的起點，外加 rebuild 新增的 SKU / RLS / quotations。理由：

1. 16 個 migration 含一堆 `DROP COLUMN`（`top_nationalities`、`cost_of_living_monthly_cad`）—— 重跑等於先建再砍，浪費且易錯。
2. 演進史對 rebuild 無價值；**終態才有價值**。
3. 但 16 個檔案**保留在 git 歷史 + 一份 `legacy-migrations/` 歸檔**，當「為什麼某欄長這樣」的考古資料。

> baseline 產法（§8.4 Step 2 會用）：`supabase db dump --schema public -f 0001_baseline.sql`（schema-only），人工審一遍砍掉 dead 表（promoted_faqs/qa_items），補 SKU/RLS/quotations DDL。

---

## 8.4 EXPORT 計畫（怎麼把每張表 dump 出來重灌）

> 原則：**先 dump 再動任何東西**。export 是 cut-over 的安全網，也是「現役 = 唯一 prod 無 staging」風險的緩解。

### 8.4.1 三種 dump，各有用途

| 方法 | 對象 | 指令 | 產物用途 |
|---|---|---|---|
| **A. 全庫 logical dump** | 整個 public schema + data | `supabase db dump --db-url "$OLD_DB_URL" -f dump_full.sql`（schema）+ `--data-only -f dump_data.sql` | 災難復原底牌；rebuild baseline 起點 |
| **B. 逐表 CSV（COPY）** | 8 內容表 + generated_pages | 見 §8.4.2 | 灌進新 schema 的 source of truth（人類可讀、可 diff、可進 sheet） |
| **C. LP html_content JSON** | legacy 27 LP | 見 §8.4.3 | 🔴 cut-over 最關鍵產物：學生頁原樣搬 |

> A 用 `supabase` CLI（需 `--db-url` 或 `supabase link`）。B/C 在無 CLI 環境用 `mcp__supabase__execute_sql` 取 JSON 再落地。兩條路都保留，互為備援（retry loop 最多 3 次，間隔 5 秒，遵 CLAUDE.md 網路紀律）。

### 8.4.2 逐表 CSV export（B）

每張表一個 CSV，header 用欄名，**依 FK 安全序**（schools → city_info → campuses → programs → tuition_tiers → housing → 4 LP 表）。Studio SQL Editor 或 psql：

```sql
-- 範例（psql \copy；Studio 用 "Export" 或 execute_sql 取 json）
\copy (SELECT * FROM schools     ORDER BY name)        TO 'export/schools.csv'        CSV HEADER;
\copy (SELECT * FROM city_info   ORDER BY city)        TO 'export/city_info.csv'      CSV HEADER;
\copy (SELECT * FROM campuses    ORDER BY id)          TO 'export/campuses.csv'       CSV HEADER;
\copy (SELECT * FROM programs    ORDER BY id)          TO 'export/programs.csv'       CSV HEADER;
\copy (SELECT * FROM tuition_tiers ORDER BY id)        TO 'export/tuition_tiers.csv'  CSV HEADER;
\copy (SELECT * FROM housing     ORDER BY id)          TO 'export/housing.csv'        CSV HEADER;
\copy (SELECT * FROM day_schedule ORDER BY school_id, sort_order) TO 'export/day_schedule.csv' CSV HEADER;
\copy (SELECT * FROM voices      ORDER BY school_id, sort_order)  TO 'export/voices.csv'        CSV HEADER;
\copy (SELECT * FROM faq         ORDER BY sort_order)  TO 'export/faq.csv'            CSV HEADER;
\copy (SELECT * FROM photos      ORDER BY school_id, sort_order)  TO 'export/photos.csv'        CSV HEADER;
```

無 psql 時，逐表 `execute_sql('SELECT row_to_json(t) FROM <table> t')` → 落 `export/<table>.json`。

> ⚠️ export 完**立刻**跑一份 checksum：每表 `count(*)` + 關鍵欄 `md5(string_agg(...))`，存進 `export/MANIFEST.txt`。reload 後 re-run 同 SQL 對拍（§8.4 Step 4 驗收）。

### 8.4.3 LP html_content export（C，🔴 最關鍵）

學生頁是「靜態 cache HTML」，搬遷只要把 27 筆 `html_content` 連 slug 原樣搬到新 `generated_pages`，Worker 指過去就還在。

```sql
-- 取 legacy LP 快照（含已刪、含空殼，原樣保留命名空間）
SELECT json_agg(json_build_object(
  'slug', slug, 'html_content', html_content, 'status', status,
  'template_version', template_version, 'deleted_at', deleted_at,
  'card_variant', card_variant, 'title', title,
  'school_ids', school_ids, 'campus_ids', campus_ids,
  'created_at', created_at, 'updated_at', updated_at
) ORDER BY slug)
FROM generated_pages
WHERE template_version = 'legacy';   -- 27 筆
```

落地成 `export/legacy_lp_snapshot.json`，**這份是 cut-over 的核心備份**。同時對每筆 `md5(html_content)` 存進 manifest——cut-over 後逐筆比 md5，這就是「學生看到的東西沒變」的數學證明。

### 8.4.4 EF / Worker / template 原始碼 export

- EF generate-page：repo 已有 `supabase/functions/generate-page/index.ts`，但 **live 是 v39，repo 可能落後**。搬遷前用 `mcp__supabase__get_edge_function` 拉 live 原始碼對拍 repo，以 live 為準存一份 `export/ef_generate_page_v39.ts`。
- Worker：`cloudflare-worker/src/index.ts` 已在 repo，carry-over。
- template：`supabase/templates/comparison_scroll.html`（repo source of truth，73KB）carry-over；DB `page_templates` 2 rows 不搬。

---

## 8.5 待 jojo 補的「新資料」（非搬遷，是補洞）

搬遷只能搬「現役有的」。下列是 rebuild 才完整、但**現役缺**的真實事實，列為 §8.5 待補：

| 缺口 | 現況 | 需要 |
|---|---|---|
| KAP / EC 兩校全部資料 | DB 無此 2 校 | jojo 交付 schools/campuses/programs/tuition_tiers/housing TSV（§7 範本） |
| 18 個 `programs.code` | NULL | jojo 核可命名慣例（GE15/IELTS…） |
| `campuses.code` 10 個 | 欄不存在 | 半機械（city→code），jojo 終核 |
| `photos.image_url` 4 筆 | 全 placehold.co | 真實圖 URL |
| 各校 mood/day/voices/faq 空缺 | 部分空 | §7 TSV 交付，缺則 placeholder 不捏造 |

> 這張表跟搬遷**解耦**：搬遷可先把 6 校現有資料灌好，KAP/EC 之後 upsert 進去（rebuild 的 upsert 灌入正是為此）。

---

## 8.6 CUT-OVER 計畫（新專案站起來 → 切換）

> 策略：**並排（side-by-side）切換**，不就地改。新 Supabase project 從零站起來，驗綠了才把 Worker 指過去。任何一步失敗 → Worker 還指舊專案，學生零中斷。

### 8.6.1 步驟（每步一個 gate，fail-stop）

```
Step 0  凍結期宣告
  - 通知：cut-over 窗口內不在舊專案灌資料 / 不生 LP（避免 dual-write 漂移）
  - 對舊專案跑 §8.4 export A+B+C，落 export/ + MANIFEST.txt + legacy_lp_snapshot.json
  - gate C0：manifest 行數 = live count（schools=6 … tuition_tiers=38 … legacy LP=27）

Step 1  新專案 provision
  - 開新 Supabase project（new ref），記 URL / service_role / anon key
  - 不動舊專案

Step 2  clean schema baseline
  - 套 0001_baseline.sql（§8.3.1：dump 現役 schema → 砍 dead 表 → 補 SKU/RLS/quotations）
  - 4 LP 表 day 1 ENABLE RLS + SELECT TO authenticated（修掉現役 RLS-off 債）
  - gate C1：get_advisors 無 critical/high ERROR；anon 擋、authenticated 讀（寫測試證）

Step 3  reload 內容資料
  - 依 FK 安全序灌 8 內容表（upsert by code/grain，非 name-match）
  - SKU 前置：campuses.code 填、programs.code backfill、grain UNIQUE、sku 生成
  - gate C2：count 對 manifest；validate-import.sql 7 區塊全綠；38 tier 皆有 sku 且 grain UNIQUE；FK 0 孤兒

Step 4  reload LP（🔴 關鍵步）
  - 把 legacy_lp_snapshot.json 27 筆原樣 INSERT 進新 generated_pages（slug/html_content/deleted_at 全保留）
  - scroll_v1 DEMO 不搬，新 EF 重生成
  - gate C3：逐筆 md5(html_content) == 舊 manifest md5（byte 級一致，含 2 soft-deleted、4 空殼）

Step 5  EF + template 部署到新專案
  - generate-page（補滿 23 段的 rebuild 版）+ view-page，CLI deploy（非 inline）
  - page_templates 從 repo comparison_scroll.html 寫入
  - gate C4：deployed == repo；DEMO LP 重生成 23 段渲染無 console/network error

Step 6  影子驗證（Worker 還沒切）
  - 臨時把一個 staging Worker 指新專案，抽 3 個 legacy slug + 2 DEMO，比對渲染
  - gate C5：~20 個有內容 legacy LP 在新專案 Worker 下 200 且 md5 一致

Step 7  ✂️ CUT — 切 Worker env
  - 改 cloudflare-worker 的 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 指新專案，部署
  - 主動 purge Worker edge cache（s-maxage=300，否則最多 5 分鐘看到舊內容）
  - gate C6（上線驗收 = G6）：
      ① 抽 3 LP（_test-demo-maple + 2 真實校 slug）走 select→LP→互動→開報價，
         成功 = 全 ported 段渲染 + 學生能選 + 顧問開出有效 quote_number + 無 error
      ② RLS 再驗無退化  ③ 27 legacy LP 抽驗無損  ④ gh-pages 後台 + worker 上線

Step 8  舊專案保留期
  - 舊 Supabase project **保留至少 30 天唯讀**（不刪），當 rollback 底牌
  - 確認 30 天無問題 → 歸檔 export/ → 才考慮停用舊專案
```

### 8.6.2 Rollback（任何 gate 紅）

- Step 0–6 紅：Worker 還指舊專案 → **零學生影響**，修完重跑該 step。
- Step 7 切換後紅：Worker env **改回舊專案 URL/key + purge cache**，即時回滾（舊專案 30 天唯讀仍在）。回滾窗口 = cache TTL（≤5 分鐘）。
- 這就是 side-by-side 的價值：cut 之前所有風險都在新專案內，不污染學生。

---

## 8.7 REBUILD vs CONTINUE 誠實取捨

> 這是本章最該被 product owner 讀的一節。兩條路都能到「MVP 上線」，成本與風險不同。

### 8.7.1 兩條路定義

- **CONTINUE（增量）** = 照 `CLAUDE.md` / `MVP_PLAN.md` 已寫好的 Phase 0→6，在**現役專案就地**補 RLS、補段、接報價、做 SKU。不開新專案、不搬資料。
- **REBUILD（本 spec kit）** = clean app 結構 + 新 Supabase 專案 + 本章 cut-over，把 SKU/23 段/報價/RLS 從 day 1 做對。

### 8.7.2 逐項對比

| 面向 | CONTINUE（增量） | REBUILD（clean） |
|---|---|---|
| **資料搬遷成本** | 0（資料原地） | 中（§8.4 export + reload，但已有腳本 + 量小：~107 內容 rows + 27 LP） |
| **27 legacy LP 風險** | 低（沒搬就不會壞） | 中→低（cut-over 集中風險，但 byte-level md5 gate 可控） |
| **RLS-off 債** | 要主動補（Phase 0.1）+ 背補洞痕跡 | day 1 乾淨，無歷史包袱 |
| **SKU 前置** | 一樣要做（campus/program code） | 一樣要做（成本相同） |
| **報價引擎接線** | 一樣（只加 mapper） | 一樣（carry-over-as-is） |
| **23 段 LP** | 一樣要補 13 段 | 一樣要補（EF rebuild 順帶） |
| **schema 漂移/演進史** | 背 16 migration + dead 表（promoted_faqs/qa_items/ep_consult_notes） | baseline 砍乾淨 |
| **EF inline 1170 行 / CreatePage 1700 行** | Post-MVP 才拆 | rebuild 一次拆對 |
| **無 staging 風險** | 持續（單一 prod） | cut-over 後可把舊專案當 staging |
| **時程到 MVP** | **較短**（Phase 0–6，無搬遷步） | 較長（多 §8.6 七步 + 雙跑驗證） |
| **長期維護負債** | 較高（債務累積） | 較低（一次還清） |

### 8.7.3 推薦（工程師 + PM 雙視角）

**推薦：HYBRID — 「就地增量 MVP 上線，rebuild 只取其清潔成果，不另開專案」。**

理由：
1. **資產的價值在資料與引擎，不在 app 結構**。資料只有 ~107 內容 rows + 27 LP，引擎是純函式 carry-over。這兩塊**無論哪條路成本幾乎一樣**。
2. **真正貴的、也是 rebuild 唯一真紅利的，是「RLS 從 day 1 乾淨」與「砍掉 dead schema」**。但這兩件可以在**現役專案內**用一份 migration 達成（ENABLE RLS + DROP dead 表），不需另開專案 + cut-over 27 個學生頁的風險。
3. **cut-over 27 legacy LP 是純下行風險**：做對 = 學生看到一模一樣（零增益）；做錯 = 學生頁壞（純損失）。為了「schema 乾淨」去承擔「學生頁可能壞」不划算。
4. 因此：**沿用已寫好的 Phase 0–6 增量路徑上線**（CONTINUE），把本 rebuild spec kit 當「終態藍圖 / 驗收標準 / 重構方向」，在 Phase 0.5 用一份 baseline-clean migration 收割 rebuild 的清潔紅利（開 RLS、砍 dead 表、補 SKU grain），**而不真的另開 Supabase 專案搬家**。

> 換句話說：**rebuild 的「設計」全採用，rebuild 的「搬家」不做**。§8.6 的 side-by-side cut-over 只在「決定真的要換 Supabase 專案」（例如 Nexus master plan 落地、要併 region/帳號）時才執行——那時本章已備好完整 runbook。
>
> 若 product owner 仍要 full rebuild（例如想徹底擺脫漂移、或要交接給新團隊），§8.6 七步 + §8.4 export 已是可直接執行的 runbook，風險由 md5 gate 與 30 天唯讀舊專案兜底。

---

## 8.8 搬遷風險登記（migration-specific）

| 風險 | 嚴重 | 觸發點 | 緩解 |
|---|---|---|---|
| **27 legacy LP 學生頁損壞** | 🔴 blocker | Step 4/7 | legacy_lp_snapshot.json + 逐筆 md5 gate（C3/C5）；Worker env 可秒回滾；舊專案 30 天唯讀 |
| **資料丟失（dump 不全）** | 🔴 blocker | Step 0 | export A+B+C 三份冗餘 + MANIFEST count/md5 對拍；count != live 直接 fail-stop |
| **dual-write 窗口漂移** | high | Step 0–7 期間 | Step 0 凍結宣告：cut-over 窗口內舊專案不灌料/不生 LP；窗口越短越好（建議單日內走完） |
| **Worker edge cache 殘留舊內容** | mid | Step 7 | 切換後主動 purge cache；s-maxage=300 → 最壞 5 分鐘自然過期 |
| **SKU 前置卡 program.code（內容決策）** | major | Step 3 | jojo 核可命名慣例；卡住先灌不依賴 SKU 的內容（mood/day/voices 掛 school_id） |
| **reload 用 name-match 撞 FK** | high | Step 3 | 改 upsert by code/grain（§8.3 #17）；FK 安全序；validate FK 0 孤兒 |
| **RLS 新 schema 開錯（開成 anon）** | high | Step 2 | 一律 `TO authenticated`，非 anon；get_advisors gate；寫測試證 anon 擋 |
| **quotations draft cases 硬 FK** | blocker | Step 2 | apply 前必改（拔 cases FK / vendor 字串），照 CLAUDE.md §3.2 |
| **EF live(v39) 比 repo 新，搬到舊版** | mid | Step 5 | Step 0 用 get_edge_function 拉 live 原始碼對拍，以 live 為準 |
| **單一 prod 無 staging（測不了搬遷）** | high | 全程 | side-by-side 新專案本身就是 staging；Step 6 影子驗證在切換前抓問題 |
| **scroll_v1 DEMO 被當真實 LP 搬** | low | Step 4 | 過濾 `template_version='legacy'` only；DEMO 重生成不搬 |

---

## 8.9 本章 TL;DR

```
搬什麼（carry-over-as-is，零改）：
  - 報價引擎 src/lib/quotation/（19 測試）
  - 學生過濾 src/lib/student-filter/（73 測試）
  - 27 legacy LP 的 html_content（學生在看）
  - Worker（只改 env）、tokens.css、LP 設計源

灌什麼（reload-into-clean-schema）：
  - 8 內容表 ~107 rows（schools6/campuses10/programs24/tuition38/housing23/city6 + 4 LP 表30）
  - generated_pages 行資料（schema rebuild）

重做什麼（rebuild-fresh）：
  - EF generate-page（補滿 23 段、CLI deploy）
  - 灌入腳本（delete+reinsert → upsert by grain）
  - quotations 表（拔 cases FK）、page_templates、SKU 層

丟什麼（discard）：
  - 16 個增量 migration（轉成 baseline）、ep_consult_notes/promoted_faqs/qa_items
  - cases/vendors/lp_school_config draft（凍，等 Nexus）

怎麼切（cut-over）：
  - side-by-side 新專案 → 8 gate → 切 Worker env → 舊專案 30 天唯讀底牌

要不要真搬：
  - 推薦 HYBRID：採用 rebuild 的「設計」，不做 rebuild 的「搬家」
  - 資料/引擎兩路成本一樣；cut-over 27 LP 是純下行風險
  - 用一份 baseline-clean migration 在現役專案收割清潔紅利即可
  - full rebuild runbook（§8.4+§8.6）已備好，待 Nexus master plan 觸發
```
