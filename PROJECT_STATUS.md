# 📋 FY-school-cms 進度同步文件(RE-BASELINE 正式版)

**更新於 2026-06-17 · git log / Supabase schema / 檔案存在性 已由並行 chat live 交叉核對**

> ## ⚠️ 使用前必讀
> 1. 本版的 commit hash、EF 版本、DB schema、migrations、檔案存在性,已由有 Supabase MCP + repo 的並行 chat live 核對,標 ✅。
> 2. 唯一盲區:GAS + Google Drive 側。兩個 chat 都無 Drive / GAS code 存取。sheet 內已發現一套 GAS staging/archive 工作流(見 14c),其狀態本檔無法描述,需該側 chat 補。
> 3. Phase 1–13 主線的「功能細節」未逐條 live 驗,標 ⚠UNVERIFIED;但其對應 migrations(4/8/9)已核。
> 4. 落地為新基準前仍建議自行 `git log --oneline` 對一次。

---

## 🟢 系統當前狀態 ✅VERIFIED

| 項目 | 值 |
|---|---|
| EF `generate-page` | **v28** ACTIVE(id `2de971ae…`, verify_jwt=true) |
| EF `view-page` | **v4** ACTIVE(verify_jwt=false)— 公開頁服務 |
| `schools.top_nationalities` | **已 DROP**(DB 0 columns) |
| `schools.nationality_breakdown` | 存在(DB 1 column) |
| `city_info` 生活費欄 | `cost_of_living_monthly` + `cost_of_living_currency` + `country`(14a 加);舊 `cost_of_living_monthly_cad` **已 DROP** |
| 最新 HEAD | `0ebe775`(本檔 commit 落地後 HEAD 會再 +1) |

---

## 🟢 18b 收尾(已完成)✅VERIFIED

| sub-track | 內容 | commit · 版本 |
|---|---|---|
| sub-track 1 | schema 清理(`top_nationalities` DROP) | `cfcf493` · EF v26 |
| sub-track 2 | LP A/B/D 卡片樣式分派 | `214d8c2` · EF v27 |
| backlog | `personaLabels` 加 `pr_immigration`;City Cards 切 `cost_of_living_monthly` 新欄;`DROP _cad` | `d2aba0f` · EF v28 |

> EF v28 三處:① personaLabels 加 `pr_immigration`(「移民/PR 規劃」);② City Cards 改讀 `cost_of_living_monthly` + `cost_of_living_currency`;③ chips render 用 `personaLabels[p] ?? p` 容錯。Demo 站 City Cards 視覺零變化(14a backfill 完整、新舊欄同值)。

---

## 🟢 Persona vocabulary 對齊 ✅VERIFIED

- master list **6 → 7**:新增 `pr_immigration`(移民/PR 規劃)。⚠ 計分已就緒,中文 label 自 EF v28 起顯示。
- CreatePage 仍 11 個 purpose tag;其中 **4 個 UI-only passthrough**(不計分),分兩類:
  - **永久非 persona**:`lang_school`(零區辨力)、`undecided`(學生狀態非學校屬性)。
  - **暫時 passthrough、未來結構化**:`short_tour` / `custom_tour`(屬「學校有沒有此產品」非「學生 persona」;未來升 `schools.has_short_tour` / `has_custom_tour` BOOL)。
- `getPersonaMatchScore`:passthrough 從計分集合濾掉(非選到就整段略過)→ `lang_school + exam_prep` 的 exam_prep 仍計分;全 passthrough → score 0、中性排序、badge 不亮。
- commits:`8240e5b`(前端計分 + 文件)、`98b3529`(18b backlog 文件)。

### Persona Master List(7,已定案)

| Tag | 標籤 |
|---|---|
| `exam_prep` | 考試衝刺 |
| `pathway_uni` | 銜接升大學 |
| `pathway_grad` | 銜接升研究所 |
| `working_holiday` | 打工度假 |
| `career_change` | 職涯轉換/充電 |
| `gap_year` | 學測後 Gap year |
| `pr_immigration` | 移民/PR 規劃(新增) |

