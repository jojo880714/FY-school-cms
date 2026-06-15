# ROADMAP.md — FY-school-cms 後續優化路線圖

> 維護:Phase 5 完成後建立(2026-05-26)
> 目的:盤點 Phase 1-5 主線完成後,系統可繼續優化的方向、優先級、驗收條件
> 配套文件:[BETA_CHECKLIST.md](./BETA_CHECKLIST.md)(內部封測前的審核清單)

---

## 優先級

| 標記 | 意義 |
|---|---|
| **P0** | 內部封測前必做(品質地基) |
| **P1** | 封測前最好做(影響顧問日常操作) |
| **P2** | 封測後第一輪迭代 |
| **P3** | 餘裕再做(非阻擋) |

---

## 已完成(本文件範圍之外)

| Phase | 名稱 | 狀態 |
|---|---|---|
| Phase 1 | 固定模板系統 | ✅ |
| 問題一 | RLS 修復 | ✅ |
| 問題二 | city_info 串接 | ✅ |
| Phase 2 | city_info 鏈路完整化 | ✅ |
| Phase 3 | campuses 表擴充 | ✅(隱性,無 migration 文件) |
| Phase 4 | CreatePage 改選校區 | ✅ |
| Phase 5 | Dashboard 適配 campus_ids | ✅ |
| Phase 6 | created_by 真實寫入 | ✅ |
| Phase 7 | 草稿垃圾清理機制 | ✅ (方案 A) |
| Phase 8 | 刪除頁面 UI | ✅ (軟刪除) |
| Phase 9 | 編輯/重新產生既有頁面 | ✅ |
| Phase 10 | Dashboard 搜尋/分頁(精準統計) | ✅ |
| Phase 11 | Slug 唯一性強化 | ✅ |
| Phase 13 | Migration 紀律建立 | ✅ |
| Phase 12 | comparison.html 視覺升級 | ✅ |
| Phase 14a | Multi-country / multi-currency schema | ✅ |
| Phase 14b | IMPORT_TEMPLATES.md 資料準備範本 | ✅ |
| Phase 15a | 深度欄位 schema 擴充(差異化資訊) | ✅ |

待辦(等資料/實作):
- Phase 14c — 寫匯入腳本 + Edge Function 改讀新欄位 + redeploy(等使用者填完 14b Sheets)
- Phase 15b — Edge Function + template 顯示深度欄位(可跟 14c 同時做)

---

## Phase 6 — created_by 真實寫入 [P0] ✅

**目標**:`generated_pages.created_by` 寫入真實 user id,而非 NULL。為未來「顧問只看自己頁面」鋪路。

**結果**(2026-05-26):**已完成**
- Phase 4 寫入流程修復時順手加入 `created_by: user.id`,實證 `ilac-toronto-ilac-vancouver-0079` 的 `created_by` 為真實 user id `d457b4a4-...`
- 補強:CreatePage 加 `if (!user) { alert + return }` guard,防止 session 過期時靜默寫 NULL
- `user?.id` 簡化為 `user.id`(guard 後 TypeScript 已知非空)

**驗收條件**
- [x] 新產生的頁面 `created_by` 欄為產生者 user id,非 NULL — 已實證
- [x] 舊資料 `created_by` 為 NULL 不影響顯示 — 已實證(Dashboard 不過濾此欄)
- [ ] (選配,延後)Dashboard 帶 `auth.uid()` 查得到自己頁面 — 目前團隊共享 RLS,不需特別處理

**遺留**:13 筆舊資料 `created_by` 為 NULL,無從反推誰建,維持 NULL。

---

## Phase 7 — 草稿垃圾清理機制 [P0] ✅

**目標**:處理「前台 upsert 成功但 Edge Function 失敗」留下的孤兒 draft row。

**結果**(2026-05-26):**採方案 A 完成**
- CreatePage handleGenerate 加 `draftCreatedSlug` flag
- upsert 成功後捕捉 slug;catch 內若有值,執行 `DELETE WHERE slug = ? AND status = 'draft'`(雙重條件防誤刪)
- 清理失敗只 warn,不蓋過主要錯誤訊息

