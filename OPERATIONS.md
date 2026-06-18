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

## 修訂歷史

| 日期 | 變更 |
|---|---|
| 2026-06-12 | Phase 19a 建立,收進 gh-pages 事故經驗 + git checkout 規範 |
| 2026-06-15 | 加報價系統 SSO 章節(issue-quote-token EF + app_metadata + QUOTE_SSO_SECRET 設定) |
| 2026-06-18 | 方向轉換清理:移除 SSO 章節(原 line 126-225)。改由 Nexus 接管 SSO,不在 OPERATIONS 內維護。 |
