# CARD_VARIANTS.md — 校區卡片 ABCD 4 variant pattern

> **本檔角色**:補 `COMPONENTS.md` 漏抓的「校區卡片」元件 spec(grep 0 命中)。
> **來源**:`fanyang-consult.html`(LP 完整 source 分析後)。
> **配套**:[PAGE_STRUCTURE.md](./PAGE_STRUCTURE.md)(23 section 結構)/ [DESIGN_INDEX.md](./DESIGN_INDEX.md)
> **採用策略**:Option B 抓骨架重寫(2026-06-23 拍板,詳見 [`/Users/jojowu/FY-school-cms/ARCHITECTURE.md`](../ARCHITECTURE.md) 修訂歷史)

---

## ⚠️ 架構性質:Variant Pattern(非 4 個元件)

**LP source 驗證**(line 3538):

```javascript
function renderCard(c, style){
  // 共用基底
  const ageBadge = `<span class="badge-age ...">${c.age}</span>`;
  const flagLine = `<div class="card-region">${c.flag} ${c.region}・EP ${c.name}</div>`;
  const ageWarning = c.ageMin >= 30 ? `<div class="age-requirement-banner">...</div>` : '';

  if(style === 'A'){ return `...決策型 markup...`; }
  if(style === 'B'){ return `...費用型 markup...`; }
  if(style === 'C'){ return `...氛圍型 markup...`; }
  return `...資訊密集型 markup (style D)...`;
}
```

**結論**:**單一 `renderCard(c, style)` function,用 `style` 參數 dispatch 到 4 個 markup branch**。

### React 實作要求

```tsx
// ✅ 正確 — variant pattern
<CardComponent variant="A" school={schoolData} />
<CardComponent variant="B" school={schoolData} />
<CardComponent variant="C" school={schoolData} />
<CardComponent variant="D" school={schoolData} />

// ❌ 錯誤 — 4 個獨立 component
<CardDecisive school={...} />
<CardCostly school={...} />
<CardMoody school={...} />
<CardDense school={...} />
```

理由:
1. **共用基底**(`.card` 容器 / `ageWarning` / `flagLine` / `ageBadge` / `card-city`)邏輯就一份,4 個 separate components 會重複實作 → 維護成本 ×4
2. **切換 UX**(`<button data-style="X">`)假設「同一個元件改 variant 就能切」,4 個 separate components 要 unmount + mount → 切換成本高
3. 4 種共用同一份 CSS token(玫瑰金 + 字型),共用 `.card-city` `.card-divider` `.card-region` `.card-foot` `.card-head` 等 base class

---

## 4 種 variant 的視覺差異

### Variant A · 決策型

> LP source:`fanyang-consult.html` line 3548-3573

**ab-pill title**:「A:決策型 — 人物標籤 + 關鍵數字 + 特色清單」
**使用情境**:學生在抉擇要哪一座城市

**結構**:
```
.card
  ├─ ageWarning(條件)
  ├─ .personas
  │    └─ .persona-tag × n
  ├─ .card-city + .card-region
  ├─ .card-divider
  ├─ .stat-row
  │    ├─ .stat-box(最低年齡 + stat-val)
  │    ├─ .stat-box(週費起 + stat-val + .fee-twd 台幣換算)
  │    └─ .stat-box(最短修讀 + stat-val)
  ├─ .card-divider
  └─ .feat-list
       └─ .feat-item × n
```

**特色資料點**:`c.personas[]` / `c.age` / `c.cur + c.courseFrom` / `c.minDur` / `c.features[]`

### Variant B · 費用型

> LP source:`fanyang-consult.html` line 3575-3613

**ab-pill title**:「B:費用型 — 課程費 / 住宿費 / 相對費用水位」
**使用情境**:學生在比預算

**結構**:
```
.card
  ├─ ageWarning(條件)
  ├─ .card-head
  │    ├─ .card-city + .card-region
  │    └─ .badge-age(右上角 ageBadge)
  ├─ .card-divider
  ├─ .fee-grid
  │    ├─ .fee-cell(課程費(週)+ fee-val + fee-twd)
  │    └─ .fee-cell(住宿費(週)+ fee-val + fee-twd)
  ├─ .fee-bar
  │    └─ .fee-bar-fill(width: c.costLevel%)
  ├─ .fee-level(低 / 中 / 中高 / 高 label)
  └─ .fee-estimate(4 週估算原幣 + 台幣換算)
```

**特色資料點**:`c.courseRange` / `c.accommRange` / `c.costLevel`(0-100 進度條)

**算費邏輯**(LP 內,需移到 `src/lib/quotation/`):
```javascript
const levelLabel = c.costLevel >= 70 ? '高' : c.costLevel >= 50 ? '中高' : c.costLevel >= 35 ? '中' : '低';
const estLow = (c.courseFrom + c.accommFrom) * 4;
const estHigh = Math.round(estLow * 1.25);
```

