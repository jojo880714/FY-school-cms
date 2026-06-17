# ACCOUNT_MGMT_SPEC.md — CMS 帳號管理 + advisors 表 + email/密碼認證

> **狀態**:📋 規格已拍板,**未排期執行**(2026-06-16 收稿,擺著待丟)
> **觸發**:user 給「上工」訊號才動。動之前先回頭看 §0「開工前必先確認」清單。
> **影響面**:DB(新表 + RLS)、2 支 EF(新 1 + 改 1)、前端 3 頁、SSO_STATUS.md 更新
> **配套**:[SSO_STATUS.md](./SSO_STATUS.md)(現況基準)、[MIGRATIONS.md](./MIGRATIONS.md)、[OPERATIONS.md](./OPERATIONS.md)

---

## 0. 開工前必先確認(open questions,user 拍板再動)

| # | 問題 | 為什麼要先決 |
|---|---|---|
| 1 | 現有 demo 帳號 `jojo880714@gmail.com` 對應 advisors 哪個員編?(spec 列 4 manager 中應該是 `tkb0005738`/吳少玄,但沒明說) | seed advisors 時要明確 mapping,否則切表後該帳號簽不出 token |
| 2 | 其餘 8 位顧問:姓名 + 員編 + email + role(advisor/manager)? | spec 寫「待 user 提供」— 沒名單就只能 seed 4 manager,實際上線需 12 人 |
| 3 | 切表時要不要把現有 `auth.users.raw_app_meta_data` 的 `employee_id`/`role`/`display_name` 留著(雙軌一段時間)還是切完即清? | EF 切 join 來源後 metadata 變死資料,留著乾擾,清掉萬一回滾沒得退 |
| 4 | 「停用」對應 auth user 的策略:`auth.admin.deleteUser` 還是 `auth.admin.updateUserById({banned_until:...})`? | spec 寫「視策略停用」沒拍板。刪除會丟失 audit 關聯;ban 軟停用較好但需指定期間 |
| 5 | recovery 連結寄信:from 地址用 Supabase 內建預設(`noreply@mail.app.supabase.io`)還是 custom? | 顧問收信看到 supabase 域名可能誤判 phishing;custom from 需另設 SMTP |

---

## 1. 決策(已拍板)

- **登入方式**:email + 密碼(Supabase 原生)。不走純 Google OAuth。
- **身份來源**:advisors 表(取代現行 `auth.users.app_metadata` 路線)。
- **帳號管理**:管理員「發重設連結」,管理員不持有任何人密碼。
- **寄信**:Supabase 內建 SMTP(低頻 12 人,先不接第三方)。
- **employee_id 格式**:真員編 `tkb000xxxx`(PK,未來接 ERP)。

---

## 2. 硬限制 / 安全紅線

- `service_role` 只在 Edge Function,**永不進前端**。
- 任何密碼 / recovery 連結 / secret **不得寫進 commit 或 log**。
- 高權限 EF 進門先驗呼叫者是 `manager`,否則 403。
- 全部高權限動作寫 `admin_audit`。
- 不碰凍結外的既有功能;push 前 diff 給 user 確認。

---

## Part A — DB:advisors 表 + audit log

### `advisors`

```sql
CREATE TABLE advisors (
  employee_id TEXT PRIMARY KEY,                                -- tkb000xxxx
  display_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,                                  -- 登入 email,join key
  role TEXT NOT NULL CHECK (role IN ('manager','advisor')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `admin_audit`

```sql
CREATE TABLE admin_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_employee_id TEXT NOT NULL REFERENCES advisors(employee_id),
  action TEXT NOT NULL,                                        -- create_user / send_recovery / deactivate / ...
  target_email TEXT,
  detail JSONB,                                                -- 結果 / 額外資訊
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### RLS

- `advisors`:只有 `service_role` / `manager` 可寫;`advisor` 只能讀自己(或全擋,由 EF 代理)。
- `admin_audit`:只有 `service_role` 可寫;`manager` 可讀;`advisor` 全擋。

### Seed(初始)

先放已確認的真員編(皆 `manager`):

