# SSO_STATUS.md — 報價系統 × CMS SSO 現況

> **建立 2026-06-16**(依 live `git log` + Supabase MCP 查證重寫)
> 目的:校正放洋 2026-06-15 spec 把 CMS 側列為全 ❌ 的過期資訊;
> 現實是簽發後端 + 按鈕已做,真正待辦只剩身份來源拍板 + 密鑰交付 + 名單建檔。
>
> 相關位置:
> - EF 程式碼:[`supabase/functions/issue-quote-token/index.ts`](./supabase/functions/issue-quote-token/index.ts)(107 行)
> - 按鈕實作:[`src/pages/DashboardPage.tsx`](./src/pages/DashboardPage.tsx) line 169-231
> - Commit:`237b4c8` feat: 報價系統 SSO — issue-quote-token EF + Dashboard 「開報價系統」按鈕

---

## 一、已完成,請勿重做

- **JWT 簽發後端 = Supabase Edge Function `issue-quote-token`(v1 ACTIVE)**
  - 完整 HS256(djwt),payload:`sub`(員編) / `name`(中文名) / `role` / `iss='fy-cms'` / `aud='fy-quote'` / `iat` / `exp`(+1 小時)。
  - 三道閘:Supabase session 驗證 → 讀 `auth.users.app_metadata`(employee_id/role/display_name) → secret 檢查 → 簽發。
- **CMS「開報價系統」按鈕**:`DashboardPage.tsx` 已實作,invoke EF 拿 token → `window.open(VITE_QUOTE_SYSTEM_URL + '?t=' + token)`。

> ❗ **CMS 不要再依 spec 的 Node.js `jsonwebtoken` 範例另建簽發器**。會變成兩個簽發器、兩把密鑰,直接互相驗不過。簽發已由 `issue-quote-token` EF 負責。

---

## 二、報價系統端要對齊的驗證格式

報價系統的 GAS 驗 token 時,請照現有 EF 的實際 payload 驗:

- 演算法 `HS256`
- `iss === 'fy-cms'`
- `aud === 'fy-quote'`
- `exp > now`
- 共用同一把 **`QUOTE_SSO_SECRET`**

> ⚠️ **密鑰名是 `QUOTE_SSO_SECRET`,不是 spec 寫的 `SSO_SECRET`**。兩邊名稱可不同(各自 env),但**值必須一致**,否則驗不過。
> ⚠️ EF 的 `exp` 是 **+1 小時**(不是 spec 寫的 8 小時)。報價系統的有效期判斷要照 1 小時,或雙方協調改 EF。

---

## 三、真正還沒做 / 待拍板(這才是 CMS 側的 TODO)

| 項目 | 狀態 | 要做什麼 |
|---|---|---|
| **身份來源:建 `advisors` 表 vs 用 `app_metadata`** | 設計分歧,待拍板 | 現行實作走 `auth.users.raw_app_meta_data`(demo 已 1 筆)。要嘛維持(輕量、但名單靠手動在 Studio 設),要嘛照 spec 建 `advisors` 表並改 EF 去讀它。**先決這個。** |
| **`QUOTE_SSO_SECRET` 是否已在 Studio 設值** | 查不到 | 到 Supabase Studio → Edge Functions → Secrets 確認有值;沒有就產生並設定。 |
| **同一把 secret 交付放洋 GAS** | 待辦 | 透過 1Password / PrivateBin 給放洋,填進 GAS Script Properties。**兩邊值一致才串得起來。** |
| **Supabase Google provider 啟用** | 查不到 | 到 Studio → Authentication → Providers 看是否需開(EF 不依賴,email auth 即可簽,但若要顧問用 Google 登入則要開)。 |
| **12 人白名單實際建檔** | 視上面「身份來源」決定 | 若走 app_metadata:要為每位顧問在 Studio 的 auth.users 設好 employee_id/role/display_name。若建 advisors 表:把 12 人填進表。 |

---

## 四、一句話給 CMS

> 簽發後端和按鈕已經做好了(`issue-quote-token` EF + Dashboard 按鈕),**不要重做**。
> 你們真正要收尾的是:**(1) 決定身份來源(advisors 表還是 app_metadata)、(2) 設好 `QUOTE_SSO_SECRET` 並把同一把值交付放洋 GAS、(3) 確認/開 Google 登入、(4) 把 12 人白名單實際建檔。**

---

## 修訂歷史

| 日期 | 變更 |
|---|---|
| 2026-06-16 | 初版建立(校正 2026-06-15 spec 的過期 ❌) |