---

## 🟢 Phase 19 — 學生諮詢(6/12 前完成)✅VERIFIED

| Phase | 內容 | commit |
|---|---|---|
| 19a | `generated_pages` 加學生諮詢欄位 + OPERATIONS.md | `8d6a1e0`(migration `20260612110448_phase19a`) |
| 19b | CreatePage 學生姓名 + 聯絡方式輸入 | `8e61a7a` |
| 19c | Dashboard 學生視角列表(主標/搜尋/副標) | `b8e9580` |
| 19d | Dashboard 諮詢備注 + 複製到大表 | `c14a43b` |
| 19d-fix | 儲存備注後 optimistic 更新 icon | `526dcc3` |

---

## 🟢 Migrations(11 個,完整)✅VERIFIED

```
20260519085918_add_campus_ids_to_generated_pages           Phase 4
20260526181732_add_deleted_at_to_generated_pages           Phase 8
20260530140210_add_updated_at_to_generated_pages           Phase 9
20260601123751_phase14a_multi_country_currency             14a
20260601171255_phase15a_school_depth_fields                15a
20260609171452_phase16a_page_content_fields                16a
20260610190033_phase16c_persona_match                      16c
20260610230934_phase18a_nationality_breakdown              18a
20260612110448_phase19a_consultation_fields                19a
20260615120000_phase18b_drop_top_nationalities             18b sub-1
20260616145919_phase18b_drop_cost_of_living_monthly_cad    18b backlog
```

---

## 🎯 v3 大方向(2026-06-18 拍板)

### CMS 重新定位:**顧問完整工作流系統**(不只 LP 工具)

> 顧問拿到學生需求 → 進 CMS → 產 LP 諮詢 → 即時記錄學生反應 → 出報價單 → 收單

### 五大重大決定

| # | 決定 | 影響 |
|---|---|---|
| 1 | **方案 C**:CMS 嵌入 Nexus 子模組,Path 2(1-2 個月) | LoginPage 砍,身份從 Nexus 拿 |
| 2 | **報價系統併進 CMS**(不再是兩個系統) | 報價計算引擎照搬,從 LP 一鍵出報價 |
| 3 | **案件由 CRM 之後接管**,CMS 內 MVP 輕量 | cases 表預留 `crm_case_id` 給將來指向 |
| 4 | **fanyang-consult 玫瑰+金視覺**(取代鮮粉+深藍) | 全套 token + Noto Sans TC + DM Mono |
| 5 | **5 大區塊 + advisor-only 方案配置**(諮詢痛點解) | 顧問 demo 中即時 key 學生反應 + 1 鍵帶資料開報價 |

### 5 大區塊架構

```
1. 案件首頁(MVP,等 CRM 接管)
2. LP 產生器 Wizard(6 step,廠商→國→校→排版→樣式→完成)
3. LP 諮詢模式 ★ 痛點解(advisor-only 方案配置 + 學生反應 4 級 + 即時試算)
4. 報價單 Wizard(從 LP 帶資料,6 層算費 + 出 PDF)
5. 分析報表(5 面向:運營 / 轉化 / 學校偏好 / 學生洞察 / 管理員)
```

### 設計指令

**`/tmp/cms-design-prompt-v3.md`** — 完整 self-contained design prompt,等 Laura review 完丟給 Claude Design。

### Group 2 Prep(2026-06-18,設計沒來前先做的後端 prep)

