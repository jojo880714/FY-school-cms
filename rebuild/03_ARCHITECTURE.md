# 03 · SYSTEM ARCHITECTURE(系統架構規格)

> **本章定位**：定義 FY-school-cms 重建版的「整體系統長怎樣」——有哪些 runtime component、各自跑在哪裡、用什麼身份、彼此怎麼接、資料怎麼流、怎麼部署。
> **重建立場(REBUILD STANCE)**：**保留已驗證的技術棧**(React + Vite + TypeScript + Supabase + Cloudflare Worker),**沿用既有資料 + 已測過的報價引擎 + LP 設計**;但把 SKU、完整 23-section LP、報價流程、正確 RLS 設成 day-1 一等公民。
> 本章只談「架構骨架」,不重述 23-section LP 細節(見第 06 章)、SKU 與 tuition_tiers schema(見第 04 章)、報價引擎(見第 07 章)、RLS policy 逐條(見第 05 章)。本章負責把那些章節「掛」在同一張系統圖上。

---

## 3.0 設計原則(Architecture Tenets)

重建版的所有架構決策都回推到這 7 條原則,後續每一節都在落實它們:

1. **Authenticated-first,anon 不用**。整套系統沒有匿名身份。顧問前端是 authenticated(Supabase Auth session);所有後端讀寫一律走 service_role(Worker / EF / scripts);RLS policy 一律 `TO authenticated`,永遠不寫 `TO anon`。
2. **公開 LP runtime 零 DB**。學生看到的公開頁是 Cloudflare Worker 服務的 **static cached HTML**;Worker runtime **沒有也不該有** DB 查詢能力(它持有的 service_role key 只是為了「快取 miss 時回源拉一次成品 HTML」,不是查業務資料)。
3. **互動所需資料在生成時烘進去**。公開 LP 的互動(週數試算、幣別切換、學校展開)所需的資料,必須由 generate-page Edge Function 在**生成時**以 **JSON data island** 形式嵌進 HTML;public runtime 不再回 DB。
4. **純函式與 entity 解耦**。報價引擎(`src/lib/quotation/`)、學生過濾(`src/lib/student-filter/`)是 pure function,不碰 Supabase、不碰 React;可獨立測試、可在前端與 EF 兩邊重用。
5. **Pages → Hooks → API → Supabase 單向依賴**。UI 元件不准直接 `import { supabase }`;一律經 `src/lib/api/`(集中 query、失敗 throw)→ `src/hooks/`(React state 包裝)。
6. **SKU 是穩定外鍵**。可售原子單位 = 一筆 `tuition_tiers`,擁有穩定 SKU(`VENDOR-CAMPUS-PROGRAM-WEEKS-CUR`),DB 對完整 grain 下 UNIQUE。報價快照引用 SKU 與**複製值**,不引用 random UUID。
7. **對 Nexus 防腐(Anti-corruption)**。報價是 **Nexus-safe snapshot**:FK 全部 nullable、vendor 存 string slug(無 vendors 表)、寫入時 copy values 而非 UUID 參照。Nexus master plan / cases / vendors / lp_school_config 一律凍住,本章任何 component 都不得對它們產生**硬依賴**。

---

## 3.1 系統組件總覽(Component Inventory)

重建版由 5 個 runtime component + 1 個 build/CLI 邊界組成。下表是「誰是什麼、跑在哪、用什麼身份、能不能碰 DB」的單一真相表:

