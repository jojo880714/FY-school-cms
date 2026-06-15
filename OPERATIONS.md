# OPERATIONS.md — 操作規範與常見錯誤

> Phase 19a 建立(2026-06-12)
> 目的:把實際踩過的坑、SOP、危險動作集中記錄,避免下次再炸
> 配套:[MIGRATIONS.md](./MIGRATIONS.md)(schema 變更 SOP)、[BETA_CHECKLIST.md](./BETA_CHECKLIST.md)

---

## gh-pages 部署 SOP

### 正常部署

```bash
npm run deploy
```

預設行為:`gh-pages -d dist` → 把 `dist/` 內容 push 到 origin/gh-pages。

### gh-pages 帶了不該有的 dotfiles

通常是 `gh-pages` 套件的本地 cache 被 main branch 污染。先清 cache 再 deploy:

```bash
rm -rf node_modules/.cache/gh-pages
npm run deploy
```

### 還是有問題(cache fallback bug)— 用 orphan branch 重建

`gh-pages` 套件在 remote branch 不存在時會 fallback 從 main clone(看 cache 的 `.git/config` 是 `[branch "main"]`),所以 `.env` / `.mcp.json` / `supabase/.temp/` 等 dotfiles 一直跟著進去。**單靠 delete remote 不夠**,要徹底重建:

```bash
git push origin :gh-pages                           # 刪 remote
git worktree add --no-checkout /tmp/ghp             # 開獨立 worktree
cd /tmp/ghp
git checkout --orphan gh-pages                      # 全新 orphan branch
git rm -rf .                                        # 清空 worktree
cp -r <PROJECT_ROOT>/dist/* .                       # 只放 dist 內容
git add -A && git commit -m "chore: gh-pages — fresh orphan"
git push -f origin gh-pages

cd <PROJECT_ROOT>
git worktree remove /tmp/ghp
git branch -D gh-pages                              # 本地暫存 branch 清掉
rm -rf node_modules/.cache/gh-pages                 # 清 cache
```

之後 `npm run deploy` 會基於這個乾淨的 orphan branch 增量,不再帶 main 殘留。

---

## git checkout 跨 branch 規範

❗ 切換前**必須**:

1. `git status` 確認**乾淨**(沒有 staged / unstaged 變更)
2. `git stash` 或 commit 完所有工作再切換
3. **gh-pages 清理一律用 orphan worktree,不要直接 `git checkout gh-pages`**

### 為什麼

`git checkout` 失敗時(例:有未 commit 的修改會擋住切換),**接著的 `git rm` 仍會在原 branch 執行**。曾經因此在 main 上炸掉:

- Edge Function `index.ts`(420 行)
- 8 個 migration 檔
- comparison.html 模板(704 行)

事故記錄:bad commit `e317606`(已用 `git reset --hard HEAD~1` 救回,**未 push**)。

### 救援指令

```bash
# 1. 取消任何 merge / unmerged 狀態
git reset HEAD
git checkout -- .

# 2. 撤掉壞 commit(最近 N 顆都可指定)
git reset --hard HEAD~1

# 3. 驗證檔案救回
ls supabase/migrations/ | wc -l
ls supabase/templates/ supabase/functions/generate-page/
```

---

## 破壞性操作規範

### Schema 變更(DDL)

- **必須**寫 migration 檔(時間戳 + snake_case 描述)
- **必須**在 [MIGRATIONS.md](./MIGRATIONS.md) SOP 之下進行
- ALTER TABLE / DROP COLUMN / DROP TABLE / TRUNCATE 等動作禁止「只在 Studio 改但沒寫 migration」

### Edge Function 部署

- Deploy 前確認 `page_templates.comparison` 上的 placeholder 跟 Edge Function 的 `.replace(...)` chain 對齊
- 部署順序:**Edge Function 先 deploy → template UPDATE 才能避免出現字面 `{{...}}` 字串**

### 不做無人值守的自動執行

- 涉及刪除 / 移動 / 跨 branch 動作的指令,**永遠互動式做**
- 不寫 cron / GitHub Actions 自動跑 deploy / migration

### 永久刪除(prohibited action)

- Claude 不執行使用者資料的永久刪除
- `DELETE FROM ... WHERE ...` 由使用者自己在 Supabase Studio 跑
- 軟刪除(`UPDATE ... SET deleted_at = now()`)可以做

---

## Supabase Edge Function template 同步檢查清單

每次改 Edge Function `index.ts` 或 `page_templates.comparison`:

- [ ] Edge Function 的 `.replace("{{XXX}}", ...)` chain 含所有 template 占位符?
- [ ] template 中所有 `{{XXX}}` 都有對應的 Edge Function `.replace`?
- [ ] 新加占位符:**先 deploy Edge Function**(能處理新占位符)→ 再 UPDATE template(出現新占位符)
- [ ] 移除占位符:**先 UPDATE template**(移除占位符)→ 再 deploy Edge Function(清除 `.replace`)

如果順序顛倒,使用者會在公開頁上看到字面 `{{XXX}}` 字串幾秒鐘到幾分鐘。

---

## 報價系統 SSO(quote-system handoff)

CMS 顧問登入後,點 Dashboard 右上「🔗 開報價系統」→ 開新分頁帶簽章 token,報價系統用同一密鑰驗。**避免顧問登入兩次、報價系統不接觸 CMS 密碼**。

### 架構

```
[CMS 顧問已登入]
  │ 點「開報價系統」
  ▼
DashboardPage.openQuoteSystem()
  │ supabase.functions.invoke('issue-quote-token')
  │   (帶 supabase auth session header,EF verify_jwt=true)
  ▼
issue-quote-token Edge Function
  │ 1. service_role 驗 session → user
  │ 2. 讀 user.app_metadata.{employee_id, role, display_name}
  │ 3. HMAC-SHA256 簽 JWT(iss=fy-cms, aud=fy-quote, exp=1h)
  │ 4. 回 { token }
  ▼
window.open(`${VITE_QUOTE_SYSTEM_URL}?t=<token>`)
  ▼
[報價系統]
  │ 同一 QUOTE_SSO_SECRET 驗 HS256
  │ 用 sub(員編)當報價單 owner
  │ 用 role 控制成本/淨利欄位
```

### JWT payload

```json
{
  "sub": "FY001",
  "name": "吳少玄",
  "role": "manager",
  "iss": "fy-cms",
  "aud": "fy-quote",
  "iat": 1781508147,
  "exp": 1781511747
}
```

報價系統端 verify 必檢:`HS256 簽章` + `iss === 'fy-cms'` + `aud === 'fy-quote'` + `exp > now`。

### 設定步驟(管理員)

#### 1. 產 QUOTE_SSO_SECRET(32 bytes hex)

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# 或 openssl rand -hex 32
```

#### 2. 把 secret 設到 Supabase Edge Functions

[Supabase Studio → Project Settings → Edge Functions → Secrets](https://supabase.com/dashboard/project/uxxpagylkdljjaxslmyj/settings/functions) → Add new secret:
- Name: `QUOTE_SSO_SECRET`
- Value: 上一步輸出

#### 3. 同一個 secret 給報價系統團隊

走 **1Password 共享 vault**(或 PrivateBin 一次性連結)。**禁止走 Slack/Email**。

#### 4. 報價系統 URL 進 CMS 前端 env

`.env.local`(本機 dev)/ `.env.production`(deploy 用):
```
VITE_QUOTE_SYSTEM_URL=https://quote.fangyangabroad.com
```
(`.env*` 已 gitignore)

### 新增顧問流程(管理員)

顧問用 Supabase Auth 註冊(email + password)→ 管理員在 Studio 補 `raw_app_meta_data`:

```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
  'employee_id', 'FY002',
  'role', 'advisor',            -- 'manager' 看成本/淨利,'advisor' 不看
  'display_name', '某某'
)
WHERE email = 'xxx@example.com';
```

未綁 `employee_id` 的帳號點「開報價系統」會看到「請聯絡管理員設定」錯誤,不會誤發 token。

### 過期處理

Token 1 小時。報價系統收到過期 token → 顯示「請從 CMS 重新登入」+ link 回 CMS。不做 refresh token。

### 之後可能升級

第一版用 `auth.users.raw_app_meta_data` 存員編/角色(路線 1,輕量)。如果要做:
- 員編 / 角色管理 UI
- 角色控制 CMS 自己內部權限(advisor 看不到別人的頁)
- ERP join

→ 升路線 2:新建 `user_profiles` table,把 metadata 搬進去。EF 從 table join 讀。

---

## 修訂歷史

| 日期 | 變更 |
|---|---|
| 2026-06-12 | Phase 19a 建立,收進 gh-pages 事故經驗 + git checkout 規範 |
| 2026-06-15 | 加報價系統 SSO 章節(issue-quote-token EF + app_metadata + QUOTE_SSO_SECRET 設定) |