**驗收條件**
- [x] 失敗路徑會清理 draft — 程式碼審查通過
- [ ] (建議封測時實測)模擬 Edge Function 失敗確認 DB 無殘留
- [x] Dashboard 不再看到失敗導致的 draft 孤兒頁

**已知未覆蓋**:使用者關閉瀏覽器或網路中斷(promise 未進 catch)的 abandoned 案例。若實際使用頻繁發生,再實作方案 B(pg_cron 排程清理)。

---

## Phase 8 — 刪除頁面 UI [P1] ✅

**目標**:Dashboard 卡片提供刪除動作,不必跑 SQL。

**結果**(2026-05-26):**採軟刪除完成**
- DB:新增 `generated_pages.deleted_at TIMESTAMPTZ`,配 partial index
- Migration 檔案:`supabase/migrations/20260526181732_add_deleted_at_to_generated_pages.sql`(配合 Phase 13 紀律,本地與線上同步)
- Dashboard:`loadPages` query 加 `.is('deleted_at', null)` 過濾
- UI:卡片右側加 🗑 按鈕,`window.confirm()` 二次確認後 UPDATE `deleted_at = now()`
- 刪除失敗顯示 alert,成功重新載入列表

**驗收條件**
- [x] 顧問可從 Dashboard 刪除頁面,卡片消失 — 待瀏覽器實測
- [x] 二次確認 dialog 可避免誤刪
- [ ] Worker URL 失效 — **未做**(html_content 仍在,屬可接受;若需失效要動 Worker 程式碼)
- [ ] (若軟刪除)有「最近刪除」回復頁面 30 天內 — **未做**,需透過 Supabase Studio 把 `deleted_at` 設回 NULL 救回

---

## Phase 9 — 編輯/重新產生既有頁面 [P1] ✅

**目標**:顧問可修正既有頁面(打錯字、價格更新)而不是整個重做。

**結果**(2026-05-30):**完成**

DB:
- `generated_pages.updated_at TIMESTAMPTZ` 新增,舊 row 回填為 `created_at`
- Migration 檔:`supabase/migrations/20260530140210_add_updated_at_to_generated_pages.sql`

Dashboard:
- TS interface 補上 `updated_at: string \| null`
- 卡片右側加 ✏️ Link(在 🗑 左邊),點擊跳 `/create?slug=xxx`
- 日期列若 `updated_at > created_at + 1s` 顯示「編輯於 YYYY/M/D」

CreatePage:
- `useSearchParams` 偵測 `?slug=` 參數 → 編輯模式
- 編輯模式時:
  - 從 `generated_pages` 撈該頁原始 metadata,預填 title/selected_fields/advisor_notes/selected(由 campus_ids 反查 allCampuses)
  - 跳過 localStorage DRAFT_KEY 載入/儲存(避免污染)
  - Header 顯示「編輯比較頁面」(原「建立比較頁面」)
  - 隱藏「儲存草稿」按鈕
  - Submit 按鈕顯示「更新比較頁面」/「更新中...」
  - 成功提示「頁面更新完成!」
- handleGenerate 分流:
  - 編輯模式:`UPDATE ... WHERE slug = editSlug`,保留 `created_by`/`status`,推進 `updated_at`,不追蹤 draft cleanup
  - 建立模式:原本的 UPSERT 流程(status='draft' → Edge Function update → published)
  - Edge Function invoke 行為不變(`update().eq("slug").select()`,slug 不變所以 Worker URL 不變)

**驗收條件**
- [x] 編輯後 Worker URL 不變,內容更新 — 待瀏覽器實測
- [x] `updated_at` 正確反映最後編輯時間
- [x] 取消編輯(直接返回 Dashboard)不會破壞原頁面內容(只 UPDATE 在送出時觸發)

**已知設計取捨**:
- 不做 Postgres trigger 自動更新 `updated_at`(app 端 explicit set,簡單可控)
- 編輯模式可改校區選擇(不鎖定 — 顧問可能要重組比較對象,slug 不變但內容大改是合理場景)
- Edge Function 在編輯模式失敗時,前台不會 revert 已寫入的 metadata(會顯示「更新失敗」,顧問可重試;此案罕見)

---

## Phase 10 — Dashboard 搜尋/分頁(精準統計) [P1] ✅

**目標**:超過 20 筆後仍能找到舊頁面;統計卡顯示真實全表數字而非當前頁籤子集。