| # | Component | 跑在哪 | 技術 | 身份 / Key | DB 存取 | 角色 |
|---|---|---|---|---|---|---|
| C1 | **Advisor SPA**(顧問工作台) | GitHub Pages(static host) | React 19 + Vite + TS + react-router | **authenticated**(Supabase Auth session,`anon key` 僅用於建立 client) | 經 RLS(`TO authenticated`) | 顧問選校 → LP wizard → 諮詢 → 報價 |
| C2 | **generate-page EF**(LP 生成器) | Supabase Edge Functions(Deno) | Deno + supabase-js | **service_role**(bypass RLS) | 全表讀 + 寫 `generated_pages.html_content` | 把選校資料 render 成 23-section HTML + JSON island,寫回 DB |
| C3 | **Public LP Worker**(公開頁) | Cloudflare Workers(edge) | TS + Workers runtime + Cache API | **service_role**(僅回源拉成品 HTML) | **不查業務資料**;只 `select html_content,status` by slug | 服務 static cached HTML 給學生 |
| C4 | **Supabase Postgres + Auth** | Supabase(managed) | Postgres + GoTrue + PostgREST | — | SSOT(本系統範圍內) | 資料 / 身份 / RLS 落地 |
| C5 | **Capture endpoint**(選配) | Supabase EF 或 Worker route | Deno / TS | service_role | 寫 `lp_events`(append-only) | 收集學生互動事件(可後做) |
| B1 | **Build / Seed / Deploy CLI** | 開發機 / CI | Node scripts + `gh-pages` + `supabase` CLI + `wrangler` | service_role(scripts)/ access token(CLI) | 匯入資料 / 部署 | ETL、migration、部署三個 surface |

> **C5 是選配**:MVP 可以不上,但本章把它的「位置與身份」先釘好(append-only `lp_events`,service_role 寫入,絕不讓公開頁直接寫業務表),避免日後臨時開個 anon 寫入口子破壞原則 1。

### 3.1.1 文字架構圖(Target Architecture Diagram)

```
                         ┌──────────────────────────────────────────────┐
                         │                  學生(公開,無登入)            │
                         └───────────────────────┬──────────────────────┘
                                                 │ GET /?slug=xxx
                                                 ▼
   ┌───────────────────────────────────────────────────────────────────────────┐
   │  C3 · Public LP Worker(Cloudflare edge)                                    │
   │  ┌───────────────────────────────────────────────────────────────────┐    │
   │  │ 1. Cache API match(cacheKey = full URL)                           │    │
   │  │    └ HIT → 直接回 static HTML(此路徑 0 次 DB)                    │    │
   │  │ 2. MISS → fetch Supabase REST:                                     │    │
   │  │    GET /rest/v1/generated_pages?slug=eq.X&select=html_content,status│   │
   │  │    Authorization: Bearer SERVICE_ROLE_KEY(bypass RLS)             │    │
   │  │ 3. 回 html_content + Cache-Control + ctx.waitUntil(cache.put)      │    │
   │  └───────────────────────────────────────────────────────────────────┘    │
   │  runtime 不 render、不查業務表、不算價 → 只搬「成品 HTML」                  │
   └───────────────────────────────────┬───────────────────────────────────────┘
                                        │ (cache miss only)
                                        ▼
   ┌───────────────────────────────────────────────────────────────────────────┐
   │  C4 · Supabase                                                              │
   │   Postgres(schools/campuses/programs/tuition_tiers/housing/city_info       │
   │            + generated_pages + page_templates + 〔snapshot〕quotes + lp_events)│
   │   Auth(GoTrue)   PostgREST   RLS(全部 TO authenticated)                   │
   └───▲───────────────────────────▲───────────────────────────▲────────────────┘
       │ authenticated(RLS)        │ service_role(bypass RLS)   │ service_role
       │                           │                            │
   ┌───┴──────────────────┐   ┌────┴───────────────────────┐  ┌┴───────────────┐
   │ C1 · Advisor SPA     │   │ C2 · generate-page EF      │  │ B1 · CLI/Scripts│
   │ (GitHub Pages)       │   │ (Supabase Edge, Deno)      │  │ ETL/seed/deploy │
   │  Pages→Hooks→API     │──▶│  invoke(JWT)               │  │ import-from-    │
   │  ProtectedRoute      │   │  ① 讀 6 表 + page_templates │  │ sheets --commit │
   │  useAuth(session)    │   │  ② render 23-section HTML   │  └─────────────────┘
   │  選校→wizard→諮詢→報價│   │  ③ 嵌 JSON data island      │
   └──────────────────────┘   │  ④ 寫回 generated_pages     │
            │                 │     .html_content           │
            │ 純函式重用       └─────────────────────────────┘
            ▼                            ▲
   ┌──────────────────────────────┐      │ 共用 pure logic(報價/過濾)
   │ src/lib/quotation/(6 層)     │──────┘
   │ src/lib/student-filter/      │
   │  純函式 · 無 DB · 無 React    │
   └──────────────────────────────┘

   ┌──────────────────────────────────────────────────────────────────────┐
   │  C5 · Capture endpoint(選配)  學生互動 → POST → service_role 寫       │
   │  lp_events(append-only) → 分析報表讀                                  │
   └──────────────────────────────────────────────────────────────────────┘

   🚫 Nexus / cases / vendors表 / lp_school_config:本圖任何 component 不得硬依賴
```

