# CLAUDE.md — FY-school-cms 工作憲法

> 這份是**專案最高層操作手冊**。每個 session 開始先讀這份。
> 內容衝突時,以這份 > 其他 docs。改動本檔需 jojo 同意。
> 最後更新:2026-06-26(MVP 重定範圍 v2 — 已過對抗性審查修正)

---

## 0. 一句話定位

**放洋顧問用的選校 + LP 生成 + 報價系統**:顧問選校 → 生成互動式 LP → 諮詢時在自己畫面 demo 給學生看 → 學生選課程方案 + 住宿 → 諮詢結束直接開報價單。

---

## 1. 認證 / 角色模型(全系統地基,先懂這個)

> ⚠️ 這節是後面 RLS / 報價 / 權限的前提。先前 v1 對 RLS 誤診,這節是**已驗證的真實架構**。

| 角色 | 誰 | 走哪條路 | RLS |
|---|---|---|---|
| `service_role` | Cloudflare Worker(讀 generated_pages.html_content)、generate-page EF(讀所有內容表) | server 端 | **繞過 RLS** |
| `authenticated` | 顧問前台(App.tsx ProtectedRoute + useAuth) | CMS SPA | 受 RLS 管,既有 policy 已放行 |
| `anon` | **沒人用** | — | 公開 LP 是 Worker 服務的**靜態 cache HTML**,不在 runtime 連 DB |

**三條鐵律**:
1. 公開 LP = Worker 服務 `html_content`(靜態,runtime 不連 DB)→ LP 不靠 anon 讀任何表。
2. 顧問 = `authenticated`。「advisor RLS」= policy 條件 `TO authenticated`。
3. server 寫入(EF / scripts / Worker)走 `service_role`。

**推論**:任何「加 anon SELECT」都是錯的(擴大曝險)。RLS policy 一律 `TO authenticated`,anon 全擋。

---

## 2. MVP 定義(jojo 重定範圍 2026-06-26)

### 2.1 MUST HAVE

| # | 項目 | 說明 |
|---|---|---|
| M1 | 顧問選校 → 生成 LP → 打開連結畫面 demo | 已能跑(scroll_v1) |
| M2 | **LP 互動:課程方案 + 住宿可選** | 學生諮詢時選,sec07 要可互動(現在固定 12 週靜態)。⚠️ 是**重寫**不是 port,見 §5.4 |
| M3 | **諮詢結束 → 確認方案 → 直接開報價單** | 報價做進 CMS(carve-out,§5) |
| M4 | **LP 23 段渲染**(目前 10 段) | 至少補到 MVP Tier(§4) |
| M5 | **SKU 化校區資料** | 統一灌入(§6) |
| M6 | 5 真實校資料完整(ILAC/ILSC/Kaplan/EC/CG) | 等 jojo 交付真值(§7) |
| M7 | RLS 安全修復 | 🔴 上線前必過(§3.4)。修法 = authenticated-only,**非 anon** |
| M8 | 部署:gh-pages + Cloudflare Worker | 已有,RLS 後重驗 |

### 2.2 NOT IN MVP

- ❌ Nexus / TKB 整合、cases / vendors / lp_school_config entity(§3 紅線)
- ❌ 學生帳號 / SSO、學生自有裝置即時同步(MVP 顧問單畫面驅動,見 §5.3)
- ❌ LP sec_area / climate / spend / flight(需新表 + 內容,Post-MVP)
- ❌ ABCD card variant UI 打磨(EF 已支援,MVP 預設 A)
- ❌ 多校跨幣別報價總和(MVP 單校 happy path)

---

## 3. 🔴 紅線 / 凍住區

### 3.1 絕對不碰