| 項 | 狀態 | 位置 |
|---|---|---|
| **E. Google Fonts + token 預載入** | ✅ | `index.html`(fonts preconnect)+ `src/styles/tokens.css`(玫瑰+金 token) |
| **A. 報價計算引擎 TS module** | ✅ | `src/lib/quotation/`(types / helpers / calculate / index,從 app.js 6 層算費 port) |
| **B. Schema migration 草稿** | ✅(draft only,**NOT APPLY**) | `supabase/migrations-drafts/`(vendors / tuition_tiers ext / cases / lp_school_config / quotations) |
| **C. SCHOOL_DATA ETL 計畫** | ✅(計畫 only) | `scripts/etl-school-data-plan.md`(SCHOOL_DATA 478KB → CMS schema mapping + script skeleton) |
| **D. 文件更新** | ✅(本 commit) | PROJECT_STATUS / ROADMAP |

### 14c 真實資料匯入的新位置

原本是「Laura 用 Google Sheets 匯入學校資料」,**新方向下會被取代**:
- 學校資料來源改成「報價系統 SCHOOL_DATA」(Group 2 C ETL 計畫)
- 14c sheet 仍可保留為「人工補充欄位」工具(min_age / persona_match / one_liner 等報價系統沒的),但**不再是主資料源**

---

## 🟡 Phase 14c — 真實資料匯入(部分過期,SCHOOL_DATA ETL 將取代)

### 本 chat(repo + Supabase)側 ✅VERIFIED

- `scripts/import-from-sheets.js`(`34a2834`):Node、直連 Google Sheets API、FK 安全序 batch insert、`--dry-run` 預設 / `--commit` 才寫 / `--truncate` 破壞性、附 `validate-import.sql`、`.env.example`。
- 國籍單寫 `nationality_breakdown`;sheet 的 `top_nationalities` 欄忽略(DB 已 DROP)。
- cost_of_living 不 mirror `_cad`(已 DROP;EF v28 切新欄)。`_cad` 殘留全 repo 清乾淨。
- ⚠ 腳本「實跑」尚未驗收:第一次帶認證 dry-run 才是真驗收點。
- **tab guard 已放寬**(`0ebe775`):缺指定 6 tab 仍 throw,多出非結構 tab(config/import-log/staging)改 `console.log` + 繼續,只 `batchGet` 指定 6 個。真實 sheet 帶 GAS 工作流 tab 不會再被拒。

### 資料 sheet ✅VERIFIED(2026-06-16 預檢)

- 「語校CMS資料庫」(ID `1gOMXk_9efJ-IaXbdjMoRwI1NQRASLr1LKMCdYugptu0`,owner `ynso.ws.01@tkb.com.tw`),樣本資料(ILAC / Kaplan / EC,僅 ILAC 全填),schema 最新版。
- **匯入會 blocking 的硬擋(2)**:① housing 缺 `city` 欄(`housing.city` NOT NULL);② EC 那筆 tuition 對不到 program(EC 整所無 program/campus/housing → FK fail)。
- **WARN / 待確認**:tuition 無 city 欄 → campus_id 全 null(nullable,可接受);Sydney 是否在 city_info 待確認;Kaplan/EC 缺 min_age/persona_match/one_liner(17a/17b UX 失效,不擋匯入)。

### ⚠ GAS + Drive 側(盲區,待該 chat 補)

- sheet 內發現 GAS staging/archive 工作流:config tab(`STAGING_FOLDER_ID` / `ARCHIVE_FOLDER_ID` / `STAGING_TAB=匯入資料` / `DEDUP_ENABLED` / `ARCHIVE_AFTER_IMPORT`)+ import-log tab。
- **未解**:此 GAS 工作流與 CC 的 `import-from-sheets.js` 分工為何?上下游還是重疊?需 GAS 側確認,否則兩套機制可能撞車。**這是 14c 最高優先決策。**

---

## ⚠️ 已知待處理 / 決策

| 項目 | 狀態 / 時機 |
|---|---|
| 🔴 兩套匯入機制(Node vs GAS)分工 | 未釐清,最高優先,需 GAS 側 + 拍板 |
| housing 缺 city 欄 | blocking,待填表補 |
| EC stub / FK | 待填表補齊或移除 |
| Sydney 是否在 city_info | 待確認 |
| 認證(SA / OAuth / API key) | 待設,dry-run 前置 |