---

## 3.2 Auth / Role 模型(誰用什麼身份)

這是本章最關鍵、也是現況最容易做錯的一節。重建版只有 **3 種 principal**,沒有第 4 種:

| Principal | 是誰 | 持有 | RLS 行為 | 出現在哪條 path |
|---|---|---|---|---|
| **`authenticated`** | 登入後的顧問 | Supabase Auth JWT(session)。SPA 用 `anon key` 建立 client,但**請求帶 user JWT** | **受 RLS 約束**,policy 全部 `TO authenticated` | C1 Advisor SPA 所有讀寫 |
| **`service_role`** | 後端機器身份 | `SUPABASE_SERVICE_ROLE_KEY`(高權限 secret) | **bypass RLS** | C2 EF、C3 Worker 回源、C5 capture、B1 scripts |
| **`anon`** | (不使用) | `anon key` 僅作為 supabase-js 的 publishable client key | — | **無業務 path 依賴 anon 角色**。沒有任何 RLS policy `TO anon` |

> **`anon key` ≠ `anon` 角色,務必分清楚。**
> - `anon key`(= publishable key)只是 supabase-js 在前端建立 client 的「門票」,本身不授予資料權限。重建版 SPA 用 `anon key` 建 client,但所有請求都附上**登入後的 user JWT**,因此在 PostgREST 端是以 `authenticated` 角色執行。
> - **`anon` 角色**(未登入請求)在本系統**沒有任何用途**:沒有公開的匿名讀路徑(公開 LP 是 Worker 服務的 static HTML,根本不碰 PostgREST 的 anon 角色)。因此 RLS 不需要、也**不准**寫 `TO anon` 的 policy。

### 3.2.1 各 path 用哪個角色 × RLS 如何互動

| Path | Component | 角色 | RLS 是否生效 | 說明 |
|---|---|---|---|---|
| 顧問讀學校/校區/課程做選校 | C1 → C4 | authenticated | ✅ 生效 | policy 允許 authenticated SELECT 公開主資料表 |
| 顧問建立/更新 `generated_pages` | C1 → C4 | authenticated | ✅ 生效 | 限本人 / 本組可寫(見第 05 章 owner 欄位) |
| 顧問 invoke generate-page | C1 → C2 | 觸發端 authenticated;EF 內部 service_role | EF 內 bypass | SPA 帶 JWT 呼叫 EF;EF 內以 service_role 讀 6 表 + 寫回 |
| EF render + 寫 `html_content` | C2 → C4 | service_role | ⛔ bypass | 需跨多表彙整 render,故用 service_role |
| 公開頁 cache HIT | 學生 → C3 | (無 DB) | N/A | 0 次 DB,純 edge cache |
| 公開頁 cache MISS 回源 | C3 → C4 | service_role | ⛔ bypass | 只 `select html_content,status` by slug,**不碰業務表** |
| 學生互動事件寫入(選配) | 學生 → C5 → C4 | service_role | ⛔ bypass | append-only `lp_events`,前端永不直接寫業務表 |
| ETL / seed / migration | B1 → C4 | service_role / access token | ⛔ bypass | `import-from-sheets.js --commit`、`supabase db push` |

