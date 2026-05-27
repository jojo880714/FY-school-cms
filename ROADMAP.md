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

## Phase 9 — 編輯/重新產生既有頁面 [P1]

**目標**:顧問可修正既有頁面(打錯字、價格更新)而不是整個重做。

**範圍**
- Dashboard 卡片加「編輯」按鈕 → 回到 CreatePage 預填狀態
- CreatePage 帶 `?slug=xxx` 參數時進入編輯模式,預填 selected campuses / fields / notes
- 重新 invoke Edge Function 覆蓋 `html_content`,slug 不變,Worker URL 不變
- 新增 `updated_at` 欄位反映最後編輯時間,`created_at` 不動

**驗收條件**
- [ ] 編輯後 Worker URL 不變,內容更新
- [ ] `updated_at` 正確反映最後編輯時間
- [ ] 取消編輯不會破壞原頁面內容

---

## Phase 10 — Dashboard 搜尋/篩選/分頁 [P1]

**目標**:超過 20 筆後仍能找到舊頁面。

**範圍**
- **搜尋**:`title` / `slug` / 校名 like 查詢
- **篩選**:狀態(已發布/草稿)、日期區間、建立者(配合 Phase 6)
- **排序**:預設 created_at desc,可切換 updated_at / title
- **分頁**:cursor-based 或 offset-based(20/頁)

**驗收條件**
- [ ] 累積 50+ 筆下,搜尋「ILAC」能即時過濾
- [ ] 切到第 3 頁仍正常,無重複/缺漏
- [ ] 搜尋無結果有 empty state

---

## Phase 11 — Slug 唯一性強化 [P2]

**目標**:`Date.now().toString().slice(-4)` 只有 4 位 random,並發或高頻產生有碰撞風險;前台又用 upsert(`onConflict: slug`)會**默默覆蓋**已存在頁面。

**範圍**
- 改用 `slice(-6)` 或引入 `nanoid`
- 或:INSERT 前先 check slug 是否存在
- 或:DB 加 UNIQUE constraint,前台捕捉違反錯誤後重試

**驗收條件**
- [ ] 撞 slug 時前台給明確錯誤訊息(不靜默覆蓋)
- [ ] 連續產生 100 筆同組學校無碰撞

---

## Phase 12 — comparison.html 視覺升級 [P3]

> 原 README backlog 項目

**目標**:從「功能型工具感」(資訊密集、實用、好查)升級為「品牌型錄質感」。

**範圍**
- 加大區塊留白、改用暖色調背景、卡片加圓角與陰影
- 字體加呼吸感(line-height / letter-spacing)
- 城市/校區資訊 infographic 化
- 頁尾加 CTA 表單

**驗收條件**
- [ ] 顧問群盲測對新舊版偏好率 > 70%
- [ ] 模板任何資料皆能不破版顯示(空資料 / 超長文字 / 多校 / 單校)
- [ ] 行動裝置可閱讀(顧問可能 iPad 展示給學生看)
- [ ] 列印友善 / PDF 匯出版面正確(若 Phase 14 已實作)

---

## Phase 13 — Migration 紀律建立 [P3]

> 原 README backlog 項目

**目標**:`supabase/migrations/` 不再形同虛設(目前只有 1 個 migration,線上 schema 未版控)。

**範圍**
- 寫補檔 migration 把目前線上 schema 完整記錄一份(`supabase db pull` 或手寫)
- 之後任何 ALTER TABLE 一律走 `supabase migration new`
- 禁止直接在 Supabase Dashboard 改 schema(寫入內部 SOP)

**驗收條件**
- [ ] `supabase db push` 在新環境能 reproduce 整個 schema
- [ ] team 文件明訂 schema 變更流程
- [ ] CI 加入 migration 檢查(可選)

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