| 區域 | 為什麼 |
|---|---|
| 既有 **27 個 legacy LP**(template_version='legacy')html_content | 學生在看,已 cache。永不重生成 |
| `src/lib/quotation/calculate.ts` 計價數學 | 19 測試是合約,只加 mapper 不改公式 |
| Phase 20 entity(`src/types/phase20.ts`) | Nexus SSOT,等 master plan |
| migrations-drafts 的 **cases / vendors / lp_school_config** | Nexus 衝突(身分/廠商 master) |
| `src/lib/api/cases.ts` | 查不存在的表,dormant,不啟用 |

> legacy LP 數量 27 是查 `count(*) where template_version='legacy'` 的當下值,G6 前重查確認。

### 3.2 可安全解凍(本 MVP)

| draft | 解凍條件 |
|---|---|
| `_DRAFT_quotations.sql` | ⚠️ **檔案現狀有 `case_id UUID REFERENCES cases(id)` 硬 FK,cases 表不存在,照原樣 apply 會失敗**。必須先改:① 拿掉 `REFERENCES cases(id)`(留 `case_id UUID` bare nullable)② vendor 改 no-FK 字串欄 ③ 保留 lp_id→generated_pages / school_id→schools(這兩個表存在,安全)。改完才 apply |
| `_DRAFT_tuition_tiers_extension.sql` | 純 additive(`ADD COLUMN IF NOT EXISTS` fixed/peak/unit/category),無 FK,可直接 apply。⚠️ apply 前 grep `calculate.ts` 確認 `unit` 字串字面值匹配引擎 switch |

### 3.3 動凍住區的義務

- 動 production schema 前發「**要動了**」+ 列 SQL 等 GO
- 解凍 draft 的 commit message 註明「Nexus-safe carve-out:為什麼不衝突」
- 跨 chat 協調(Nexus/TKB/報價)→ 提醒 jojo 通知其他 chat

### 3.4 RLS 真實狀態 + 修復範圍

| 對象 | 現狀 | 動作 |
|---|---|---|
| 既有 6 內容表(schools/campuses/programs/tuition_tiers/city_info/housing) | RLS **on** + 各 1 policy | ✅ 已保護。只需驗 policy 正確(authenticated 可讀、anon 擋) |
| **4 新表(day_schedule/voices/faq/photos)** | RLS **OFF**(Supabase advisor ERROR) | 🔴 `ENABLE RLS` + SELECT policy `TO authenticated`(**非 anon**)+ 寫入留 service_role |
| `page_templates` | RLS on,**0 policy**(只 service_role 能讀) | 現狀安全(EF 用 service_role)。但記住:未來 authenticated 前台若要讀(如 Phase 2 預覽)會靜默回空 → 那時才加 authenticated SELECT policy |
| `ep_consult_notes / generated_pages / promoted_faqs / qa_items` | always-true 寫 policy(advisor WARN) | G0 一併審:收緊成 authenticated/service_role,否則 §11 get_advisors gate 過不了 |

---

## 4. LP 23 段地圖

> 源:`/Users/jojowu/fanyang-consult/fanyang-consult.html`(23 段,renderAll L3441-3466)。
> ⚠️ `design/PAGE_STRUCTURE.md` 段落標籤過時錯誤,以本表為準,Phase 0.3 修。

### 4.1 已 port(10 段)— 表為 **EF 輸出順序**(非 source 順序;sec08 在 sec07 前是 renderAll 刻意)

| 段 | renderSec | 資料源 |
|---|---|---|
| sec01 Hero | renderSec01 | schools |
| sec02 ABCD 卡片 | renderSec02 | schools+campuses+programs |
| sec03 比較表 | renderSec03 | 多表 |
| sec04 氛圍 | renderSec04 | schools.mood_* / pills |
| sec_photos 照片(advisor-only) | renderSec_photos | photos |
| sec08 一天 | renderSec08 | day_schedule |
| sec07 學費試算 | renderSec07 | programs(⚠️ 靜態,M2 改互動) |
| sec09 persona | renderSec09 | persona_match |
| sec_voices 見證+國籍 | renderSec_voices | voices + nationality_breakdown |
| sec_faq FAQ | renderSec_faq | faq |