> **為什麼 Worker 也拿 service_role?** 因為它要在 cache miss 時讀 `generated_pages` 這張**非公開表**拿成品 HTML。它**不該**被理解為「Worker 有 DB 查詢能力」——它只查一個欄位(`html_content`)、by primary-ish key(`slug`)、且立刻寫進 edge cache。原則 2 要求:**任何「需要查業務資料」的邏輯都不准放進 Worker runtime**,要前移到 C2 生成時。

---

## 3.3 三條核心資料流(Data Flows)

### 3.3.1 流程 A — 生成一個 LP(Generate)

```
顧問(authenticated)
  │ 1. 在 SPA 完成選校 + LP wizard 設定(學生 profile / 選哪幾校 / variant)
  ▼
C1 Advisor SPA
  │ 2. 經 src/lib/api/ 寫/更新一筆 generated_pages(status='draft', slug, campus_ids, content)
  │    └ 受 RLS:authenticated 只能寫自己擁有的 row
  │ 3. supabase.functions.invoke('generate-page', { pageId })  ← 帶 user JWT
  ▼
C2 generate-page EF(service_role)
  │ 4. createClient(url, SERVICE_ROLE_KEY)  ← bypass RLS
  │ 5. 讀 page_templates.comparison(HTML 骨架)
  │ 6. 讀該 LP 的 schools/campuses/programs/tuition_tiers/housing/city_info(join by campus_ids)
  │ 7. render 23 sections(renderHero / renderSec04 / renderSec08 / sec_faq / ...)
  │ 8. 嵌 JSON data island(見 3.3.3):__LP_DATA__ = { tiers, housing, fx, ... }
  │ 9. UPDATE generated_pages SET html_content = <成品>, status='published'
  ▼
C4 Supabase
  │ 10. 回傳 { success, url, templateVersion } 給 SPA
  ▼
顧問拿到公開 URL(指向 Worker /?slug=xxx)→ 進入 DEMO / 諮詢
```

要點:
- **render 全在 EF 生成時跑一次**,不是每次請求跑。成品是凍結的 HTML。
- EF 是**唯一**會跨多表彙整的 component;它的 service_role 是合理的,因為 render 需要讀完整 join 後的資料。
- 重建版的 EF 必須補齊 **23 sections**(現況只 port 10)與 **JSON data island**(現況只 `JSON.stringify` 了 tuition/housing 片段,需升級為完整 island,見第 06 章)。

### 3.3.2 流程 B — 服務一個公開 LP(Serve,runtime 零 DB)

```
學生 GET https://<worker>/?slug=xxx
  ▼
C3 Worker
  │ 1. 非 GET/HEAD → 405
  │ 2. 無 slug → 400(MISSING_SLUG_HTML)
  │ 3. cache.match(cacheKey=full URL)
  │     ├ HIT  → 直接回 static HTML 〔★ 0 次 DB,絕大多數請求走這〕
  │     └ MISS → 4
  │ 4. fetch Supabase REST:generated_pages?slug=eq.X&select=html_content,status&limit=1
  │     Authorization: Bearer SERVICE_ROLE_KEY
  │ 5. !html_content → 404(NOT_FOUND_HTML);!dbRes.ok → 502
  │ 6. 回 html_content,Cache-Control: public, max-age=60, s-maxage=300
  │ 7. ctx.waitUntil(cache.put(cacheKey, response.clone()))  ← 下次變 HIT
  ▼
學生瀏覽器收到完整 23-section static HTML(含 JSON island,前端 JS 在瀏覽器內互動)
```

