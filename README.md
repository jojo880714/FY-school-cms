# FY-school-cms｜加拿大語言學校比較 CMS 系統

> 語校銷售輔助系統。協助業務顧問在諮詢前快速產出專業的學校比較頁面，
> 諮詢時展示給學生看。頁面不對外公開，僅供顧問使用。

---

## 1. 這個系統是什麼

顧問在後台選學校 → 系統撈資料庫資料 → 套入固定 HTML 模板 →
產出一個可分享連結的比較頁面 → 顧問諮詢時打開給學生看。

不使用 AI 自由生成，採固定模板填空，確保每次輸出品質穩定一致。

---

## 2. 技術架構

| 層級 | 技術 |
|------|------|
| 前台 | React + Vite + TypeScript（StackBlitz，已同步至 GitHub repo: FY-school-cms） |
| 資料庫 | Supabase PostgreSQL |
| 頁面產生 | Supabase Edge Function `generate-page`（固定模板填空，無 AI） |
| 頁面渲染 | Cloudflare Worker |
| 開發環境 | GitHub Codespaces + Claude Code（已串接 Supabase MCP） |

### 關鍵資訊

- Supabase Project URL：`https://uxxpagylkdljjaxslmyj.supabase.co`
- Cloudflare Worker：`https://fy-school-view-page.fy-school-cms.workers.dev`
- 存取方式：`{worker_url}/?slug={slug}`

> 機敏金鑰（service key 等）不寫入此文件，請存放於 Edge Function Secrets，
> 前台只使用 publishable / anon key。

---

## 3. 產生流程

```
顧問在 CreatePage 選學校
  ↓ 前台撈 campuses / programs / tuition_tiers / housing / city_info
  ↓ 呼叫 generate-page Edge Function（body: schoolsInfo, selectedFields, title, slug）
  ↓ Edge Function 從 page_templates 讀固定模板，把資料填入佔位符
  ↓ HTML upsert 進 generated_pages.html_content
  ↓ 回傳 Cloudflare Worker 連結
  ↓ 顧問複製連結，瀏覽器渲染頁面
```

---

## 4. 目前進度基準（穩定點）

**最後更新：2026-05-19｜此時系統處於前後端版本一致的穩定可用狀態**

| 項目 | 狀態 | 說明 |
|------|------|------|
| Phase 1：固定模板系統 | ✅ 完成 | generate-page 改寫 + HTML 模板建立（commit 5c50439） |
| 問題一：頁面沒儲存到 generated_pages | ✅ 完成並驗收 | 根因為 RLS policy 綁 created_by，但 service role 寫入時該欄為 NULL，導致前台讀不到。已改為團隊共享 policy（authenticated 皆可讀寫），13 筆歷史頁面已恢復顯示 |
| 問題二：城市資訊顯示「待補充」 | ✅ 完成並驗收 | 前台有撈 city_info 但未放進 Edge Function body。已修正為 schoolsInfo[].cityInfo 陣列傳入，Edge Function 配合改為陣列 lookup（commit a1a8103）。Edge Function 已部署上線（v21），前台實測三個城市資訊正常顯示 |
| Phase 2：city_info 鏈路完整化 | ✅ 完成 | 資料層 6 項 SQL 驗證全綠 + Edge Function 升級 v22 normalize 比對（commit 12339eb / PHASE_PLAN.md dfc6969） |

### 關鍵狀態註記

- 線上 Edge Function generate-page：v21（內容 = commit a1a8103）
- generated_pages RLS：團隊共享模式（任何登入顧問可讀寫所有頁面）
- generated_pages.created_by：目前寫入時皆為 NULL（service role 寫入未帶此欄）。
  若未來要做「顧問只看自己的頁面」，需改 Edge Function 在 upsert 時寫入使用者 id
- supabase/migrations/：目前為空，線上 schema 無版本控管（見未來優化清單）

---

## 5. 後續開發路線（Phase）

> 以下為功能主線。建議依序進行，每個 Phase 動工前在電腦前互動式處理，
> 涉及資料庫結構變更或重新部署的步驟需人工確認，不做無人值守自動執行。

### Phase 2：城市資訊串接完整化 ✅ 完成
- 問題二根因已修，但需盤點 city_info 從資料庫到頁面顯示的完整鏈路是否還有其他缺口
- 動工前先補完整書面計畫與驗收條件

### Phase 3：campuses 資料表擴充
- 對照頁面需呈現的校區資訊，盤點 campuses 需新增哪些欄位
- 含 ALTER TABLE，屬不可逆操作，須先寫 migration、評估對現有資料影響後再執行
- 建議導入 supabase migration new 流程，不直接在 Dashboard 改 schema

### Phase 4：CreatePage 改成選「校區」而非「學校」
- 目前選取單位是「學校」，需改為以「校區」為比較單位
  （例：IH 溫哥華 vs ILSC 溫哥華 vs Kaplan 溫哥華）
- 會影響傳入 Edge Function 的 schoolsInfo 結構，需評估對既有頁面相容性

---

## 6. 未來優化清單（不阻擋主線，有餘裕再做）

| 優先級 | 項目 | 說明 |
|--------|------|------|
| P3 | 頁面視覺設計升級 | 現況為「功能型工具感」（資訊密集、實用、好查），目標提升為「品牌型錄質感」：加大區塊留白、改用暖色調背景、卡片加圓角與陰影、字體加呼吸感、城市/校區資訊 infographic 化、頁尾加 CTA 表單。此為加分項非必要——系統定位為顧問當面展示用，現況資訊清晰度已達實用標準。會大改 comparison.html 模板（442 行），建議在 Phase 3/4 功能補完、系統穩定後再動 |
| P3 | 建立 migration 紀律 | supabase/migrations/ 目前為空，線上 schema 無版本控管。後續動 schema 改走 supabase migration new |
| P3 | Edge Function 城市比對防呆 | generate-page 用 x.city === c.city 完全字串比對。目前資料三城市完全相符無問題，但未來城市增多或非工程師輸入 city_info 時，建議改為 trim().toLowerCase() 比對 |
| P4 | created_by 追蹤 | 若需「顧問只看自己產生的頁面」，改 Edge Function 在 upsert 時從前台 JWT 取使用者 id 寫入 created_by |

> 想到新的優化項目隨時往這張表加。標 P3/P4 代表「想做但不急、不擋主線」。

---

## 7. 經驗備忘（踩過的坑）

- 改了沒生效：git commit ≠ 線上生效。改 Edge Function 後必須 deploy 才會上線
- 前台讀不到資料：先查 RLS policy，service role 寫入會繞過 RLS 但前台 anon 不會
- StackBlitz 無法 git pull：新 instance 需手動補 .env
  （VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY），否則整頁白屏
- 規劃類工作：涉及決策的規劃需在電腦前互動式做，不適合丟給工具整夜無人值守跑

---

## 8. 開發環境快速連結

| 用途 | 網址 |
|------|------|
| GitHub Codespaces | https://github.com/codespaces |
| Supabase Table Editor | https://supabase.com/dashboard/project/uxxpagylkdljjaxslmyj/editor |
| Supabase Edge Functions | https://supabase.com/dashboard/project/uxxpagylkdljjaxslmyj/functions |
| StackBlitz | https://stackblitz.com/~/github.com/jojo880714/FY-school-cms |
