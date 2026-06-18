# supabase/migrations-drafts/

**草稿 migration 檔**(尚未 apply,等實作 phase 才正式套用)。

不在 `supabase/migrations/` 內,Supabase CLI 不會自動掃描或套用本目錄。
等到 design 出來、實作開工時,把對應檔案搬進 `supabase/migrations/`,
重命名為標準時間戳格式(`YYYYMMDDHHMMSS_phaseXX_xxx.sql`),走 MIGRATIONS.md SOP。

## 套用順序(實作 phase 時)

1. `_DRAFT_vendors.sql`(廠商表 + schools.vendor_id FK + seed 5 廠商)
2. `_DRAFT_tuition_tiers_extension.sql`(tuition_tiers 加 fixed/peak/unit/category)
3. `_DRAFT_cases.sql`(案件 MVP + generated_pages.case_id FK)
4. `_DRAFT_lp_school_config.sql`(LP 內每校方案配置)
5. `_DRAFT_quotations.sql`(報價單)

## 對應的 design / 工程 phase

| Migration | 用於 | 對應 design 區塊 |
|---|---|---|
| vendors | 廠商切換 UI | Wizard Step 3(廠商→國→校) |
| tuition_tiers_extension | 報價算費 | 區塊 4 報價 wizard |
| cases | 案件首頁 + 隱性建案件 | 區塊 1 + Step 1 |
| lp_school_config | 諮詢模式方案配置 | 區塊 3 ⭐ |
| quotations | 報價單儲存 | 區塊 4 + 5 分析 |

## 紅線

- ❌ 本目錄檔案**不要直接 apply 到 production**
- ❌ 不要從本目錄拿檔案改名後直接 commit 為「正式」migration — 要等 design 出來後 review,可能會有欄位調整
- ✅ 可以本機 review、給 design / 並行 chat 看
- ✅ 確認 schema 設計合理後,搬進 `supabase/migrations/` 並走 SOP