### Variant C · 氛圍型

> LP source:`fanyang-consult.html` line 3615-3631

**ab-pill title**:「C:氛圍型 — 城市感受 + 場景引言」
**使用情境**:學生在感受 / 詩意調性的核心

**結構**:
```
.card
  ├─ ageWarning(條件)
  ├─ .mood-tag(氛圍標籤,例如「漫遊海港」)
  ├─ .card-city + .card-region
  ├─ .mood-desc(氛圍描述短句)
  ├─ .icon-pills
  │    └─ .icon-pill × n(圖示徽章列)
  ├─ .quote-box(場景引言,用「」包覆)
  └─ .card-foot(週費起 + 最低年齡,單行)
```

**特色資料點**:`c.moodTag` / `c.moodDesc` / `c.pills[]` / `c.moodScene`

> **詩意調性的視覺核心在這一 variant**。`.mood-desc` + `.quote-box` 是 LP 整體「文學感」的來源,跟其他 variant 的功能性對比鮮明。

### Variant D · 資訊密集型

> LP source:`fanyang-consult.html` line 3633-3676

**ab-pill title**:「D:資訊密集型 — 所有規格一格看完」
**使用情境**:顧問做 demo 用(資訊全展開)

**結構**:
```
.card
  ├─ ageWarning(條件)
  ├─ .card-head
  │    ├─ .card-city + flag + .card-region
  │    └─ .badge-age
  ├─ .card-divider
  ├─ .kv-grid(2×2)
  │    ├─ .kv(最短修讀)
  │    ├─ .kv(最大班級)
  │    ├─ .kv(課程週費起 + fee-twd)
  │    └─ .kv(住宿週費起 + fee-twd)
  ├─ .tag-line「簽證選項」+ .row-tags(.mini-tag × n)
  ├─ .tag-line「課程類型」+ .row-tags(.mini-tag + .mini-tag.is-special)
  └─ .tag-line「住宿選項」+ .row-tags(.mini-tag.is-home/dorm/apt/hotel/hostel)
```

**特色資料點**:`c.classSize` / `c.visaTags[]` / `c.courseTypes[]` / `c.specialCourses[]` / `c.accommTypes[]`

**住宿類型映射**(LP line 3679):
```javascript
{home:'寄宿家庭', dorm:'學生宿舍', apt:'公寓', hotel:'飯店', hostel:'青旅'}
```

---

## 切換 UX

### 切換鈕(advisor-only chrome)

> LP source line 1801-1807

```html
<span class="ab-label">卡片樣式</span>
<div class="ab-pills" id="abStylePills">
  <button class="ab-pill" data-style="A" title="A:決策型 — ...">A</button>
  <button class="ab-pill" data-style="B" title="B:費用型 — ...">B</button>
  <button class="ab-pill" data-style="C" title="C:氛圍型 — ...">C</button>
  <button class="ab-pill" data-style="D" title="D:資訊密集型 — ...">D</button>
</div>
```

**位置**:`#advisor-bar` 內(sticky top,深 ink 背景 `var(--ink)`),學生視角預設掛 `body.demo-mode` → advisor-bar 整條隱藏 → **學生看不到切換鈕**

**樣式**(LP source line 116-122):
- 預設:`background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.75)`
- hover:`background:rgba(255,255,255,0.14); color:#fff`
- `is-on`(active):`background:var(--rose); color:#fff; border-color:var(--ink3)`(玫瑰填色)

### State 機制

> LP source line 3213-3220, 3287-3293

```javascript
// State 來源優先序:URL > SITE_CONFIG > default 'A'
window.SITE_CONFIG = { style:'A', campuses:[...] };
const qStyle = url.searchParams.get('style');
State.style = (qStyle || cfg.style || 'A').toUpperCase();
if (!['A','B','C','D'].includes(State.style)) State.style = 'A';

// 切換 click handler
btn.addEventListener('click', () => {
  State.style = btn.dataset.style;
  document.querySelectorAll('#abStylePills .ab-pill').forEach(b => b.classList.toggle('is-on', b===btn));
  renderAll();
});
```

**預設**:`'A'`(決策型)
**URL override**:`?style=B&campuses=canary,dublin`
**切換動畫**:**無 keyframe**,只在 button 上有 `.is-on` class 切換(玫瑰填色)+ `renderAll()` 整頁重 render

### 第二組 ab-pills:卡片 vs 表格 view 切換

> LP source line 1816-1820

```html
<span class="ab-label">檢視</span>
<div class="ab-pills" id="abViewPills">
  <button class="ab-pill" data-view="cards">卡片</button>
  <button class="ab-pill" data-view="table">表格</button>
</div>
```

