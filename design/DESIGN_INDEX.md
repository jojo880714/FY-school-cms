# 語校 CMS — 設計文件索引 · v3

> v3 完全取代 v2（v2 範圍寫錯，把 Nexus 自己的頁面也畫了）。
> 設計：Claude Design · 2026-06-18 · Review pending: Laura
> 視覺語言：fanyang-consult 玫瑰 + 金 · Noto Sans TC + DM Mono · 圓角 6/10/14 · 近乎 flat

---

## 文件清單

| 文件 | 類型 | 說明 | Tier |
|------|------|------|------|
| **DESIGN_INDEX.md** | 索引 | 本文件，先讀這裡 | — |
| **CMS Design Hub.dc.html** | 主設計文件 | 資訊架構圖 (Mermaid)、3 條顧問流程 (Mermaid)、5 區塊摘要、18 情境手冊、元件清單、資料模型對齊、假設清單、A11y / 效能 / 擴充 | Tier 1+2+3 |
| **放洋 CMS.dc.html** | 顧問端 App（5 區塊） | 左 CMS nav + 五大區塊互動切換：① 案件首頁 ② LP 產生器 6 步 wizard ③ LP 諮詢模式 ★ ④ 報價單 9 步 ★（含算費引擎 + 顧問/管理員權限切換）⑤ 分析報表 | Tier 1 |
| **選校建議 LP.dc.html** | 公開 LP 範本 | fanyang-consult 風格，mobile-first 430px；右上角顧問⇄學生視角切換，advisor-only 區塊（顧問備注 / 諮詢進度）在學生視角隱藏 | Tier 1 |

---

## 建議 Review 順序

1. **DESIGN_INDEX.md** — 整體脈絡
2. **CMS Design Hub** — IA + 流程 + 18 情境，建立大方向
3. **放洋 CMS** — 點左側 nav 切換 5 區塊；諮詢模式試「顧問/學生視角」、報價單試左下角「顧問/管理員」切換、調週數看即時試算連動
4. **選校建議 LP** — 切換顧問⇄學生視角，看 advisor-only 段落如何隱藏

---

## Tier 完成狀態

### ✅ Tier 1（必交）
- [x] 整體資訊架構圖（Mermaid，Design Hub §02）
- [x] 顧問核心流程圖 A/B/C（Mermaid，Design Hub §03）
- [x] 區塊 1 案件首頁 — 列表 / 統計 / 篩選 / 空狀態
- [x] 區塊 2 LP 產生器 — 6 步 wizard 三欄 layout（step 1–6 皆可走）
- [x] 區塊 3 LP 諮詢模式 ★ — 顧問⇄學生視角、方案配置 UI、學生反應、即時試算
- [x] 區塊 4 報價單 ★ — 9 步、算費引擎、由諮詢帶入、顧問/管理員權限
- [x] 區塊 5 分析報表 — 5 面向 KPI + 轉化漏斗 + 主推 SKU + 下鑽表
- [x] fanyang-consult 公開 LP 範本（顧問 / 學生雙視角）
- [x] Scenario 應對手冊 18 個（Design Hub §05）

### ✅ Tier 2
- [x] 元件清單（Design Hub §06）
- [x] 互動細節（各區塊 hover / 切換 / 空狀態 / 權限狀態已實作）
- [x] 資料模型對齊 + 標出要新增/延伸的表（Design Hub §07）

### ✅ Tier 3
- [x] A11y checklist（Design Hub §09）
- [x] 效能策略（Design Hub §09）
- [x] 未來擴充點（Design Hub §09）

---

## 報價算費引擎（從 app.js 照搬，邏輯不變）

- 5 廠商：EP / ILSC / EC / Kaplan / SGIC，校區獨立定價
- 週數階梯定價 `tiers:[{wf,wt,price,fixed,peak}]`
- 計價單位：按週 / 按堂 / 固定金額 / 按天
- 多幣別 AUD/GBP/EUR/USD/CAD → 即時 TWD 換算（rates 表）
- 尖峰加價 + 折扣（百分比 + 固定 + 學校 promo）
- 最終 =（課程 + 住宿 + 雜費）×(1 − pct) − fixed − schoolDiscount
- 顧問版（看總額）vs 管理員版（看淨利 / 退傭 / 成本）— 改 Nexus role-based，**不用 PIN**
- 報價面板實際呈現 6 層：小計(原幣) → 廠商折扣 → 小計(換算) → 公司折扣 → 營業稅5% → 總計(學生付)；管理員另見 匯差緩衝 / 顧問獎金 / 廠商退傭 / 淨利 / 淨利率

---

## 待 Laura 確認的 Assumptions / TODO

| # | 待確認 |
|---|--------|
| T1 | `tuition_tiers` 加 `fixed/peak/unit` 的 ETL 方案 |
| T2 | CRM 對接 protocol（案件遷移 mapping，預留 `crm_case_id`） |
| T3 | Nexus role mapping（manager / advisor / admin？） |
| T4 | 報價 PDF 樣式：沿用現有版型還是重設計？ |
| T5 | LP 草稿 / 報價單有效期 |
| T6 | 學校漲價時已產報價是否鎖價（設計建議：鎖） |
| T7 | 學生條件 → 學校排序演算法細節 |
| T8 | 報價單編號規則 |

---

## 設計原則

1. **全站統一玫瑰+金視覺**（顧問端 + 公開 LP 一致），等 Nexus 設計系統 Batch 1 回來再對齊 token
2. **公開 LP mobile-first**；顧問端 desktop primary，mobile 可用
3. **CMS 真嵌入 Nexus**：登入態由 Nexus 帶入，無獨立登入 / dashboard
4. **案件輕量 + 預留 CRM 遷移**，不把客戶關係邏輯塞進 CMS
5. **算費邏輯照搬不改**，PIN 機制移除改 role-based
6. **不做最終 hi-fi**，待 Nexus token；遇資訊不足在此列 open question，不臆測

> ⚠️ 注意：本專案綁定的 Design System 專案目前為空，故視覺以 brief 提供的 fanyang-consult token 為準。Nexus 正式 token 回來後一鍵替換 `:root` 變數即可。
