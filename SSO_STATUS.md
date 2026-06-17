# SSO_STATUS — CMS × 報價系統 SSO 整合狀態

**單一真相來源**:本檔以 live `git log` + Supabase MCP 為準。狀態有變改本檔 + 加修訂歷史,不開新文件。

---

## 修訂歷史

| 日期 | 變更 | 對應 commit / 事件 |
|---|---|---|
| 2026-06-17 | SSO chain 驗證通過(EF 簽出有效 JWT 到新分頁),狀態從「secret 待確認」→「secret 已設、等放洋對接真實 URL + 驗 token」 | 點 Dashboard 按鈕,新分頁 URL = `<target>/?t=eyJ...` |
| 2026-06-16 | 初版建立(校正 2026-06-15 spec 的過期 ❌) | `b339d7f` |

---

## TL;DR

CMS 側 SSO 簽發 chain **已 100% 完工**,`QUOTE_SSO_SECRET` 已設、EF v1 ACTIVE、Dashboard 按鈕能簽出有效 JWT 並開新分頁。剩下兩件事都在放洋那邊:(1) 提供真實報價系統 URL;(2) 對方驗 token + 視為登入。

---

## 現況(2026-06-17)

### ✅ CMS 側(完成)

| 環節 | 狀態 | 證據 |
|---|---|---|
| EF `issue-quote-token` | v1 ACTIVE | Supabase Functions list |
| `QUOTE_SSO_SECRET` 已設 | ✅ | EF 能簽出 token(簽不出會 500) |
| Dashboard「🔗 開報價系統」按鈕 | ✅ | `src/pages/DashboardPage.tsx` |
| Token 帶到目標 URL | ✅ | 點按鈕後新分頁 URL = `<target>/?t=eyJ...` |
| 身份來源切到 `advisors` 表 | ✅ | 取代 `auth.users.app_metadata` |

### ❌ 放洋側(待對接)

| 環節 | 狀態 | Owner |
|---|---|---|
| 真實報價系統 URL(含路由) | 目前 CMS 端 `VITE_QUOTE_SYSTEM_URL=https://example.com` 佔位 | 放洋 |
| 對方驗 token + 視為登入 | 未實作 | 放洋(GAS / 報價系統前端) |
| 取得 `QUOTE_SSO_SECRET` | 待透過 1Password / PrivateBin 交付 | CMS → 放洋 |

---

## JWT 規格(給放洋對齊用)

### 簽章
- 演算法:**HS256**
- Secret:CMS 端變數名 `QUOTE_SSO_SECRET`(放洋端可叫任何名稱,**值必須一致**)
- 取得方式:**1Password / PrivateBin**(永不走 Slack / Email / Git)

### Payload

```json
{
  "sub": "tkb0005738",
  "name": "吳少玄",
  "role": "manager",
  "iss": "fy-cms",
  "aud": "fy-quote",
  "iat": 1781600000,
  "exp": 1781603600
}
```

| 欄位 | 說明 |
|---|---|
| `sub` | 員編(格式 `tkb000xxxx`) |
| `name` | 顧問中文名 |
| `role` | `"manager"` 或 `"advisor"` |
| `iss` | 固定 `"fy-cms"` |
| `aud` | 固定 `"fy-quote"` |
| `iat` | 簽發時間(秒級 epoch) |
| `exp` | 失效時間(`iat + 3600`,1 小時) |

### 放洋端驗證項目(必驗)

1. 演算法 = `HS256`,用同把 secret 驗 HMAC-SHA256 簽章
2. `iss === "fy-cms"`
3. `aud === "fy-quote"`
4. `exp > now`(秒級)

驗過 → 從 payload 拿 `sub` / `name` / `role` 寫 session(或 localStorage / cookie),視為登入狀態。驗失敗 → 跳回 CMS 重拿或顯示「請從 CMS 重新進入」。

### ⚠️ 兩個 spec 早期版本的更正(**務必對齊放洋**)

| 項目 | 早期 spec | 實際實作 |
|---|---|---|
| 密鑰名 | `SSO_SECRET` | **`QUOTE_SSO_SECRET`** |
| `exp` 長度 | 8 小時 | **1 小時**(`getNumericDate(60 * 60)`) |

---

## CMS 側技術細節

### EF: `issue-quote-token`
- 位置:`supabase/functions/issue-quote-token/index.ts`
- 版本:v1 ACTIVE
- 身份來源:`advisors` 表(不是 `auth.users.app_metadata` 輕量路線)
- 進門檢查:driver session → 查 `advisors` → 取 `sub/name/role`