### 4.2 缺 13 段 — 分 Tier

- **T1(static,零新資料)→ 16/23**:sec10 CEFR / sec11 takeaways / sec12 visa / sec13 CTA / sec_safety / sec_return(advisor-only)
- **T2(既有資料 reshape)→ 18/23**:sec05 課程 / sec06 住宿(也是 M2 互動資料基礎)
- **T3(需 FX 決策)→ 19/23**:sec_costfull
- **Post-MVP(需新表)→ 23/23**:sec_area / sec_flight / sec_climate / sec_spend

### 4.3 補段紀律

- 嚴格對齊 LP source 函式邊界(精確 line range,當場 diff)
- **最終 23 段順序固定**:每段有已知插入點;Post-MVP 段即使空也佔 ordered slot,之後補不重排
- 保留情感錨點:sec01 / sec04 / sec08 / sec11 / sec13
- advisor-only 段(sec_photos / sec_return)帶 `class="advisor-only"`,demoToggle 控制
- 新段加 EF replace chain 同時加 template slot;EF query 失敗 graceful(degrade 空,不整頁 throw)

---

## 5. 報價系統 carve-out(Nexus-safe)

> 目標:報價做進 MVP,Nexus 到了是 additive backfill 不是 teardown。

### 5.1 設計原則(每條紅線)

1. 引擎不動:`calculate.ts` 19 測試合約,只加 input mapper,不改公式
2. quote = **snapshot 複製值**(payload + result JSONB),把當下價格/匯率/設定**複製進去**(不存 tuition_tiers UUID reference — UUID 在 Phase 4 重灌會變)
3. forward-ref 全 nullable bare 欄(`case_id` / `lp_id` / `school_id`),不建 cases FK
4. vendor 用**字串 slug**(literal,不來自任何表),不建 vendors 表 FK
5. quote_number CMS 自己編(§5.5)
6. denormalized student snapshot 存報價內,不依賴 cases

### 5.2 MVP 報價最小路徑

```
Step 1  改 _DRAFT_quotations.sql(拿掉 cases FK / vendor 字串,見 §3.2)→ apply + RLS(TO authenticated)
        MVP 欄:quote_number / payload / result / final_twd / currency_primary / weeks /
                start_date / status / lp_id(null) / school_id(null) / case_id(null,bare) / created_at
Step 2  apply tuition_tiers_extension(MVP 預設 unit=按週、fixed/peak=0)
Step 3  from-db.ts mapper:tuition_tiers → Course(wf=weeks_min, wt=weeks_max||99,
                price=price_per_week, fixed/peak=0);housing → Accommodation(週費);
                placement_fee → admin/arrange Fee;rates/adminSettings 用 defaults snapshot
Step 4  QuotePanel:program/housing 下拉 + weeks + start_date → live 呼叫 calculate()
Step 5  「開報價」→ 寫 payload/result/final_twd + 生成 quote_number
```

### 5.3 LP → 報價的接線(MVP 用 URL-state,顧問單畫面驅動)

> ⚠️ **runtime 無 DB 約束**:公開 LP 是 Worker 服務的靜態 cache HTML,client 端**不能連 DB**。
> jojo 的流程是「顧問在自己畫面 demo LP 給學生看」→ 顧問單畫面,不需跨裝置即時同步。

**MVP transport = URL state**(最簡、無新表、無新 anon 寫入面):
- sec07 互動選擇寫進 URL(`?weeks=12&program-{school}=X&housing-{school}=Y`)
- 顧問在 LP 選完 → 該 URL 帶完整選擇 → CMS QuotePanel 讀 URL params 帶入
- **不需** lp_selection 表(那是跨裝置即時同步才需要,Post-MVP)

> 🟡 jojo 決策點:若要「學生自己裝置選 → 顧問 CMS 即時看到」,需 capture-EF(LP client POST 到 EF,EF service_role 寫 lp_selection 表)。MVP 先不做,URL state 夠用。