要點:
- **Worker runtime 不 render、不查業務表、不算價**。它只做 cache + 回源拉成品。
- `s-maxage=300` 表示 edge cache 5 分鐘;LP 更新後(EF 重寫 `html_content`)需配套 cache 失效策略(見第 06 章;最簡單是 slug 帶 version 後綴,或 EF 完成後主動 `cache.delete` / purge)。
- 這條路**完全不經過 RLS 的 authenticated/anon**:它用 service_role 讀一個非公開表的單欄位,所以「公開可見」這件事是由 **Worker 自己的邏輯**(任何人都能 GET)決定的,而不是靠 DB 的 anon policy。這就是為什麼原則 1 能成立:公開性放在 edge,不放在 DB。

### 3.3.3 流程 C — 互動 LP 需要 EF 烘進去的 JSON Data Island

因為流程 B 的 runtime 零 DB,**所有互動所需資料必須在流程 A 生成時就嵌進 HTML**。這就是 data island:

```
EF render 階段(流程 A step 8):
  在 <head> 或 <body> 尾端注入:
  <script id="lp-data" type="application/json">
    { "fx": {"£":40,"CAD":23,...},
      "schools": [
        { "sku_grain": {...},
          "tiers": [ {"sku":"ILAC-VAN-GE-12-CAD","weeks":12,"price_per_week":410,"currency":"CAD",...} ],
          "housing": [...] } ],
      "profile": { "age":..., "budgetWeekly":..., "maxWeeks":... } }
  </script>

公開頁瀏覽器內(流程 B 之後,純前端):
  - 讀 #lp-data → 週數 slider 重算總價(可呼叫 port 過來的 quotation 純函式)
  - 幣別切換用 fx 表換算
  - 學校展開/收合用 schools 陣列
  → 全部 client-side,0 次回 DB
```

要點:
- island 內的價格資料要帶 **SKU**(原則 6),讓「公開頁顯示的數字」與「顧問報價快照」可對齊同一個原子單位。
- island **不可**放 service_role key、不可放管理員視角欄位(匯差緩衝 / 退傭 / 淨利);那些只在顧問端 C1 / 報價快照可見(見第 07 章視角分層)。
- 現況 EF 已有 `JSON.stringify(tuition...)` / `JSON.stringify(housing...)` 的雛形(`index.ts` ~L1041/L1047),重建版把它正規化成**單一具名 island**,並由前端與 EF 共用同一份 `src/lib/quotation/` 純函式做試算,確保「公開頁試算」與「報價單算價」用同一套邏輯。

---

## 3.4 部署與環境變數(Deployment & Envs)

### 3.4.1 三個部署 surface

| Surface | 工具 | 指令 | 產物 / 位置 |
|---|---|---|---|
| **C1 SPA** | Vite build + `gh-pages` | `npm run deploy`(= `predeploy` 跑 `npm run build` → `gh-pages -d dist`) | `https://<user>.github.io/FY-school-cms/`。`vite.config.ts` `base: '/FY-school-cms/'`;build 後 `cp dist/index.html dist/404.html`(SPA fallback for gh-pages) |
| **C2 EF** | Supabase CLI | `supabase functions deploy generate-page` | Supabase Edge(Deno) |
| **C3 Worker** | Wrangler | `wrangler deploy`(於 `cloudflare-worker/`) | Cloudflare edge,`name = "fy-school-view-page"` |

> SPA 用 **HashRouter-free 的 BrowserRouter + 404.html fallback**:`App.tsx` 以 `basename={import.meta.env.BASE_URL.replace(/\/$/, '')}` 對齊 gh-pages 子路徑;build script 複製 `index.html → 404.html` 讓深連結(`/dashboard`)在 gh-pages 上不 404。重建版維持此模式。

### 3.4.2 環境變數矩陣(誰需要什麼)