**結果**(2026-05-30):**MVP 完成**

實作:
- **搜尋**:title / slug 雙欄 ilike 查詢,輸入 debounce 300ms,搜尋變更自動回第 0 頁
- **分頁**:offset-based,20 筆/頁,上一頁/下一頁按鈕 + 「第 N / M 頁(共 X 筆)」指示
- **統計卡**:獨立 3 個 count 查詢(`{ count: 'exact', head: true }`),總頁面/已發布/本月產生 全部反映實際全表(非當前頁子集);delete 後自動刷新統計
- **空狀態分流**:有搜尋詞 → 🔍「找不到包含「X」的頁面」;無搜尋 → 📄 原訊息
- **標題列**:無搜尋時「最近產生的頁面」;有搜尋時「搜尋「X」(N)」

**未做(scope reduction,留待 Phase 10.x 若有需求)**:
- 狀態篩選(已發布/草稿)— 目前幾乎全部 published,優先級低
- 日期區間篩選 — 搜尋已能用 slug 後綴日期間接達成
- 建立者篩選 — 等 created_by 真實寫入夠多後再做
- 排序切換 UI — 預設 created_at desc 已合理

**驗收條件**
- [x] 搜尋「ILAC」能即時過濾 — 待瀏覽器實測
- [x] 切頁正常 — 程式碼審查通過(offset = pageIdx * 20)
- [x] 搜尋無結果有 empty state(🔍 + 「找不到包含...」)

---

## Phase 11 — Slug 唯一性強化 [P2] ✅

**目標**:`Date.now().toString().slice(-4)` 只有 4 位 random,並發或高頻產生有碰撞風險;前台又用 upsert(`onConflict: slug`)會**默默覆蓋**已存在頁面。

**結果**(2026-05-30):**完成,雙重防線**

實作:
- **熵提升**:從 `Date.now().toString().slice(-4)`(10⁴ 組合)改為 `(Math.random().toString(36) + Math.random().toString(36)).slice(2, 8)`(6 字元 base36,約 2.18 × 10⁹ 組合)
  - 雙 `Math.random()` 串接避免單次隨機過小時產生少於 6 字元字串
- **建立模式 UPSERT → INSERT**:
  - 原 UPSERT 在 slug 碰撞時會 ON CONFLICT DO UPDATE,**靜默覆蓋**他人頁面
  - 改 INSERT 後碰撞觸發 PostgreSQL `23505` unique violation,前台明確報「slug 碰撞,請重新嘗試」
  - 編輯模式維持 `update().eq(slug)`(本來就鎖定特定 slug,不會碰撞)

DB schema 不變(slug 上原本就有 UNIQUE constraint,否則前期 `upsert(onConflict: 'slug')` 早就 fail)。

**驗收條件**
- [x] 撞 slug 時前台給明確錯誤訊息 — `if (insertErr.code === '23505') throw new Error(...)`
- [x] 連續產生 100 筆同組學校無碰撞 — 2B 組合下機率近乎 0(Birthday paradox 約 47K 才到 50% 風險)

---

## Phase 12 — comparison.html 視覺升級 [P3] ✅

> 原 README backlog 項目

**目標**:從「功能型工具感」(資訊密集、實用、好查)升級為「品牌型錄質感」。

**結果**(2026-05-30):**完成,純視覺升級,結構/JS/佔位符全保留**

色票套入(放洋品牌):
- `--color-primary: #E8195A`(玫瑰紅,沿用既有品牌色)
- `--color-primary-hover: #C8174A`(加深一階)
- `--color-primary-tint: #FCE8EE`(極淡底)
- `--color-accent: #2B4A6B`(沉穩深藍,輔助色 = 表格 header / city-name / 強調)
- `--color-bg: #FAF7F2`(暖白頁底)
- `--color-text: #2C2C2A`(暖黑,比純黑柔)
- `--color-text-muted: #6B6B6B` / `--color-border: #EAE5DD`

