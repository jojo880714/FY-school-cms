# PAGE_STRUCTURE.md — LP 頁面結構 23 section + 節奏

> **本檔角色**:補 `design/` 漏抓的「LP 整體頁面結構」spec。
> **來源**:`fanyang-consult.html`(LP 完整 source 分析後)。
> **配套**:[CARD_VARIANTS.md](./CARD_VARIANTS.md)(校區卡片 ABCD)/ [DESIGN_INDEX.md](./DESIGN_INDEX.md)
> **採用策略**:Option B 抓骨架重寫(2026-06-23 拍板,詳見 [`/Users/jojowu/FY-school-cms/ARCHITECTURE.md`](../ARCHITECTURE.md) 修訂歷史)

---

## TL;DR

LP 共 **23 個 section**(13 個機械 ID `sec01-13` + 10 個語意 ID `sec_xxx`),交織排列。

節奏設計:
- **5 個「情感型」section**(`sec01 / sec04 / sec08 / sec11 / sec13`)用 **120px** 上下 padding 做大呼吸感
- **其他 18 個 section** 用預設 **96px** padding
- **情感 / 資訊 / 過渡** 三類交織,避免讀者疲勞
- **2 個 advisor-only section**(`sec_photos` / `sec_return`)只在顧問檢視顯示

---

## 完整 section 清單(按 LP 出現順序)

> LP source:`fanyang-consult.html` line 1837-1875(`renderAll()` 內的 section render 順序)

| 順序 | Section ID | 類型 | padding | 主題 / 用途 | advisor-only |
|---|---|---|---|---|---|
| 1 | `sec01` | 情感型 | **120px** | Hero / 開場 | |
| 2 | `sec02` | 主視覺 | 96px | **ABCD 4 種卡片並排**(見 [CARD_VARIANTS.md](./CARD_VARIANTS.md))| |
| 3 | `sec03` | 理性 | 96px | 城市並排表 | |
| 4 | `sec04` | 情感型 | **120px** | 詩意 quote / 情感橋接 | |
| 5 | `sec_photos` | 限顧問 | 96px | 相片牆 | ✅ |
| 6 | `sec_area` | 資訊 | 96px | 周邊環境 | |
| 7 | `sec_flight` | 資訊 | 96px | 飛行資訊(台灣→當地)| |
| 8 | `sec_climate` | 資訊 | 96px | 氣候曲線 | |
| 9 | `sec_spend` | 資訊 | 96px | 日常消費 | |
| 10 | `sec08` | 情感型 | **120px** | 詩意 quote 二 | |
| 11 | `sec05` | 資訊 | 96px | 課程 | |
| 12 | `sec06` | 資訊 | 96px | 住宿 | |
| 13 | `sec07` | 過渡 | 96px | 城市生活展開 | |
| 14 | `sec_costfull` | 表格 | 96px | 全費用並排 | |
| 15 | `sec_voices` | 社證 | 96px | 過來人聲音 / 國籍組成 | |
| 16 | `sec09` | 體驗 | 96px | 一日時間軸 | |
| 17 | `sec10` | 決策 | 96px | 校區性格(像不像你)| |
| 18 | `sec11` | 教育 | **120px** | CEFR 等級說明 | |
| 19 | `sec_safety` | 信任 | 96px | 行前 / 抵後保障 | |
| 20 | `sec_return` | 限顧問 | 96px | 回國 ROI | ✅ |
| 21 | `sec_faq` | 資訊 | 96px | FAQ | |
| 22 | `sec12` | CTA | 96px | 流程(放洋陪你走)| |
| 23 | `sec13` | 情感型 | **120px** | 收尾 | |

---

## 節奏圖示

```
位置  1   2   3   4   5   6   7   8   9   10  11  12  13  14  15  16  17  18  19  20  21  22  23
type  情  主  理  情  限  資  資  資  資  情  資  資  過  表  社  體  決  教  信  限  資  CTA 情
pad   120 96  96  120 96  96  96  96  96  120 96  96  96  96  96  96  96  120 96  96  96  96  120

設計意圖:
  情 ──→ 主 ──→ 理      開場張力 → 主視覺 → 比較表(高密度資訊)
       sec01-03
                  → 情              詩意 quote(讓讀者喘息)
                    sec04
                           → 資×4           周邊資訊(advisor-only 相片穿插)
                             sec_photos-sec_spend
                                       → 情      詩意 quote 二(中段呼吸)
                                         sec08
                                                → 資×2 → 過      課程 + 住宿 + 過渡
                                                  sec05-07
                                                              → 表 → 社 → 體 → 決      費用 + 社證 + 體驗 + 決策
                                                                sec_costfull-sec10
                                                                                    → 情      CEFR(教育語氣)
                                                                                      sec11
                                                                                          → 信 → 限 → 資 → CTA → 情  收尾鏈
                                                                                            sec_safety-sec13

5 個情感 anchor(sec01 / sec04 / sec08 / sec11 / sec13)在頁面內均勻分布,
每隔 4-5 個資訊 section 出現一次,作為 cognitive break。
```

