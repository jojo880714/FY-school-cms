# CLAUDE.md — 重建版工作憲法(Rebuild Constitution)

> 這是「**重建後專案**」的工作憲法。若走 full rebuild(路線 C),新 repo 直接放這份當根 CLAUDE.md。
> 若走 HYBRID(路線 B,推薦),以現役 `/CLAUDE.md` 為準,本檔當「終態設計紀律」參考。
> 規格細節在 `rebuild/01`–`08`;本檔是執行紀律(指令層)。

---

## 0. 定位 + 重建立場

放洋顧問用的**選校 + 互動式 LP 生成 + 報價**一體化工具。重建立場:**保留**驗證過的 stack(React+Vite+TS+Supabase+CF Worker)與資產(報價引擎/選校過濾/LP 設計/資料),**把 SKU / 完整 23 段 LP / 報價動線 / 正確 RLS 做成 day 1 一等公民**。產品概念不變(ch01)。

---

## 1. 認證 / 角色模型(地基,先懂)

| 角色 | 誰 | RLS |
|---|---|---|
| `service_role` | Worker(讀 html_content)、generate-page EF(讀內容表)、灌入腳本 | **繞過 RLS** |
| `authenticated` | 顧問前台(ProtectedRoute + useAuth) | 受 RLS,policy 一律 `TO authenticated` |
| `anon` | **沒人用**(公開 LP 是 Worker 靜態 cache HTML,runtime 不連 DB) | 全擋 |

**鐵律**:RLS policy **永遠 `TO authenticated`,永不寫 `TO anon`**。公開 LP 不靠 anon 讀任何表。

---

## 2. 紅線(碰了會出事)

| 紅線 | 說明 |
|---|---|
| `src/lib/quotation/`(報價引擎) | **carry-over-as-is,19 測試是合約**。只加 input mapper,**不改 calculate.ts 公式** |
| `src/lib/student-filter/`(選校過濾) | carry-over-as-is,73 測試。只擴不改既有 |
| 27 個 legacy LP 的 html_content | 🔴 **byte-for-byte 搬,永不重生成**(學生在看)。md5 gate 證一致 |
| Phase 20 entity / cases / vendors / lp_school_config | 凍住(Nexus SSOT)。報價用 Nexus-safe snapshot,不依賴 |
| RLS | day 1 `ENABLE RLS` + `TO authenticated`,anon 全擋 |
| 缺料 | placeholder「請洽顧問取得 X」,**絕不捏造** |

---

## 3. 資料模型契約(SKU-first,詳 ch02)

- 可賣單位 = 一列 `tuition_tiers` = program×campus×week-band×currency×validity
- DB 唯一性:`UNIQUE(program_id,campus_id,weeks_min,weeks_max,currency,valid_from)`
- `sku`(衍生 label)= `VENDOR-CAMPUS-PROGRAM-WEEKS-CUR[-SEASON]`,例 `ILAC-TOR-GE15-W12-CAD`
- vendor = **字串 slug**(literal,不建 vendors 表):ILAC/ILSC/KAP/EC/CG
- 4 LP 內容表(day_schedule/voices/faq/photos)day 1 開 RLS
- quotations = Nexus-safe snapshot:payload/result JSONB **複製值**、FK 全 nullable、**不建 cases FK**、vendor 字串、quote_number sequence+trigger(`Q-YYYYMMDD-NNNNN` 每日歸零)

---

## 4. LP 契約(23 段,詳 ch04)

- 23 段固定 render 順序(`RENDER_ORDER` 常數凍結;ID 數字序 ≠ render 序)
- 互動段(sec07):EF 生成時 emit `<script type="application/json">` data island(runtime 無 DB),client vanilla JS 讀 island 即時重算
- 選擇存 URL state → 餵報價(報價端用 sku 回查 + calculate() **重算**,不信任 client 金額)
- advisor-only 段(sec_photos/sec_return)用 demo-mode toggle
- 情感錨點 sec01/04/08/11/13 保留;Post-MVP 段佔 ordered slot,補時不重排

---

## 5. 報價契約(詳 ch05)

- 6 層計價(raw→vendor discount→FX buffer→commission→company discount→5% 稅→admin 淨利),引擎不動
- from-db mapper:tuition_tiers→Course / housing→Accommodation / fees→Fee
- 開單:後端 calculate() 重算驗證(防前端竄改)→ snapshot 複製值 + 生 quote_number
- 邊界:無 programs/無 tier/週數外/emptyResult → 不開空報價(ch05)

---

## 6. 建置順序 + 查核點

見 `rebuild/00_README §2`(Phase 0–6,對齊 `/CLAUDE.md §8` gate)。每 phase fail-stop:**全綠才進下一 phase**,gate 由工程驗證 → jojo 確認。

---

## 7. 變更 SOP

- **Migration 四件套**:up SQL + **down/revert SQL** + apply + commit。動 production schema 前發「要動了」+ 列 SQL 等 GO;動表前 backup。
- **EF deploy**:CLI deploy(`SUPABASE_ACCESS_TOKEN`,非 inline);永遠部署完整版不砍 path;deploy 後驗 deployed==repo。
- **Template**:repo `comparison_scroll.html` 是 source of truth,改動同步 `page_templates` DB(replace 只動變動行)。
- **守門測試**:`grep src/` 無 `SERVICE_ROLE_KEY`;`grep policies` 無 `TO anon`;報價引擎被實際呼叫;RLS 全 `TO authenticated`。
- **commit**:`類型(階段): 說明 — 查核點狀態`;結尾掛 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

---

## 8. 驗證紀律

- 每段 port 後:DEMO_MAPLE(富資料→真內容)+ DEMO_ISLAND(缺料→placeholder)驗。
- 動 quotation/student-filter → `npm run test`;報價公式改動 → 19 測試全綠才算過(要改先問 jojo)。
- 缺料 placeholder 不捏造;機械性問題自己處理;只「真實事實缺漏」回報待補清單。

---

## 9. 安全 gate(上線前)

- 4 LP 表 RLS on + authenticated-only + anon 全擋(寫測試證)
- always-true 寫 policy 表收緊
- service role key / API key 不進任何 file/commit
- 公開前 `get_advisors`(security)→ 無 ERROR

---

## 10. 工作守則

- 預設**繁體中文**;技術名詞英文。回覆精簡。
- 任務開始:列步驟(3-7)+ 風險點 + 「確認方向」等 GO。每步主動回報。遇錯先說原因。不確定就問。
- 網路操作 retry(3 次,間隔 5 秒)。破壞性操作先告知等確認。

---

## 附錄 — 規格章節索引

| 章 | 內容 |
|---|---|
| 00_README | 策略決定 + 建置順序 + 決策表 + 資料交付 |
| 01_PRODUCT_SPEC | 產品規格 + 詞彙表 |
| 02_DATA_MODEL | schema DDL(SKU-first + RLS + quotations) |
| 03_ARCHITECTURE | 架構 + 角色 + 部署 + folder 結構 |
| 04_LP_SPEC | 23 段 + JSON island 互動 |
| 05_QUOTATION_SPEC | 引擎 I/O + mapper + QuotePanel |
| 06_MATCHING_SPEC | 選校配對(73 測試) |
| 07_INGESTION_SPEC | SKU upsert 灌入 |
| 08_CONSOLIDATION | 搬遷/cut-over runbook + HYBRID 推薦 |