### 5.4 sec07 互動 = 重寫(不是 port)

> ⚠️ source `fanyang-consult.html` Sec07State(L4657-4899)依賴一堆 client graph(visibleCampuses / CAMPUS_DATA / State.rates / switchTab / bindCalcCard…),scroll_v1 都沒有。且 runtime 無 DB。

正確做法:
1. EF 生成時 emit per-school JSON island:`<script>window.SEC07_DATA = {courses, accomm, currency, rate, livingMonthly}</script>`
2. 寫**新的** vanilla JS(可鏡像 source 邏輯,但對接 island,新 binding)
3. 統一 state shape(擴 LPCalcState 帶 per-campus picks,或取代它)
4. write picks 到 URL + DOMContentLoaded read/hydrate(目前 LPCalcState 是 dead stub)

風險最高項,Phase 2 當**重寫**估,不是 copy-paste。

### 5.5 quote_number 規則

- 格式:`Q-YYYYMMDD-NNNNN`(日期前綴 + 補零序號)
- backing:Postgres sequence + `UNIQUE(quote_number)` + BEFORE INSERT trigger
- 🟡 jojo 決策點:序號**全域遞增**(NNNNN 不每日歸零,最簡)vs **每日歸零**(需 counter row)。MVP 建議全域。

### 5.6 邊界 / 空狀態(諮詢真的會遇到)

| 情境 | LP / QuotePanel 行為 |
|---|---|
| 學校無 programs | sec05/sec07 該段隱藏 + advisor-only 提示「無可售課程」,**不出壞下拉** |
| program 無 tuition_tiers | 該 program 不進下拉 |
| weeks 落在所有 band 外 | clamp 到最近 band,或擋「開報價」並說原因 |
| calculate() 回 emptyResult | 不可開金額 0 / 空報價;顯示「資料不足無法試算」 |

---

## 6. SKU 規範(資料統一灌入合約)

> 目的:任何廠商資料機械式、可重複灌入,不靠 name-string。

### 6.1 可賣單位(atomic sellable unit)

**一列 tuition_tiers = 廠商某課程 × 某校區 × 某週數帶 × 某幣別 × 某有效期** — 學生真正買的,報價一行 reference 的層級。

### 6.2 SKU 格式 + 唯一性

```
sku(人類可讀標籤) = VENDOR-CAMPUS-PROGRAM-WEEKS-CUR[-SEASON]
```

⚠️ **DB 唯一性不靠 sku 字串**,靠完整 grain:
```
UNIQUE(program_id, campus_id, weeks_min, weeks_max, currency, valid_from)
```
sku 是 derived label(含 currency 避免撞號),upsert 以 grain tuple(或含全維度的 sku)為 conflict key。

| 段 | 來源 | 範例 |
|---|---|---|
| VENDOR | 字串 slug(literal,**不來自任何表**) | ILAC / ILSC / KAP / EC / CG |
| CAMPUS | **新欄** campuses.code(需先加+填 10 個) | TOR / VAN / BNE / LON / SYD |
| PROGRAM | programs.code(⚠️ 24 個只 6 個有值,18 個 NULL 需先 backfill) | GE15 / IELTS / INTACAD |
| WEEKS | W + zero-pad weeks_min(+ weeks_max 區隔 band) | W12 / W04 |
| CUR | 幣別(避免同課跨幣撞號) | CAD / GBP / USD |
| SEASON(選用) | 旺季才加 | PEAK / STD |

**5 MVP 校 → slug 對映**:ILAC→`ILAC`、ILSC→`ILSC`、Kaplan→`KAP`、EC→`EC`、CG→`CG`。
(EP / SGIC 是未來其他廠商,不在 MVP 5 校)

**範例**:`ILAC-TOR-GE15-W12-CAD`、`CG-CEB-SPARTA-W04-USD`
**住宿平行 SKU**:`VENDOR-CAMPUS-HOUSING-TYPE[-SEASON]`,例 `ILAC-TOR-HS-SINGLE`