跟 ABCD style 切換正交(顧問可同時設定 style=B + view=table)。**這也屬於卡片元件的展示模式維度,需一併設計**。

---

## 跟 CMS token 的對應

| LP class | CSS 規格 | CMS `tokens.css` 對應 |
|---|---|---|
| `.card-city` | `font-size:32px; font-weight:600; line-height:1.1; color:var(--ink)` | `--ink` + 預期用 `--text-2xl` |
| `.card-region` | (LP 沒明寫,默認 sec-sub 體系) | `--ink3` 副文字 |
| `.card-divider` | `height:1px; background:var(--line)` | `--line` |
| `.persona-tag` / `.mini-tag` | (chip 系) | 預期用 `--rose-l` 底 + `--rose-d` 邊 |
| `.badge-age` | (年齡警示) | 視 ageMin 預期用 `--warning` 或 `--gold` |
| active 玫瑰填色 | `var(--rose)` | ✅ 對齊 |

> CMS `tokens.css` 已含 `--text-xs ~ --text-3xl` 7 階字級。**React 實作時建議把 LP 內 22 個 ad-hoc px 規格收斂到這 7 階**。

---

## 待決策(不替 jojo 拍板)

| # | 題目 | 影響 |
|---|---|---|
| **CV1** | CMS 面 B 採用全 4 種還是部分?(例如:對學生只開放 A+B+C,D 留給顧問 demo) | wizard 步驟設計 |
| **CV2** | 切換功能是「顧問現場切換」(LP 原樣)還是「build-time 在 wizard 內決定」?| LP 生成器 wizard step 設計 |
| **CV3** | 預設 variant 是 A 嗎?還是給顧問選一個 per-LP 預設?| SITE_CONFIG schema 設計 |
| **CV4** | 「卡片 vs 表格」view 切換要保留嗎?| 元件實作範圍 |
| **CV5** | 新增第 5 種 variant 的可能?(例如:諮詢模式專用的 advisor-only variant) | 元件擴充性 |

> 這些題目**等 Phase 20 解凍 + wizard 設計階段再拍板**,本檔只描述 LP 現況。

---

## LP 已知問題(實作時順手解決)

| # | 問題 | LP source | 實作時的解法 |
|---|---|---|---|
| LV-1 | 4 個 ab-pill 切換鈕沒 `aria-pressed` 標註 | line 1803-1806 | React 實作 `<button aria-pressed={isActive}>` |
| LV-2 | ab-pills 容器沒 `role="tablist"` / 各鈕沒 `role="tab"` | line 1802 | React 補上 `role="tablist"` + `role="tab"` + `aria-controls` |
| LV-3 | `body.demo-mode` 切換沒 `aria-live` region | line 3322-3325 | React 在切換時 announce(例如「已切換到顧問檢視」) |
| LV-4 | `title` attribute 是唯一說明 4 種定位的地方 | line 1803-1806 | React 改成 `aria-label` 或 visible description |

> 這 4 條是 a11y 加強,不影響功能。React 重寫時順手做。

---

## 實作時機

依賴:
1. ✅ **CMS token 已對齊**(`tokens.css` 來源 = fanyang-consult,glob 已確認)
2. 🛑 **Phase 20 entity 解凍**(等三系統 master plan + Nexus schema 對齊)
3. 🛑 **`lp_school_config` migration apply**(目前在 `supabase/migrations-drafts/_DRAFT_lp_school_config.sql`,凍住中)
4. 🟡 **wizard 設計階段**(CV1-CV5 待決策題目要在 wizard step 4 / 5 拍板)

引用:[`/Users/jojowu/FY-school-cms/ARCHITECTURE.md`](../ARCHITECTURE.md) §7「能不能做(凍 / 不凍)」 + §8「能做但還沒做的(待辦)」

**解凍訊號**:`ARCHITECTURE.md` 內 🛑 區塊改成 🟢 之後,才能啟動本檔實作。

---

## Cross-reference

- [PAGE_STRUCTURE.md](./PAGE_STRUCTURE.md) — 卡片所在的 `sec02` 是「ABCD 4 種卡片並排」section,本檔 + PAGE_STRUCTURE 一起讀
- [COMPONENTS.md](./COMPONENTS.md) — 通用元件清單(Button / Input / Modal 等),本檔是「卡片元件」的詳細補充
- [DESIGN_INDEX.md](./DESIGN_INDEX.md) — 整體設計總覽
- LP source — `https://jojo880714.github.io/fanyang-consult/fanyang-consult.html`
- 分析報告 — `/tmp/fanyang-consult-analysis.md`(暫存,日後可進 docs/ 歸檔)
