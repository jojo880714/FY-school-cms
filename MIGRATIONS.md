# MIGRATIONS.md — Schema 變更 SOP

> Phase 13 建立(2026-05-30)
> 目的:讓 `supabase/migrations/` 不再形同虛設,所有 schema 變更可追蹤、可重現。
> 相關文件:[ROADMAP.md](./ROADMAP.md)、[BETA_CHECKLIST.md](./BETA_CHECKLIST.md)

---

## 政策

**任何修改 Postgres schema 的動作**(ALTER TABLE / CREATE INDEX / CREATE FUNCTION / RLS policy 變更等)**都必須**:

1. **寫一份 migration 檔案** 進 `supabase/migrations/`
2. **同時** 在 Supabase Studio SQL Editor 跑該 SQL 套用線上
3. **一起 commit** 進 git

❌ 禁止「只在 Studio 改但沒寫 migration」(會喪失版本追蹤)
❌ 禁止「只寫 migration 但沒套用」(會造成本地檔案與線上不一致)
❌ 禁止「事後補寫不同內容的 migration」(會誤導未來重建環境)

---

## 檔案命名規範

格式:`{YYYYMMDDHHMMSS}_{snake_case_description}.sql`

取時間戳:`date +"%Y%m%d%H%M%S"`(本地時區即可,順序對齊就好)

現有檔案:

```
supabase/migrations/
├── 20260519085918_add_campus_ids_to_generated_pages.sql   (Phase 4 前置)
├── 20260526181732_add_deleted_at_to_generated_pages.sql   (Phase 8 軟刪除)
└── 20260530140210_add_updated_at_to_generated_pages.sql   (Phase 9 編輯時戳)
```

---

## 內容規範

每個 migration 檔開頭應加註解,說明:
- 對應的 Phase / 目的
- 為什麼這樣設計
- 任何 backfill 邏輯的理由

範例(Phase 9):

```sql
-- Phase 9: 編輯既有頁面的時間戳記
-- 加 updated_at 欄位讓 Dashboard 顯示「編輯於 ...」並追蹤頁面異動

ALTER TABLE generated_pages
  ADD COLUMN updated_at TIMESTAMPTZ;

-- 回填:舊 row 設定為 created_at(代表「沒被編輯過」)
-- Dashboard 顯示邏輯:updated_at > created_at + 容忍 1 秒 → 顯示「編輯於 X」
UPDATE generated_pages
  SET updated_at = created_at
  WHERE updated_at IS NULL;
```

要點:
- 所有相關 DDL 放同一個 migration 檔(避免片段化)
- 包含必要的 backfill
- 包含 partial index 等優化(若有)

---

## 執行流程

### 在 Claude Code 上開發時

1. Claude 把 migration 檔寫到 `supabase/migrations/`(用 `date +%Y%m%d%H%M%S` 取時戳命名)
2. Claude 把 SQL 給你
3. 你貼到 [Supabase Studio SQL Editor](https://supabase.com/dashboard/project/uxxpagylkdljjaxslmyj/sql/new) 跑
   - 目前 Supabase MCP 不穩定常斷,Studio 手動執行最可靠
4. 你確認 `Success` 後告訴 Claude
5. Claude 跑驗證 SQL(若有)、套前端 / Edge Function 改動、commit 一起 push

### 未來考慮(可選提升)

- 安裝 Supabase CLI:`brew install supabase/tap/supabase`
- `supabase link --project-ref uxxpagylkdljjaxslmyj`
- `supabase db push` — 自動套 migration(不需手動貼 Studio)
- `supabase db pull` — 把現線上 schema dump 成 baseline migration(目前缺,屬技術債)
- `supabase db diff` — 對比本地與線上差異

---

## 已知技術債

**Baseline schema 尚未捕捉**

現在 `supabase/migrations/` 只記錄了 **Phase 4 之後的 schema 變更**(3 個 migration)。Phase 4 之前的初始 schema — 包含以下 8 張表的原始定義 + RLS policy — **未版控**:

- `schools`
- `campuses`
- `programs`
- `tuition_tiers`
- `housing`
- `city_info`
- `generated_pages` (Phase 4 之前的 schema,即無 campus_ids/deleted_at/updated_at)
- `page_templates`

**處理時機**:當需要在新環境(staging / 開發環境)複製整個 DB 時,跑一次 `supabase db pull` 補 baseline。目前單一 production DB 不阻擋,標為 P4 技術債。

---

## 緊急回滾

若 migration 套用後發現錯誤:

### 能直接回滾的(無資料依賴)

寫對應的反向 migration,一樣走標準流程:

```sql
-- 例如:Phase X revert add_foo_column
ALTER TABLE generated_pages DROP COLUMN foo;
```

### 不能直接回滾的(已有資料依賴)

- 暫時在 application 層加 workaround(例:讀取時容錯 NULL)
- 規劃資料遷移路徑後再實施反向變更
- 永遠**別硬刪歷史 migration 檔**(會破壞紀律)

---

## 修訂歷史

| 日期 | 變更 |
|---|---|
| 2026-05-30 | Phase 13 初版建立 |