### 6.3 SKU 前置(Phase 4 必先做,非純機械)

1. `ALTER TABLE campuses ADD COLUMN code TEXT` + 填 10 校區(city→code,半機械)
2. backfill 18 個 NULL `programs.code`(GE15/IELTS… 是**內容決策**,需 jojo 給或核可慣例)
3. 兩者完成才加 `UNIQUE` 與 SKU 生成;format CHECK 在 backfill **後**才上(否則 insert 壞)

### 6.4 SKU 規則

- 灌入改 delete+reinsert → **upsert**(`ON CONFLICT (grain) DO UPDATE`)→ idempotent,UUID 不亂
- 父層用穩定 code 解析(vendor slug → campus code → program code),不用 name string
- load-time 驗:① sku regex ② **撞號擋**(兩列同 grain → reject,不靜默覆蓋)③ week-band overlap ④ 每 program ≥1 tier
- WEEKS 編進 SKU;lessons/hours 不編(描述性 + sentinel 0 問題)

---

## 7. 資料交付格式(jojo 要給的 — 範本)

> 缺真值是最大瓶頸。填好給我 → 我 batch 灌。機械性問題我自己處理;只「真實事實缺漏」回報待補清單。
> ⚠️ 缺料顯 placeholder「請洽顧問取得 X」,**絕不捏造**。

### 7.1 schools 行銷欄位(TSV)
```
school_name	mood_tag	mood_desc	mood_scene	pills(逗號分隔)
ILAC	都會職場・打工銜接	在多倫多市中心...	走出教室就是 Bay Street...	市中心,地鐵直達,商英強,打工度假
```
### 7.2 city_info 機票
```
city	flight_estimate
Toronto	台灣轉機 約 NT$28,000–42,000
```
### 7.3 day_schedule
```
school_name	campus	sort_order	time	title	description
ILAC	Toronto	1	07:30	Homestay 早餐	和寄宿家庭用英語...
```
### 7.4 voices
```
school_name	quote	student_name	student_detail	sort_order
ILAC	我一邊上課一邊打工...	W. Hsu	25 歲・打工度假・24 週	1
```
### 7.5 photos(真實 URL,目前 placehold.co)
```
school_name	campus	image_url	caption	sort_order
ILAC	Toronto	https://...真實圖URL	多倫多市中心校區	1
```
### 7.6 faq(school_name 空=通用)
```
school_name	question	answer	sort_order
	簽證被拒學費可退嗎?	依放洋與校方合約...	1
CG	斯巴達校區真的不能外出嗎?	平日採斯巴達式...	4
```
### 7.7 SKU 課程資料(新廠商上架 — 含 code,M5 關鍵)
```
sku	vendor	campus_code	program_code	weeks_min	weeks_max	price_per_week	currency	season
ILAC-TOR-GE15-W12-CAD	ILAC	TOR	GE15	12	23	380	CAD	STD
```
> sku 留空我可自動算;帶 sku 讓 sheet 成 source of truth + 人工可視 dedup。
> ⚠️ campus_code / program_code 是新 key,§6.3 backfill 完才能跑(program_code 需 jojo 核可慣例)。

---

## 8. Phase 進度 + 查核點(gate)

> 時間 jojo 不抓。查核點條件**全綠才進下一 phase**(fail stop)。每 sub-step 主動回報。
> **gate 由誰判綠**:工程驗證 → jojo 確認。

### Phase 0 — 安全 + 基線 + rollback 地基 🔴 最優先
| Step | 動作 |
|---|---|
| 0.1 | 4 新表 `ENABLE RLS` + SELECT policy `TO authenticated`(非 anon)+ 寫入 service_role |
| 0.2 | 既有 6 表驗 policy(authenticated 可讀 / anon 擋);收緊 §3.4 always-true 寫 policy 表 |
| 0.3 | 修 design/PAGE_STRUCTURE.md 段落標籤 |
| 0.4 | EF deploy 自動化(SUPABASE_ACCESS_TOKEN → supabase CLI,不再 inline ~1170 行)+ 驗 deployed == repo |
| 0.5 | **rollback 地基**:每 migration 配 down SQL(§9.1 三件套→四件套);Phase 0 動表前先 snapshot/backup 受影響表 |

