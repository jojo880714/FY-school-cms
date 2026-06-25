# 語校資料載入 — 標準處理規則(每次載入都適用)

> **目的**:把反覆出現的「機械性」資料問題一次定義清楚,CC 每次載入照這套**自動處理**,不要再逐次回去問 jojo。
> **適用**:把 Google master sheet 的語校資料載進 Supabase(LP 讀 Supabase)。
> **鐵則**:機械性問題(§1–4)一律自動處理、不回頭問 jojo;**只有「真實事實缺漏」(§5)才回報請 jojo 補**。
>
> 對應 import 工具:`scripts/import-from-sheets.js`(Node 端 / GAS 端皆遵守)。

---

## 1. sheet → Supabase 欄位 / 關聯對映(自動)

- sheet 用 `school_name` 當關聯;Supabase child 表用 `school_id` UUID FK(campuses / programs / housing),`tuition_tiers` 用 `program_id` + `campus_id`。
- CC 載入時自行解析 name → id 對應,**不要因為 key 形式不同就停下問**。
- `school_name` 與 `schools.name` 一字不差比對。

## 2. 格式跑掉的列 → 自動修復(自動)

- 欄位錯位 / 空格跑掉的列(如 `,175,USD,,General ESL (Banilad),`),依上下文還原成正確欄位後載入。
- 回報時列出「修復了哪幾列、怎麼還原」。**只有無法合理還原的才停下問。**

## 3. NOT NULL 欄位但 sheet 沒給 → sentinel + 優雅呈現(自動,**不 fabricate、不停**)

- 某些 Supabase 欄位 NOT NULL 但 sheet 沒資料(例:`programs.lessons_per_week` / `lesson_minutes`)。
- 處理:存一個 sentinel(如 `0`),**並確保 LP 渲染時把 sentinel 視為「未提供」→ 顯示「—」或省略該行,絕不顯示成一個看起來像真的假數字。**
- 該欄位列入「待 jojo 補真值清單」回報。
- ❌ **不要自己估一個數字當真值**(顧問會照著對學生講,假數字風險高)。

## 4. 內容型欄位缺漏 → placeholder,不 fabricate(自動)

- 文字 / 內容欄位缺(例:`nationality_breakdown`、`persona_match`)→ LP 該 section 顯示既有的「請洽顧問取得」placeholder。
- **不要編造**假比例 / 假見證 / 假數字。

## 5. 唯一需要 jojo 的事:真實事實

- §1–4 全部 CC 自動處理,**不回去問 jojo**。
- **只有「只有 jojo / 校方知道的真實數字或事實」才回報請 jojo 補**(例:某課程實際一週幾堂、各國學生實際比例)。
- 這類列成一張「**待補真值清單**」,jojo 有空再補,**不擋當下載入與生成**。

## 6. 每次載入流程

1. 先勘查 Supabase 現況(該校有沒有 / 缺哪些)→ 回報。
2. 照 §1–4 自動處理 → INSERT/UPDATE(動 production 前發一行「要動了」)。
3. 生成測試 LP → 回貼 URL。
4. 回報三件事:**載入結果**(各表 +N)、**自動修復/處理了什麼**(§2/§3)、**待 jojo 補真值清單**(§5)。

## 7. 凍住 / 不碰

Phase 20 entity / Nexus / 報價 / TKB / SSO / 凍住 migrations-drafts;不刪 ILAC / ILSC;不動既有 25 LP 的 `html_content`。

---

## 歷史套用紀錄

| 日期 | 學校 | 自動處理 | 待補真值 |
|---|---|---|---|
| 2026-06-25 | CG(Cebu Globalization)| §2 修復 General ESL `,175,USD,,General ESL (Banilad),` 格式;§3 `programs.lessons_per_week / lesson_minutes` 存 sentinel 0;§4 nationality_breakdown / persona_match / nationality_count / min_age 留 placeholder | lessons_per_week / lesson_minutes(每課程實際值)、nationality_breakdown(國籍分布)、persona_match(學員 persona)、min_age(最低收生年齡)|