### Dashboard 按鈕
- 位置:`src/pages/DashboardPage.tsx`
- 互動:點按鈕 → call EF `issue-quote-token` → 取回 JWT → `window.open(<VITE_QUOTE_SYSTEM_URL>?t=<token>)` 開新分頁
- 當前環境變數:`VITE_QUOTE_SYSTEM_URL=https://example.com`(佔位,等放洋給真實 URL 後換)

---

## 給放洋 chat 的 handoff(可直接複製)

```markdown
# 報價系統 × CMS SSO 整合 — CMS 側完工,等放洋對接

## 現況
CMS 側 SSO 簽發 chain 已 100% 通:
- EF `issue-quote-token` v1 ACTIVE
- `QUOTE_SSO_SECRET` 已設(secret 值在 1Password 待交付)
- Dashboard 按鈕能簽出 token + window.open 開新分頁
- 驗證證據:點按鈕後新分頁 URL = `<target>/?t=eyJ...`

## 放洋這邊要做的 4 件事

### 1. 取得 `QUOTE_SSO_SECRET`
透過 1Password / PrivateBin 跟 CMS 端拿同一把 secret,**不走 Slack / Email / Git**。

### 2. 報價系統前端 / GAS 接收 `?t=<token>`
URL 格式建議:`https://fy-quotation-system-ep.vercel.app/sso?t=<token>`(具體你們定)。
收到 query 後抽出 token。

### 3. 驗 token(HS256 + 同把 secret)
Payload 預期:
{
  "sub": "tkb0005738",   // 員編
  "name": "吳少玄",       // 中文名
  "role": "manager",      // "manager" | "advisor"
  "iss": "fy-cms",
  "aud": "fy-quote",
  "iat": 1781600000,
  "exp": 1781603600       // iat + 3600(1 小時)
}

驗證項:
- 演算法 HS256,用同把 secret 驗 HMAC-SHA256
- iss === "fy-cms"
- aud === "fy-quote"
- exp > now(秒級)

### 4. 驗過 → 視為已登入
從 token payload 拿 sub / name / role 寫 session,視為登入狀態,直接進報價系統內頁。

## 注意事項
- 密鑰名是 `QUOTE_SSO_SECRET`,不是早期 spec 的 `SSO_SECRET`
- exp 是 1 小時,不是早期 spec 的 8 小時
- 兩邊 env 名稱可不同,**值必須一致**

## 回傳給 CMS 端
準備好後跟 CMS 說:
1. 真實報價系統 URL 是什麼(CMS 換 `VITE_QUOTE_SYSTEM_URL`)
2. Secret 已收到 + GAS / 後端設好
3. 雙方對驗一次:CMS 簽 → URL 帶過去 → 驗過 → 登入內頁
```

---

## 待辦

| 優先序 | 項目 | Owner |
|---|---|---|
| 🔴 | 放洋提供真實報價系統 URL(含路由,例:`/sso?t=...`) | 放洋 |
| 🔴 | 放洋實作 token 驗證 + 登入 | 放洋(GAS / 前端) |
| 🟡 | 透過 1Password / PrivateBin 把 `QUOTE_SSO_SECRET` 交給放洋 | CMS → 放洋 |
| 🟡 | 雙方對驗一次(CMS 簽 → 放洋驗 → 視為登入) | 雙方 |
| ⚪ | 換 `VITE_QUOTE_SYSTEM_URL` 為真實 URL(放洋給之後) | CMS |
| ⚪ | UIUX 改善(loading 視覺 / tooltip / 按鈕位置 / 對齊品牌色) | CMS |

---

## 注意事項

- **Secret / token 永不進** commit / log / Slack / Email
- **service_role 永不進前端**
- **高權限 EF** 進門先驗 manager 身份 + 寫 audit log
- 凍結檔概念已隨 18b 完成解除(EF 可動)
- 以 live `git log` + Supabase MCP 為準;新 chat 接手先跑 `git log --oneline` 對齊

---

## 相關檔案

| 檔案 | 用途 |
|---|---|
| `supabase/functions/issue-quote-token/index.ts` | EF 簽 token 主程式 |
| `src/pages/DashboardPage.tsx` | Dashboard + 「開報價系統」按鈕 |
| `src/pages/LoginPage.tsx` | 登入頁(同 advisors 身份來源) |
| `PROJECT_STATUS.md` | 全專案單一真相來源 |
| `ACCOUNT_MGMT_SPEC.md` | 帳號管理規格(含 advisors 名單待補) |