**G0**:① get_advisors 無 ERROR(4 表 + always-true 表處理)② 寫測試證 **anon 不能讀也不能寫** 4 新表、**authenticated 能讀** ③ EF CLI deploy 且 deployed==repo ④ 既有 27 legacy LP + 顧問前台讀取無退化 ⑤ down SQL + backup 就緒

### Phase 1 — LP 補段 T1(static 6 段)→ 16/23
**G1**:① 6 段在 template + EF chain ② DEMO 3 LP 重生成 6 段渲染 ③ sec_return advisor-only 正常 ④ 既有 10 段無退化

### Phase 2 — LP 互動化(M2,重寫)→ 18/23
sec05/06 + sec07 互動(EF emit JSON island + 新 vanilla JS,§5.4)+ URL state 接線
**G2**:① 學生能選 program+housing+weeks ② 選了即時重算 ③ refresh/分享連結保留選擇(URL state)④ 單校 happy path ⑤ 邊界:無 programs 的校不出壞下拉(§5.6)

### Phase 3 — 報價 carve-out(M3)
**G3**:① quotations apply(cases FK 已拔)+ RLS authenticated ② calculate.ts 19 測試綠(沒動公式)③ 顧問從 LP URL 選擇一鍵帶 QuotePanel 開報價 ④ 報價 snapshot **複製值**(改 tuition_tiers 不影響已開報價,測試證)⑤ quote_number 格式正確 + 連兩張不撞號 + UNIQUE 強制 ⑥ 空狀態:無課程的校不能開空報價

### Phase 4 — SKU 資料層(M5)
**前置(§6.3)**:campuses.code 加+填 / programs.code backfill 18 NULL
**G4**:① 全 38 tier 有 SKU 且 grain UNIQUE ② 重灌同廠商 idempotent(UUID 不變,測試證)③ load 驗:撞號擋 + week-band overlap ④ import template 帶 code/sku 欄

### Phase 5 — 補真值(M6)
**G5**:① 5 校 LP 全段真內容(無 placeholder,除非真缺)② 缺料標「待補」不捏造 ③ 待補清單回 jojo

### Phase 6 — sec_costfull + 上線(M8)
**G6**:① 抽 3 LP(`_test-demo-maple` + 2 真實校 slug)走 select→LP→互動→開報價,定義「成功」= 全 ported 段渲染 + 學生能選 + 顧問開出有效 quote_number + 無 console/network error ② RLS 再驗(G0 沒退化)③ 既有 27 legacy LP 抽驗無損 ④ gh-pages + worker 上線

### Post-MVP(不阻擋上線)
sec_area/climate/spend/flight(新表)、ABCD UI、CreatePage 拆檔、後台 CRUD、跨裝置 lp_selection 即時同步、多校跨幣報價、audit log、staging、daily FX cron、報價 PDF/wizard(等 Phase 20 解凍)

---

## 9. 變更 SOP

### 9.1 Migration 四件套(同時做)
1. up migration file → `supabase/migrations/<ts>_<name>.sql`
2. **down/revert SQL**(同檔註解區或對應 down 檔)— 每 migration 必附
3. apply(`mcp__supabase__apply_migration`)
4. git commit(file + 驗證 SELECT)

動 production schema 前發「**要動了**」+ 列 SQL 等 GO。動表前 snapshot 受影響表(§8 Phase 0.5)。

### 9.2 EF deploy 紀律
- **永遠部署 repo 完整版**,不為省 token 砍任何 path/section(含 legacy path)
- 抓取以 function/section 真實邊界精確取出,當場 diff
- deploy 前 sanity:brace 平衡 / backtick 偶數 / 關鍵字串存在
- Phase 0.4 後改 CLI;每次 deploy 後驗 deployed == repo