---

## 重要 padding pattern

> LP source line 62-70

```css
section{padding:96px 0;border-bottom:none}

/* 情感型 section 給更大空間 */
#sec01{padding:120px 0}
#sec04{padding:120px 0}
#sec08{padding:120px 0}
#sec11{padding:120px 0}
#sec13{padding:120px 0}
```

**規則**:
- 預設 `96px`(上下)
- 情感型 5 個 section 用 `120px`(+ 25%)
- 不用 `border-bottom`,改用 **背景色塊** 做節奏(LP source line 70-73):

```css
/* 用底色塊製造節奏(非邊框) */
#sec02,#sec_voices,#sec07,#sec_costfull,#sec_safety,#sec10{background:var(--bg)}
#sec03,#sec05,#sec06,#sec_area,#sec_flight,#sec_climate,#sec_spend,#sec_return,#sec12{background:var(--sur)}
```

**意義**:**section 之間靠背景色(`--bg` 米色 vs `--sur` 白)交替**,不用 border。視覺上更柔順,符合 LP「近 flat」+「詩意」調性。

---

## Layout shell

> LP source line 60-61

```css
.wrap{max-width:1080px;margin:0 auto;padding:0 48px}
.wrap-wide{max-width:1200px;margin:0 auto;padding:0 48px}
```

- **預設 wrap**:1080px / 左右 48px padding
- **wide wrap**:1200px(用在資訊密度高的 section,例如 ABCD 卡片並排 / 全費用表)
- mobile 縮小到 viewport 寬,padding 自動跟著縮

---

## 響應式斷點

> LP source

```css
@media (max-width: 520px)    /* mobile */
@media (max-width: 900px)    /* tablet */
@media (max-width: 1100px)   /* desktop narrow */
@media (max-width: 1280px)   /* desktop wide */
@media print                  /* 列印(advisor-only 隱藏)*/
```

**LP 設計目標**:mobile-first(430px / iPhone 寬度)+ desktop 友善。**4 個視覺斷點 + 1 個列印**。

> CMS `tokens.css` 目前沒明確定義斷點,**React 實作時建議直接採用 LP 這 4 個斷點**作為 CMS 全站斷點 token。

---

## advisor-only chrome(關聯 demo-mode 機制)

> LP source line 148-151, 1794, 3322-3325

```css
/* Demo mode hides advisor-only */
body.demo-mode .advisor-only{display:none !important}
body:not(.demo-mode) .demo-only{display:none !important}
body.demo-mode .area-layout{grid-template-columns:1fr}
```

```html
<body class="demo-mode">  <!-- 預設掛 demo-mode = 學生視角 -->
```

```javascript
// 顧問檢視 toggle:勾選後「移除」demo-mode(露出 advisor-only chrome)
demoToggle.addEventListener('change', e => {
  document.body.classList.toggle('demo-mode', !e.target.checked);
});
```

**機制摘要**:
- **預設**:`<body class="demo-mode">` → 學生視角乾淨,`.advisor-only` 全部隱藏
- **顧問勾選 `#demoToggle`** → 移除 `demo-mode` class → 露出 advisor-only chrome
- **同時** `.demo-only` 是反向:demo-mode 顯示 / 顧問檢視隱藏(用於「示範文案」提示)

**被隱藏的 advisor-only chrome 包含**:
- 整條 `#advisor-bar`(LP source line 1797-1834)
- 2 個 advisor-only section(`sec_photos` 相片 + `sec_return` 回國 ROI)
- `.advisor-only.data-pending-note`(待業主提供素材的提示,例如 line 4381)
- `.area-right.advisor-only`(`sec_area` 右側面板)
- ABCD 卡片切換鈕本身也在 advisor-bar 內 → **學生看不到切換鈕,只能看到 SITE_CONFIG 注入的預設樣式**

---

## advisor-bar 結構(顧問檢視時露出)

> LP source line 1797-1834

```
#advisor-bar(sticky top, z-index:50, 深 ink 背景)
  ├─ .ab-group .ab-group-style
  │    └─ "卡片樣式" + ABCD 4 個 ab-pill
  ├─ .ab-group .ab-group-view
  │    └─ "檢視" + 卡片/表格 2 個 ab-pill
  ├─ .ab-group .ab-group-phase .advisor-only
  │    └─ "諮詢進度" + ab-phase-row(JS 動態 render)
  ├─ .ab-spacer(flex grow)
  └─ .ab-toggle
       └─ checkbox#demoToggle + "顧問檢視" label
```

