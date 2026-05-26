# BETA_CHECKLIST.md — 內部封測審核清單

> 維護:Phase 5 完成後建立(2026-05-26)
> 目的:把系統正式釋出給顧問群「日常使用」之前的最終審核清單
> 用法:每項打勾。**缺一項都不放行封測**。
> 配套文件:[ROADMAP.md](./ROADMAP.md)

---

## 使用方式

1. 開始封測前,負責人(或 Claude Code 協助)逐項檢查
2. 每項記錄:✅ 通過 / ❌ 不通過(附原因) / N/A(附說明)
3. 全部 ✅ 或 N/A 後才放行封測
4. 封測期間發現新風險,**回頭加進這份清單**

---

## A. 功能完整性

- [ ] 登入流程順暢,登出後再登入狀態保留
- [ ] 新建頁面流程(選校 → 選校區 → 勾欄位 → 填備注 → 產生)從頭到尾無中斷
- [ ] 校區數量上限(MAX = 3)有正確擋下,選第 4 個無反應
- [ ] 三種選校組合都能產生:
  - [ ] 同校多校區(e.g. ILAC Toronto + ILAC Vancouver)
  - [ ] 不同校單校區(e.g. ILAC Toronto + ILSC Toronto)
  - [ ] 不同校多校區(e.g. ILAC Toronto + ILSC Vancouver + Kaplan Montreal)
- [ ] 產生後 Worker URL 可正常開啟,內容正確
- [ ] Dashboard 列表正確顯示校數/校區數
- [ ] 「開啟 ↗」連結點得開(target=_blank 新分頁)
- [ ] 編輯/刪除流程(若 Phase 8/9 已實作)無誤
- [ ] 搜尋/篩選/分頁(若 Phase 10 已實作)正常運作

---

## B. 資料完整性

- [ ] 新產生頁面所有欄位正確寫入:
  - [ ] `title`(非 null)
  - [ ] `school_ids`(uuid array,非 null)
  - [ ] `campus_ids`(uuid array,非空)
  - [ ] `selected_fields`(jsonb,反映勾選)
  - [ ] `advisor_notes`(jsonb,有備注時)
  - [ ] `html_content`(非 null)
  - [ ] `html_url` / `public_url`(指向 Worker)
  - [ ] `status` = `'published'`
  - [ ] `created_by`(若 Phase 6 已實作,為真實 user id)
- [ ] 沒有殘留 draft 孤兒 row(模擬 Edge Function fail 後檢查)
- [ ] 連產 10 筆同組學校無 slug 碰撞
- [ ] 舊資料(Phase 4 之前無 campus_ids)不會 crash Dashboard
- [ ] (Phase 6 啟用後)確認 RLS:顧問 A 不能修改顧問 B 的 row

---

## C. 錯誤處理 UX

- [ ] 網路斷線時顯示明確提示(非白屏或 console error)
- [ ] Edge Function fail 時前台不卡死,有可讀錯誤訊息(非 raw stack trace)
- [ ] 表單欄位空值有 validation,不靜默送出(至少:0 個校區無法產生)
- [ ] localStorage `DRAFT_KEY` 異常不會卡住整個 app
- [ ] 重複點「產生」按鈕不會送多次(產生期間 disabled)
- [ ] 後端 500 錯誤前台顯示「請稍後再試」,而非空白

---

## D. 跨環境/裝置

- [ ] **後台**(顧問用)在以下環境正常:
  - [ ] Chrome (macOS / Windows)
  - [ ] Safari (macOS)
  - [ ] Edge (Windows)
  - [ ] iPad Safari(若顧問會用 iPad 操作)
- [ ] **Worker view-page**(學生看)在以下環境正常:
  - [ ] iPhone Safari
  - [ ] Android Chrome
  - [ ] 桌機 1920x1080(會議室螢幕)
  - [ ] 平板 iPad
- [ ] 中文字符顯示正常(無豆腐方塊)
- [ ] Emoji 顯示正常(🍁、📍 等)

---

## E. 效能

- [ ] Dashboard 載入(20 筆)< 2 秒
- [ ] 產生頁面 end-to-end < 5 秒(熱點/慢網路下放寬到 < 10 秒)
- [ ] Worker view-page 首屏載入 < 1 秒
- [ ] 連續產生 20 筆無記憶體洩漏(Chrome DevTools Performance 觀察)
- [ ] Edge Function 冷啟動時間 < 3 秒

---

## F. 安全

- [ ] 未登入無法 access `/create`、`/dashboard`(會被導回登入頁)
- [ ] 前台 `VITE_SUPABASE_ANON_KEY` 不含敏感資料權限(只能讀公開 table)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` 只在 Edge Function Secrets,未出現在前端 bundle
- [ ] RLS policy 經 SQL 驗證:
  ```sql
  SELECT schemaname, tablename, policyname, cmd, qual
  FROM pg_policies WHERE schemaname = 'public';
  ```
- [ ] 環境變數沒進 git(`.env` 在 .gitignore)
- [ ] Cloudflare Worker 不需 auth,但只讀不寫,且 slug 不可枚舉(可選:加 token)

---

## G. 文件

- [ ] README 進度章節更新到最新 Phase
- [ ] **顧問操作手冊**草稿(至少包含:登入、新建、開啟連結三步驟,附截圖)
- [ ] **內部 troubleshooting 文件**(常見錯誤 + 排查路徑)
- [ ] **Schema 文件**(欄位用途、RLS 說明)
- [ ] ROADMAP.md 反映最新優先級
- [ ] 本檔(BETA_CHECKLIST.md)各項負責人標註

---

## H. 監控與支援

- [ ] Supabase Dashboard 看得到 Edge Function logs(至少能查 24h 內錯誤)
- [ ] DB query 異常有警示(至少手動週查機制建立)
- [ ] 顧問回報 bug 有固定管道(Slack channel / Notion 表單)
- [ ] 緊急回滾路徑明確(Edge Function 上一版號保留 / git revert SOP)
- [ ] 內部負責人(技術 + 業務)聯絡名單建立

---

## 額外:封測階段觀察項目(不阻擋放行,但需追蹤)

封測期間需收集的資料,作為後續迭代依據:

- [ ] 顧問完成「新建一頁」平均耗時
- [ ] 顧問每週實際產生頁面數
- [ ] 哪些欄位 selected_fields 最常勾/最少勾(優化欄位排序)
- [ ] 哪些校區最常被選(熱點資料)
- [ ] 顧問回報的 UI 不順點(可用 Notion 表單收集)
- [ ] Edge Function 平均執行時間
- [ ] DB 容量增長速度(估算 6 個月後資料量)

---

## 修訂歷史

| 日期 | 變更 |
|---|---|
| 2026-05-26 | 初版建立(Phase 5 完成後) |