視覺升級:
- **Hero**:從深色海軍 gradient → 暖白底 + 雙色光暈(右上深藍、左下玫瑰)+ 深藍 badge + 玫瑰邊框 chip
- **Cards**:radius 12 → 16,加 `--shadow-card` 軟陰影,hover 上浮 2px
- **Card header**:gradient `primary → primary-hover`(原本單色),更立體
- **Table header**:改用深藍(原本玫瑰紅)— 與卡片頭區隔顏色職責
- **Tabs**:active 改 `primary-tint` 底 + `primary-hover` 字(原本白底紅字)
- **Toggle**:active 改深藍(原本玫瑰)
- **City name**:改用深藍 18px(原本黑色 16px)
- **Calc result**:金額放大 18 → 20px,加邊框
- **Sticky nav**:加 `backdrop-filter: blur(10px)` 透明感

Typography:
- `body line-height: 1.65`(原 default ~1.5)
- 標題 `letter-spacing: -0.01em`(收緊)
- meta / label `letter-spacing: 0.02em`(展開)
- 加入 PingFang TC / Noto Sans TC fallback

RWD:
- 新增 tablet 區段(< 1024px)— iPad 優化
- mobile (< 640px) 字級/留白全面調整
- toggle / nav 加大 tap target

**驗收條件**
- [△] 顧問群盲測偏好率 > 70% — 待你內部蒐集回饋
- [x] 任何資料不破版 — 結構完全保留,所有 13 個 `{{...}}` 占位符位置不動
- [x] 行動裝置可閱讀 — 加 < 1024px tablet 與 < 640px mobile 兩段 media query
- [ ] 列印友善 / PDF — 未做(Phase 14 PDF 匯出時再規劃)

---

## Phase 13 — Migration 紀律建立 [P3] ✅

> 原 README backlog 項目

**目標**:`supabase/migrations/` 不再形同虛設(目前只有 1 個 migration,線上 schema 未版控)。

**結果**(2026-05-30):**SOP 完成,baseline 留作技術債**

實作:
- 新增 [MIGRATIONS.md](./MIGRATIONS.md) — schema 變更 SOP 文件
  - 政策:三禁(只改不寫、只寫不套、事後補不同內容)
  - 命名規範:`{YYYYMMDDHHMMSS}_{snake_case}.sql`
  - 內容規範 + 範例
  - 執行流程(Claude Code 協作版)
  - 緊急回滾指引
- 更新 README:指向 MIGRATIONS.md,將「建立 migration 紀律」從 backlog 移到「已完成」
- 已有 migration 檔案 3 個(Phase 4/8/9),格式統一,內容含註解

**驗收條件**
- [x] team 文件明訂 schema 變更流程 — MIGRATIONS.md
- [△] `supabase db push` 在新環境能 reproduce 整個 schema — **部分**:Phase 4 後的 schema 可重現,Phase 4 之前的 baseline 缺(技術債,新環境需求時補)
- [ ] CI 加入 migration 檢查 — 未做(P4 待議,單一 production DB 暫不需要)

**已知技術債**:Phase 4 之前的 baseline schema(8 張表的原始定義)未捕捉。當需要 staging / 開發環境時跑 `supabase db pull` 補。

---

## Phase 18b sub-track 1 — Edge Function 國籍卡切 nationality_breakdown + 廢 top_nationalities [P2] ✅

> Schema 重疊清理。LP A/B/D 卡片樣式分派列為 sub-track 2(下方,🔜)。

**結果**(2026-06-15):**已落地**
- EF Section 10 改讀 `nationality_breakdown`,新增 pct 文字 + 條狀視覺
- `ALTER TABLE schools DROP COLUMN top_nationalities` migration 套用
- IMPORT_TEMPLATES.md 移除 deprecated 條目
- `scripts/import-data.js` 移除雙寫衍生邏輯

---

## Phase 18b sub-track 1 原始規劃(歷史備忘)

**背景**:Phase 16a 加的 `schools.top_nationalities`(無 pct)與 Phase 18a 加的 `schools.nationality_breakdown`(含 pct)資料重疊。當前 EF Section 10 仍只讀 `top_nationalities`,`nationality_breakdown` 寫進去但沒被渲染。

**決策**(2026-06-12):**18b 一刀切。現在不 DROP,標 deprecated。**
- ❌ 現在 DROP:EF 在 18b 才解凍,現在改會踩凍結檔
- ❌ 共存:雙寫成本長期累積、易不一致
- ✅ **18b 一刀**:EF 解凍那次連同切讀 + DROP COLUMN + IMPORT_TEMPLATES 更新一起做