| 變數 | 用於 | 設定位置 | 性質 |
|---|---|---|---|
| `VITE_SUPABASE_URL` | C1 SPA(`src/lib/supabase.ts`) | build-time env / CI secret | 公開(會進 bundle) |
| `VITE_SUPABASE_ANON_KEY` | C1 SPA(建立 supabase client) | build-time env / CI secret | publishable,可進 bundle;**非** service_role |
| `SUPABASE_URL` | C2 EF / C3 Worker / B1 scripts | EF secret / `wrangler.toml [vars]` / `.env` | 公開 |
| `SUPABASE_SERVICE_ROLE_KEY` | C2 EF / C3 Worker / C5 / B1 | **EF secret** / `wrangler secret put` / `.env`(本機,gitignore) | **機密,絕不進 bundle、絕不 commit** |
| `WORKER_URL`(公開 LP base) | C1 SPA 組公開連結 / EF 回傳 url | build-time env | 公開 |
| `SUPABASE_ACCESS_TOKEN` | B1 `supabase` CLI 部署 EF / migration | CI secret / 本機環境 | 機密 |
| `CLOUDFLARE_API_TOKEN` | B1 `wrangler deploy` | CI secret | 機密 |
| Google Sheets 憑證(三選一) | B1 `import-from-sheets.js` | `.env`(gitignore) | 機密 |

安全紅線(對齊 `.gitignore` 與 `CLAUDE.md`):
- `.env` / `.env.local` / `.env.production` / `.mcp.json` 已 gitignore;**service_role key 永不寫進前端、永不 commit、永不放進 JSON island**。
- 前端 bundle 只能有 `VITE_*`(anon key 級別)。任何 `SUPABASE_SERVICE_ROLE_KEY` 出現在 `src/` = 阻擋發布的事故。
- Worker 的 service_role 透過 `wrangler secret put SUPABASE_SERVICE_ROLE_KEY` 設定,**不**寫進 `wrangler.toml`(該檔只放公開的 `SUPABASE_URL`)。

---

## 3.5 乾淨倉庫資料夾結構(Proposed Repo Layout)

重建版維持 monorepo(三個部署 surface 同倉),但把界線講清楚。建議結構:

```
FY-school-cms/
├─ src/                          # C1 Advisor SPA(authenticated)
│  ├─ pages/                     # route-level 頁面(取代舊 1500 行 CreatePage)
│  │  ├─ LoginPage.tsx
│  │  ├─ CasesHomePage.tsx       #(案件首頁,取代 Dashboard)
│  │  ├─ LpWizardPage.tsx        #(LP 產生器 wizard,取代巨無霸 CreatePage)
│  │  ├─ ConsultPage.tsx         #(諮詢模式)
│  │  └─ QuoteWizardPage.tsx     #(報價 wizard)
│  ├─ components/                # 可重用 UI
│  ├─ hooks/                     # React state 包裝(useAuth / useGeneratedPages / ...)
│  ├─ lib/
│  │  ├─ supabase.ts             # 唯一 createClient(anon key + user JWT)
│  │  ├─ api/                    # 集中 Supabase queries(fail throw,不放業務邏輯)
│  │  ├─ quotation/              # 6 層算費純函式(+ 19 tests)★ 與 EF 共用
│  │  ├─ student-filter/         # 過濾純函式(+ 73 tests)
│  │  └─ sku/                    # ★ 新增:SKU 組裝/解析純函式(VENDOR-CAMPUS-PROGRAM-WEEKS-CUR)
│  ├─ types/                     # DB row types / domain types(snapshot type 在此)
│  ├─ styles/tokens.css          # 玫瑰+金 視覺 token(LP 設計沿用)
│  ├─ App.tsx                    # BrowserRouter + ProtectedRoute
│  └─ main.tsx
│
├─ supabase/                     # C4 + C2
│  ├─ migrations/                # 已 apply 的 schema(含 SKU UNIQUE、RLS、quotes 快照表)
│  ├─ functions/
│  │  ├─ generate-page/          # C2:render 23-section + JSON island + 寫 html_content
│  │  └─ _shared/                # ★ EF 與 SPA 共用的 render/island helper(從 src/lib 鏡像或 import)
│  └─ config.toml
│
├─ cloudflare-worker/            # C3 Public LP Worker
│  ├─ src/index.ts               # cache + 回源拉 html_content(runtime 零業務 DB)
│  └─ wrangler.toml              # [vars] 只放 SUPABASE_URL;service_role 走 secret
│
├─ scripts/                      # B1:ETL / seed / 驗證
│  ├─ import-from-sheets.js      # Google Sheets → 6 表(--commit 用 service_role)
│  ├─ seed-skus.js               # ★ 新增:回填/驗證 5 校(ILAC/ILSC/KAP/EC/CG)SKU
│  └─ validate-import.sql
│
├─ docs/spec-kit/                # ★ 本重建 spec kit(本章 = 03)
├─ design/                       # LP 視覺 spec(CARD_VARIANTS / PAGE_STRUCTURE / 23-section)
├─ .env.example                  # 變數範本(真值在 .env,gitignore)
├─ vite.config.ts                # base: '/FY-school-cms/'
└─ package.json                  # scripts:dev/build/deploy/test
```