### 9.3 Template 同步
- 改 template 同步 `page_templates` DB(`replace()` 只動變動行,不重送全檔)
- `supabase/templates/comparison_scroll.html` 是 source of truth

### 9.4 commit 格式
```
類型(階段): 說明 — 查核點狀態
```
feat/fix/refactor/docs/chore。結尾掛:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## 10. 驗證紀律

### 10.1 每段 port 後
DEMO_MAPLE(富資料→真內容)+ DEMO_ISLAND(缺料→placeholder),抓 DB html_content 該段驗。

### 10.2 Placeholder vs 捏造(鐵則)
缺料顯「請洽顧問取得 X」,絕不捏造假數字/見證。機械性問題自己處理。只「真實事實缺漏」回報待補清單。

### 10.3 測試
動 `src/lib/quotation/` 或 `student-filter/` → `npm run test`。報價公式改動 → 19 測試全綠才算過(要改公式先問 jojo)。

---

## 11. 安全 gate(上線前)
- 🔴 4 新表 RLS on + authenticated-only SELECT + anon 全擋
- always-true 寫 policy 表(§3.4)收緊
- 不把 service role key / API key 寫進任何 file/commit
- 公開前 `mcp__supabase__get_advisors`(security)→ 無 ERROR(critical/high)

---

## 12. 工作守則
- 預設**繁體中文**;程式碼/指令/技術名詞英文。回覆精簡。
- 任務開始:列步驟(3-7)+ 風險點 + 「確認方向」等 GO。
- 每步主動回報;遇錯先說原因再給解法,不靜默重試。不確定就問。
- 網路操作加 retry(3 次,間隔 5 秒)。破壞性操作先告知等確認。

---

## 附錄 A — 關鍵檔案
| 檔 | 用途 |
|---|---|
| `supabase/functions/generate-page/index.ts` | EF(LP 生成,10 renderSec,~1170 行) |
| `supabase/templates/comparison_scroll.html` | scroll_v1 template(source of truth) |
| `src/lib/quotation/calculate.ts` | 報價引擎(19 測試,🔴 不改公式) |
| `src/pages/CreatePage.tsx` | 顧問選校頁(~1700 行,Post-MVP 拆) |
| `src/components/lp/Card.tsx` | ABCD variant(B1-3,本批 commit) |
| `cloudflare-worker/src/index.ts` | 公開 LP Worker(service_role 讀 html_content) |
| `/Users/jojowu/fanyang-consult/fanyang-consult.html` | 23 段 LP 設計源(port 對照) |
| `scripts/import-from-sheets.js` | 灌入(delete+reinsert,Phase 4 改 upsert) |
| `IMPORT_TEMPLATES.md` | sheet 範本(Phase 4 加 code/sku 欄) |
| `migrations-drafts/_DRAFT_quotations.sql` | ⚠️ 有 cases FK,apply 前必改(§3.2) |
| `docs/MVP_PLAN.md` | MVP 詳細展開版 |

## 附錄 B — Card variant B1-3 決策(jojo 要我推薦)
**推薦:commit 保留 ABCD**。EF renderSec02 已 server-side 支援,Card.tsx additive、surface 小,commit 比 rollback 快。MVP 諮詢預設 A,ABCD 非上線阻擋。整合查核點驗 compile+render,壞再 rollback。

## 附錄 C — 待 jojo 拍板的決策點
1. **Card B1-3**:commit(推薦)or rollback
2. **LP→報價 transport**:URL state 顧問單畫面(推薦,MVP)or capture-EF 跨裝置(Post-MVP)
3. **quote_number 序號**:全域遞增(推薦)or 每日歸零
4. **program_code 慣例**:18 個 NULL program code(GE15/IELTS…)需 jojo 給或核可命名慣例(SKU 前置,Phase 4 卡這個)