**諮詢進度 phase indicator**(LP source line 3360-3379):
- LP 內是 **scroll-based phase tracker** — 跟著當前 scroll 到哪個 section,顯示「目前在諮詢第幾階段(1..4)」
- ⚠️ **這跟 [`DATA_MODEL.md`](./DATA_MODEL.md) L49 的「學生反應(⭐/✓/◌/✗)」是不同概念**:LP 的「諮詢進度」= 諮詢階段 timeline indicator,`DATA_MODEL` 的「學生反應」= 學生對「某一個學校」的 4 級評分(per-school)。**不是 wording 衝突,是兩個獨立 feature**

---

## 跟 CMS token 對應

| LP 規格 | CMS `tokens.css` |
|---|---|
| Section padding 96px / 120px | 預期用 `--space-16`(64px)/ `--space-24`(目前無)/ 自定 |
| Layout wrap 1080px / 1200px | 目前 `tokens.css` 沒 layout token,建議補 `--max-w-narrow` / `--max-w-wide` |
| 背景色塊 `--bg` / `--sur` 交替 | ✅ 已對齊 |
| 4 個斷點 520/900/1100/1280 | 目前 `tokens.css` 沒斷點 token,建議補 `--bp-sm/md/lg/xl` |

---

## 待決策(不替 jojo 拍板)

| # | 題目 | 影響 |
|---|---|---|
| **PS1** | CMS 面 B 用全 23 section,還是縮減?(例如:學生看 LP 不需要 `sec_photos` / `sec_return`)| LP wizard 設計 |
| **PS2** | section 順序要不要重新排?(目前 sec05/06/07/08 在 LP source 順序內被 sec08 插隊)| 內容流程設計 |
| **PS3** | advisor-only 機制要不要保留?(LP 的 sec_photos / sec_return / advisor-bar) | CMS 諮詢模式設計 |
| **PS4** | 5 個情感型 section 的 120px padding 要不要保留?(等 Nexus 設計系統來時可能要調)| 視覺密度設計 |
| **PS5** | section 背景色塊交替(`--bg` / `--sur`)要不要全採用?| 視覺節奏設計 |

> 這些題目**等 Phase 20 解凍 + wizard 設計階段再拍板**,本檔只描述 LP 現況。

---

## LP 已知問題(實作時順手解決)

| # | 問題 | LP source | 實作時的解法 |
|---|---|---|---|
| LV-5 | SEC ID 命名不一致(機械 `sec01-13` + 語意 `sec_xxx` 混用)| line 1837-1875 | React 實作統一語意命名(例如 `sec_hero` / `sec_compare` / `sec_quote_open` 等)|
| LV-6 | section 出現順序跟 ID 不對應(`sec08` 在 `sec05` 之前)| line 1846 vs 1847 | React 實作把 ID 跟順序對齊,避免 future maintainer 混淆 |
| LV-7 | meta description 寫「比較全球 11 個 EP 語言學校校區」,但 SITE_CONFIG 預設只 3 校 | line 6 vs line 21 | CMS 生成 LP 時 meta description **動態填充**(基於 SITE_CONFIG.campuses.length) |
| LV-8 | advisor-only section 在 print stylesheet 也隱藏 | line 1363-1365 | 確認 print scenario 是否真的不需要這些(否則保留)|

> 這 4 條是 metadata + 一致性問題,不影響功能。React 重寫時順手做。

---

## 實作時機

依賴:
1. ✅ **CMS token 已對齊**(`tokens.css` 來源 = fanyang-consult)
2. 🛑 **Phase 20 entity 解凍**(等三系統 master plan + Nexus schema 對齊)
3. 🛑 **`lp_school_config` migration apply**(目前在 `supabase/migrations-drafts/_DRAFT_lp_school_config.sql`,凍住中)
4. 🟡 **wizard 設計階段**(PS1-PS5 待決策題目要在 wizard 設計階段拍板)
5. 🟡 **CARD_VARIANTS 實作**(本檔 `sec02` 依賴 [CARD_VARIANTS.md](./CARD_VARIANTS.md))

引用:[`/Users/jojowu/FY-school-cms/ARCHITECTURE.md`](../ARCHITECTURE.md) §7「能不能做(凍 / 不凍)」 + §8「能做但還沒做的(待辦)」

**解凍訊號**:`ARCHITECTURE.md` 內 🛑 區塊改成 🟢 之後,才能啟動本檔實作。

---

## Cross-reference

- [CARD_VARIANTS.md](./CARD_VARIANTS.md) — ABCD 4 種校區卡片 variant(本檔的 `sec02` 主視覺)
- [COMPONENTS.md](./COMPONENTS.md) — 通用元件清單
- [DATA_MODEL.md](./DATA_MODEL.md) — 「學生反應」schema(注意:跟本檔的「諮詢進度」是不同 feature,詳見「advisor-bar 結構」段)
- [DESIGN_INDEX.md](./DESIGN_INDEX.md) — 整體設計總覽
- LP source — `https://jojo880714.github.io/fanyang-consult/fanyang-consult.html`
- 分析報告 — `/tmp/fanyang-consult-analysis.md`(暫存)
