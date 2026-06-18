# COMPONENTS.md — 元件清單

> 抽自 CMS Design Hub.dc.html §06。每個元件：用途 / props 概念 / 5 狀態 / 來源（Nexus 共用 or CMS 自做）。
> 狀態欄：H=hover · F=focus · L=loading · E=error · ∅=empty。

| 元件 | 用途 | props 概念 | 狀態 | 來源 |
|------|------|-----------|------|------|
| **Button (primary)** | 主行動（新建案件 / 出 PDF） | `label, onClick, disabled` | H 深玫瑰 · F 焦點環 · L spinner+鎖 · E n/a · ∅ n/a | Nexus 共用 |
| **Button (soft)** | 次行動（查看 LP / 開報價） | `label, tone(rose/gold)` | H 底色加深 · F 環 · L n/a | Nexus 共用 |
| **Button (ghost)** | 弱行動（返回 / 取消） | `label` | H 底色淡入 · F 環 | Nexus 共用 |
| **Input / Select / Textarea** | 表單欄位 | `value, placeholder, onChange` | F 玫瑰邊框 · E 紅框+訊息 · ∅ placeholder | Nexus 共用 |
| **Chip / Filter pill** | 狀態 / 條件篩選 | `label, active, onClick` | H 邊框 · active 玫瑰填色 | CMS 自做 |
| **Status badge** | 案件狀態（5 種色票） | `status` | 靜態，色由 status 決定 | CMS 自做 |
| **Stat card** | 統計數字（本月案件等） | `label, value, delta` | H 微浮起 | Nexus 共用 |
| **Case card** | 案件首頁學生卡 | `name, contact, status, lp/quote count` | H 陰影加深 · ∅ 引導卡 | CMS 自做 |
| **School card** | wizard step3 校區卡 | `school, campus, price, onAdd` | H 浮起 · added 已加入態 | CMS 自做 |
| **Step rail** | wizard / 報價步驟列 | `steps, current, onGo` | current 玫瑰 · done 綠勾 | CMS 自做 |
| **Drawer** | 側邊編輯面板 | `open, onClose, children` | open/close 滑動 | Nexus 共用 |
| **Modal** | 確認 / dedup 提示 / 開報價批次 | `open, title, actions` | open 遮罩 | Nexus 共用 |
| **Toast** | 操作回饋（已存草稿） | `message, type` | 自動消失 | Nexus 共用 |
| **Toggle / Switch** | LP 段落顯/隱 · 視角切換 | `on, onChange` | on 玫瑰 · F 環 | CMS 自做 |
| **Stepper (±)** | 週數加減 | `value, min, onInc/onDec` | H 按鈕底色 | CMS 自做 |
| **Progress bar** | 國籍分布 / 條形比例 | `pct, color` | 靜態 | CMS 自做 |
| **Funnel bar** | 轉化漏斗 | `label, value, pct` | 靜態 | CMS 自做 |
| **Data table** | 分析下鑽對比 / 各顧問 | `columns, rows` | H 列高亮 · ∅ 無資料列 | Nexus 共用 |
| **Empty state** | 空列表引導 | `icon, title, cta` | ∅ 專用 | CMS 自做 ⚠ 未實作 |
| **Loading skeleton** | 列表載入 | `lines` | L 專用 | Nexus 共用 ⚠ 未實作 |
| **Error state** | 失敗提示 | `message, onRetry` | E 專用 | CMS 自做 ⚠ 未實作 |

## 備註
- **5 狀態實作現況**：互動切換（active / hover 視覺）已在 wireframe demo；**loading / error / empty** 為設計概念，尚未於 `放洋 CMS.dc.html` 完整呈現（見 SCENARIOS S1/S17/S18）。
- 所有「Nexus 共用」元件等 Nexus 設計系統 Batch 1 回來後對齊 token；目前用 fanyang-consult 玫瑰+金 placeholder。