關鍵調整(相對現況):
- **新增 `src/lib/sku/`**:把 SKU 組裝/解析設成 day-1 純函式模組,SPA 與 EF 都引用,確保「顯示的 SKU」與「DB UNIQUE 的 grain」同一套規則(原則 6)。
- **新增 `supabase/functions/_shared/`**:EF 與 SPA 共用 render/island/quotation helper 的鏡像點,避免「公開頁試算」與「報價算價」邏輯漂移(原則 4)。Deno EF 無法直接 import `src/`,故以 `_shared` 鏡像 + 測試對齊。
- **`scripts/seed-skus.js`**:重建版第一步就把既有 `tuition_tiers` 的 random UUID 補上穩定 SKU 並驗證 5 校無衝突(細節見第 04 章)。
- 移除根目錄雜物:現況 untracked 的 `API`(空檔)與 `.codex/` 應在重建時決定 commit / gitignore / 刪除,不帶進乾淨倉。

---

## 3.6 測試與 CI / Deploy 故事

### 3.6.1 測試層(vitest)

| 層 | 工具 | 範圍 | 現況 |
|---|---|---|---|
| 純函式單元測試 | **vitest**(`npm run test` = `vitest run`) | `src/lib/quotation/`(19 tests)、`src/lib/student-filter/`(73 tests)、**新增** `src/lib/sku/` | quotation 19 + filter 73 已綠;**但 quotation 引擎尚未被任何 UI / EF 呼叫**(重建版要接線) |
| API / hooks | vitest + mock supabase | `src/lib/api/`(query shape)、hooks(state machine) | 重建補 |
| EF render / island | vitest(對 render 純函式)+ 契約測試 | 23-section render 不漏 section;island JSON schema 合法;SKU 出現在 island | 重建補(現況 EF render 是 1168 行單檔,需拆出可測 helper) |
| RLS 政策 | SQL 測試 / `supabase` 本機 stack | authenticated 能/不能 讀寫;**斷言無任何 `TO anon` policy** | 重建補(見第 05 章) |
| 公開頁煙霧測試 | wrangler dev + fetch | cache HIT/MISS、404/400/405、回源 header | 重建補 |

> **重建版的「驗收綠燈」定義**:`npm run test` 全綠 **且** quotation 引擎被 EF island + 報價 wizard **實際呼叫**(不再是孤兒);**且** 一條斷言「grep `src/` 無 service_role、grep policies 無 `TO anon`」的守門測試通過。

### 3.6.2 CI / Deploy pipeline(建議)

