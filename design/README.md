# design/ — Phase 20 設計交付(文字 spec)

**設計者**:Claude Design(另一個 chat session)
**日期**:2026-06-18
**狀態**:✅ 兩輪校對通過 — 但 **Phase 20 entity 凍住,等三系統 master plan**

---

## 內容

| 檔案 | 用途 |
|---|---|
| [DESIGN_INDEX.md](./DESIGN_INDEX.md) | 入口 — 設計總覽 + Tier 完成度 + T1-T8 list |
| [SCENARIOS.md](./SCENARIOS.md) | 18 個顧問/學生/系統情境 |
| [COMPONENTS.md](./COMPONENTS.md) | 21 個元件 × 5 狀態 × Nexus/CMS 來源 |
| [DATA_MODEL.md](./DATA_MODEL.md) | wireframe 資料點 → schema 欄位對齊 + 標出新增/延伸 |
| [OPEN_QUESTIONS.md](./OPEN_QUESTIONS.md) | T1-T8 完整題目 + 建議解 + 阻擋的 sub-phase |

## 不在 repo 的東西

設計的 `.dc.html` artifacts(`放洋 CMS.dc.html` / `選校建議 LP.dc.html` / `CMS Design Hub.dc.html`)在 Claude Design 的 project space,**不在本 repo**。截圖在本機 `~/Downloads/qa` + `~/Downloads/qa2`。

理由:`.dc.html` 是呈現格式不是 code,實作時看本目錄文字 spec 即可。

## 重要 ⚠️

**Phase 20 entity 凍住中**(見 `PROJECT_STATUS.md`「🛑 Phase 20 entity 凍住」段)。

直到三系統(CMS + 報價系統 + TKB 廠商 + Nexus SSOT)master plan 落地、Nexus / 報價 / TKB schema 對齊版定稿前:
- ❌ 不擴張 entity types
- ❌ 不 apply migrations-drafts 內 cases / lp_school_config / quotations
- ❌ 不啟動 Phase 20 任何子階段
- ❌ 不擴大本 design brief

本目錄文字 spec 提供「設計意圖記錄」,實作時機等解凍訊號。