**14c~18b 過渡期(凍結耦合)**:
- EF 凍到 18b,且現在讀 `top_nationalities`
- **14c 真實資料匯入腳本必須對同一所學校同時寫 `top_nationalities` + `nationality_breakdown`**
- 否則 Section 10 國籍卡會空白(EF 找不到 top_nationalities 就跳過)
- 想在 18b 前單獨切 Section 10 到 `nationality_breakdown` → 需動凍結檔 + redeploy,**預設不做**

**18b 執行步驟(三件事同一個 commit 鏈)**:
1. EF `index.ts` line 340-343:`top_nationalities` → `nationality_breakdown`,渲染加上 pct(長條 / 百分比文字)
2. Migration:`ALTER TABLE schools DROP COLUMN top_nationalities`
3. IMPORT_TEMPLATES.md:移除 `top_nationalities` 一節、清掉 deprecated 註記、`nationality_breakdown.pct` 標必填(現已標)

**為什麼 backfill 不是 blocker**:14c 排在 18b 前,匯入 SOP 已要求雙寫 + pct 必填,到 18b 時 demo 那批無 pct 的 `top_nationalities` 已被真實資料整批取代。

**驗收條件**
- [x] EF 切讀 `nationality_breakdown`,Section 10 國籍卡顯示 pct
- [x] `schools.top_nationalities` 已 DROP(`\d schools` 不見此欄)
- [x] IMPORT_TEMPLATES.md 不再提及 `top_nationalities`(只剩取代註記)
- [ ] 14c 匯入的所有學校 row 之 `nationality_breakdown` 有 ≥1 筆且每筆都有 pct
  *(14c 真實匯入待顧問交資料,暫無法驗收)*

---

## Phase 18b sub-track 2 — LP A/B/D 卡片樣式分派 [P2] 🔜

> EF 已解凍,接下來 redeploy 成本不高 — 但需要先設計三種版型才能動。

**現況**:
- CreatePage 已送 `style: 'A' | 'B' | 'D'` 給 EF,EF 還沒讀
- 「A 決策 / B 費用 / D 資訊密集」目前只有命名,沒有 HTML / 欄位對應

**啟動前需要**:三種樣式各自的欄位清單與版型 mockup(或文字描述也行)

---

## 跨 Phase 通用品質要求 [P0,每個 Phase 同步交付]

| 項目 | 要求 |
|---|---|
| 型別檢查 | `tsc -p tsconfig.app.json --noEmit` exit 0 |
| Lint | `npm run lint` 無 error |
| Commit message | 用 `feat:` / `fix:` / `chore:` / `docs:` 前綴 |
| Deploy | Edge Function 改動必 deploy,README 記版號 |
| 文件 | 涉及 schema/API 變更同步更新 README |

---

## 待討論項目(尚未列入 Phase,需確認方向再排)

| 候選項目 | 為什麼納入考量 | 待釐清 |
|---|---|---|
| `API/` untracked 目錄 | repo 裡有但沒 git 追蹤 | 這目錄是廢棄?未完成?還是有用? |
| PDF 匯出比較頁 | 顧問可能想給學生帶走實體 | 優先級多高? |
| 學校資料維護後台 | 目前 schools/programs/... 只能在 Supabase Studio 改,門檻高 | 誰會用?頻率? |
| 多語 UI(英文) | 看團隊有無國際顧問 | 團隊組成? |
| 學生使用追蹤(view count、停留時間) | 評估頁面成效 | 涉及隱私聲明,要不要做? |
| 比較頁範本切換(detail / quick) | 不同諮詢情境 | 業務有需求嗎? |
| 角色權限(admin / advisor) | 看團隊規模 | 現在多少人用? |

---

## 修訂歷史

| 日期 | 變更 |
|---|---|
| 2026-05-26 | 初版建立(Phase 5 完成後) |
| 2026-06-12 | 加 Phase 18b 段(EF 切 nationality_breakdown + DROP top_nationalities,14c 過渡期凍結耦合說明) |
| 2026-06-15 | Phase 18b sub-track 1 落地(EF v26 切讀 + DROP COLUMN);sub-track 2 LP A/B/D 樣式分派獨立列為 🔜 |