| employee_id | display_name | role | email |
|---|---|---|---|
| `tkb0003007` | 馮若陽 | manager | (user 提供) |
| `tkb0003008` | 邱彥鈞 | manager | (user 提供) |
| `tkb0003009` | 劉世揚 | manager | (user 提供) |
| `tkb0005738` | 吳少玄 | manager | `jojo880714@gmail.com`?(open question #1) |

其餘 8 位顧問待 user 提供完整名單再補,先不假造(open question #2)。

---

## Part B — Edge Function:`admin-manage-users`(service_role, manager-gated)

### 進門驗證

讀 session → 查 advisors 該 email 的 `role = 'manager'`?否 → 403。

### Actions

1. **`createUser`** `{ email, employee_id, display_name, role }`
   - `auth.admin.createUser` 建帳號(`email_confirm` 視流程)
   - 寫一筆 `advisors`
   - 觸發一次 recovery 連結寄信(讓新顧問自己設首次密碼)

2. **`sendRecovery`** `{ email }`
   - `auth.admin.generateLink({ type: 'recovery', email })`
   - **寄信路線 A**:EF 內用 Supabase 內建 SMTP 把連結寄到該 email
   - **不把連結回傳前端、不 log 連結本體**

3. **`deactivate`** `{ email }`
   - `advisors.is_active = false`(建議軟停用,不硬刪,保留 audit 關聯)
   - 對應 auth user 視策略停用(open question #4)

### Audit

每個 action 成功/失敗都寫 `admin_audit`(actor / action / target / 結果)。
失敗回明確 status + 訊息(不洩漏內部細節)。

---

## Part C — Edge Function:`issue-quote-token` 改 join 來源(遷移,重要)

- **現行**:從 `auth.users.app_metadata` 讀 `employee_id/role/display_name`(見 [`issue-quote-token/index.ts`](./supabase/functions/issue-quote-token/index.ts) line 59-64)
- **改為**:用登入者 email 查 `advisors` 表拿 `employee_id/role/display_name`
- `advisors` 同時就是 allowlist:email 不在表(或 `is_active = false`) → **403**
- 簽發其餘不變(HS256 / `iss='fy-cms'` / `aud='fy-quote'` / `exp +1h` / `QUOTE_SSO_SECRET`)

### ⚠ 既有 demo 帳號遷移

`jojo880714@gmail.com` 現為 `app_metadata.employee_id = FY001`。
切表後 `FY001` 不在 advisors(且 spec 真員編是 `tkb0005738`/吳少玄)。

→ 決定並執行:把該登入 email 對應到 advisors 的正確 tkb 員編
(open question #1)。**不要留 FY001 / app_metadata 雙軌**。

---

## Part D — 前端

### 「帳號管理」頁(manager 限定)

- 非 manager 不顯示入口 / 路由擋
- 列 advisors 名單 + 每人「重設密碼(發連結)」「停用」按鈕
- 「新增顧問」表單 → invoke `admin-manage-users` 的 `createUser`

### 「設定新密碼」頁

- 顧問點 recovery 連結落地
- `supabase.auth.updateUser({ password })`
- 完成導回登入

### Email + 密碼登入頁

- 若現行只有 Google entry,要補密碼登入 UI

---

## Part E — 設定 / 文件

- **Supabase Studio**:
  - 開 email/password provider
  - 確認內建 SMTP 寄信可用(寄一封測試,open question #5)
- **更新 [SSO_STATUS.md](./SSO_STATUS.md)**:
  - 身份來源改為 advisors 表(已拍板)
  - 登入方式 email + 密碼
  - 新增「帳號管理」功能段
  - 修訂歷史 +1
- **`.env`**:確認 `VITE_QUOTE_SYSTEM_URL`、`QUOTE_SSO_SECRET` 等不變

---

## 交付清單

- migrations(advisors + admin_audit + RLS + seed)
- 2 支 EF(`admin-manage-users` 新 / `issue-quote-token` 改)
- 前端 3 頁(帳號管理 / 設定新密碼 / email 登入若缺)
- `SSO_STATUS.md` 更新
- 破壞性步驟(`ALTER`、EF deploy)**先看後跑、逐次確認、不無人值守**
- 分批 commit,push 前 diff 給 user 確認

---

## 修訂歷史

| 日期 | 變更 |
|---|---|
| 2026-06-16 | 規格收稿,擺著待丟。Open questions 5 條等 user 拍板。 |