---

## 📂 重要檔案位置 ✅(存在性已核)

```
FY-school-cms/(repo 根)
├── ROADMAP.md, IMPORT_TEMPLATES.md, MIGRATIONS.md, OPERATIONS.md, BETA_CHECKLIST.md
├── PROJECT_STATUS.md(本檔)
├── scripts/
│   ├── import-from-sheets.js   ← 14c 直連匯入(34a2834);tab guard 放寬於 0ebe775
│   ├── import-data.js          ← CSV 備援匯入
│   ├── validate-import.sql
│   └── sample-data/            ← CSV 備援用樣本
├── supabase/
│   ├── migrations/             ← 11 個(見上)
│   ├── templates/comparison.html
│   └── functions/
│       └── generate-page/index.ts        ← v28(repo + deployed)
│       # ⚠ view-page v4 deployed-only,repo 內無 source(早期 Studio 直 deploy)
└── src/pages/
    ├── CreatePage.tsx          ← persona passthrough 濾除
    ├── DashboardPage.tsx       ← 19c/19d 學生視角 + 報價系統按鈕
    └── LoginPage.tsx
```

---

## 🟢 完成的 Phase 1–13 ⚠UNVERIFIED(沿用 6/12 舊版,功能細節未逐條核)

> 主線(模板、寫入、Dashboard、搜尋分頁)、Phase 12 視覺升級(放洋色票)、14a 多國家/幣別、14b IMPORT_TEMPLATES、15a schema 深度欄、16a/16c/18a schema 演進等。對應 migrations 4/8/9/14a/15a/16a/16c/18a 已核存在;feature 細節以 git log 為準。

---

## 🔗 工具直連

| 用途 | URL |
|---|---|
| 後台 demo | https://jojo880714.github.io/FY-school-cms/ |
| LP 設計稿 | https://jojo880714.github.io/fanyang-consult/fanyang-consult.html |
| Supabase Studio | https://supabase.com/dashboard/project/uxxpagylkdljjaxslmyj |
| GitHub | https://github.com/jojo880714/FY-school-cms |
| 資料 sheet | https://docs.google.com/spreadsheets/d/1gOMXk_9efJ-IaXbdjMoRwI1NQRASLr1LKMCdYugptu0 |

---

## 修訂歷史

| 日期 | 變更 |
|---|---|
| 2026-06-17 | 正式版落地:依 live git log + Supabase MCP 校過 12 個 hash / 11 個 migration / 3 個 EF deployed state / DB schema。校正 6/12 舊版的兩處過期、補 view-page deployed-only 註記。 |
| 2026-06-18 | 方向轉換:CMS 整合策略改為方案 C(重寫為 Nexus 子模組),身份/權限/SSO 由 Nexus 接管。本次清理:刪除 `issue-quote-token` EF、Dashboard「開報價系統」按鈕、`ACCOUNT_MGMT_SPEC.md`、`SSO_STATUS.md`、`VITE_QUOTE_SYSTEM_URL` env var、`QUOTE_SSO_SECRET` Supabase env。CMS 資料層(6 張表 / `generate-page` EF / 14c 匯入腳本 / persona / migrations)保留不動,等下一波決策。 |
| 2026-06-18 PM | **v3 大方向落地**:CMS 重定位為顧問完整工作流(LP+demo+報價+分析,5 區塊)。報價系統併進 CMS。案件 MVP 等 CRM 接管。視覺改 fanyang-consult 玫瑰+金。Group 2 Prep(E/A/B/C/D):Google Fonts + 視覺 token、報價計算引擎 TS module、5 張表 migration 草稿、SCHOOL_DATA ETL 計畫、文件更新 — 全部就緒,等 Claude Design 交付 wireframe 後啟動整合 phase。Design prompt v3 在 `/tmp/cms-design-prompt-v3.md`。 |