```
PR / push to main
  │
  ├─ job: ci
  │   ├─ npm ci
  │   ├─ npm run lint                  # eslint
  │   ├─ tsc -b                        # type check(build 的前半)
  │   ├─ npm run test                  # vitest run(quotation/filter/sku/RLS-shape)
  │   └─ guard: 掃 src/ 無 SERVICE_ROLE / 無 TO anon policy
  │
  └─ on main 綠燈後(可手動 gate):
      ├─ deploy-spa:    npm run build && gh-pages -d dist      (需 VITE_* secrets)
      ├─ deploy-ef:     supabase functions deploy generate-page (需 SUPABASE_ACCESS_TOKEN)
      └─ deploy-worker: wrangler deploy(cloudflare-worker/)    (需 CLOUDFLARE_API_TOKEN + secret)
```

要點:
- 三個 surface **獨立部署**,失敗互不阻塞(SPA build 壞掉不該擋 Worker 部署)。
- service_role / access token / CF token 全走 CI secret,**不**進 repo。
- migration(`supabase db push`)建議獨立 gate,人工確認後再跑,避免自動化誤改 production schema(對齊 `CLAUDE.md`「破壞性操作前先告知」)。
- 對齊 `CLAUDE.md` 工作守則:每完成一階段 `git commit`,網路操作(部署 / push)加 retry loop(最多 3 次、間隔 5 秒)。

---

## 3.7 對 Nexus 的防腐邊界(Anti-corruption Boundary)

本章所有 component 都必須遵守「**不對 Nexus / 凍住 entity 產生硬依賴**」:

- **身份**:重建版自帶 Supabase Auth(C1 useAuth + ProtectedRoute);未來 Nexus 接管 SSO 時,只替換 `useAuth` 的 session 來源,**不改** RLS 仍 `TO authenticated` 的事實。`LoginPage` 是可拆卸件。
- **vendor**:全系統 vendor 一律 **string slug**(`ILAC` / `ILSC` / `KAP` / `EC` / `CG`),**無 vendors 表**。SKU 第一段、報價快照的 vendor 欄都存 slug,不存 UUID。
- **報價快照**:`quotes` 表(本系統內)的所有對外 FK(case / vendor / lp_config)**nullable**,並在開單時 **copy values**(校名、課名、SKU、價格)而非存參照。Nexus 上線後可回填 FK,但歷史快照不受其 schema 變動影響(原則 7)。
- **凍住清單**:`cases` / `vendors` 表 / `lp_school_config` / Nexus master plan = 本章任何資料流不得 join、不得當作生成或服務 LP 的必要條件。

---

## 3.8 本章與其他章的接點(Chapter Seams)

| 接點 | 本章給的承諾 | 交棒給 |
|---|---|---|
| SKU = `VENDOR-CAMPUS-PROGRAM-WEEKS-CUR`,DB UNIQUE | 架構上 SPA/EF/island 都引用同一 `src/lib/sku/` | **第 04 章**(資料模型 / SKU schema) |
| RLS 全 `TO authenticated`,無 `TO anon` | 三條 path 的角色已釘死 | **第 05 章**(RLS policy 逐條 + owner 欄位) |
| 23-section render + JSON island | EF 是唯一 render 點;island 帶 SKU | **第 06 章**(LP 23-section + cache 失效) |
| quotation 6 層引擎被實際接線 | island 試算與報價 wizard 共用純函式 | **第 07 章**(報價流程 + 快照 + 視角分層) |
| Capture endpoint 位置與身份 | C5 append-only `lp_events`,service_role 寫 | **第 08 章**(分析報表,選配) |

---

## 3.9 一句話總結

> **5 個 component、3 種身份、3 條資料流。** 顧問端是 authenticated(走 RLS);LP 生成靠 service_role EF 把 23 section + JSON island 烘成靜態 HTML;公開頁是 Cloudflare Worker 的 edge-cached static HTML(runtime 零業務 DB);anon 角色全程不用,service_role 只在 EF/Worker/scripts 出現;報價是對 Nexus 防腐的 snapshot。SKU、23-section、報價接線、正確 RLS 在重建版是 day-1 一等公民,不是事後補。
