# IMPORT_TEMPLATES.md — 真實資料匯入範本

> Phase 14b 建立(2026-06-01)
> 目的:給你準備 20+ 間語校資料的明確欄位規格,讓你能在 Google Sheets / Excel 整理,之後一次匯入 Supabase
> 配套:[ROADMAP.md](./ROADMAP.md) Phase 14 / [MIGRATIONS.md](./MIGRATIONS.md)
> 前置:Phase 14a migration 必須先套用(否則 country / currency 欄位不存在)

---

## 0. 流程總覽

```
[你做]                       [Claude 做]
─────────                    ─────────
1. 建 Google Sheets(6 tabs)
2. 照下面欄位規格填資料
3. 每 tab 匯出 CSV
4. 告訴 Claude「資料齊了」     → 5. 寫匯入腳本(Phase 14c)
                              → 6. 跑匯入 + 驗證
                              → 7. 更新 Edge Function 讀新欄位
                              → 8. 重新 deploy
9. 內部封測!
```

**Sheets 建議分頁順序與名稱**:
1. `schools` — 學校(品牌層)
2. `campuses` — 校區(地點)
3. `programs` — 課程方案
4. `tuition_tiers` — 學費價格
5. `housing` — 住宿
6. `city_info` — 城市資訊

**填寫順序很重要**:1 → 2、3、5 → 4 → 6
(因為 2/3/5 都需要參照 1 的 school_id;4 需要參照 3 的 program_id)

但 **你只需要填「school name」/ 「program name」當參照,不用填 UUID** — Claude 寫匯入腳本時會自動對應。

---

## 1. `schools` — 學校(品牌層)

每一間語校在這張表只有一筆。校區、課程、住宿都關聯到這裡。

| 欄位 | 類型 | 必填 | 範例 | 說明 |
|---|---|:---:|---|---|
| `name` | TEXT | ✅ | `ILAC` | 短名/通用名稱 |
| `full_name` | TEXT |  | `International Language Academy of Canada` | 全名 |
| `country` | TEXT | ✅ | `Canada` | 國家名,英文,用作匯入分群與篩選 |
| `founded` | INT |  | `1997` | 創立年份(4 位數) |
| `english_only_policy` | BOOL |  | `TRUE` / `FALSE` | 是否強制英語政策 |
| `accreditation` | 陣列 |  | `Languages Canada, ACCET` | 認證機構,**用半形逗號分隔**,匯入時轉陣列 |
| `nationality_count` | INT |  | `80` | 國籍數量(該校學生來源國家數) |
| `notes` | TEXT |  | `多倫多老牌大校,商英課程最強` | 顧問補充說明 |
| `class_size_typical` | INT |  | `12` | 平均班級人數(Phase 15a 新增) |
| `class_size_max` | INT |  | `18` | 班級人數上限(Phase 15a 新增) |
| `strengths` | 陣列 |  | `商英最強, 年輕活潑氛圍, IELTS 衝刺` | 該校 2-3 個強項標籤,半形逗號分隔(Phase 15a 新增) |
| `suitable_for` | 陣列 |  | `想短期體驗, 想升學, 想兼打工` | 適合的學生類型,半形逗號分隔(Phase 15a 新增) |
| `one_liner` | TEXT |  | `年輕活潑氛圍的多倫多商英大校` | TLDR 一句話定位(<40 字),Section 2 用(Phase 16a 新增) |
| `english_only_policy_label` | TEXT |  | `違規警告制` | 顧問用語化的英語政策描述(<12 字),Section 3 用(Phase 16a 新增) |
| `min_age` | INT |  | `18` | 最低收生年齡(NULL = 無限制 / 待補),未來給「依學生年齡過濾」UI 用(Phase 16a 新增) |
| `top_nationalities` | JSONB |  | `[{"name":"Spain","flag":"🇪🇸"},{"name":"Brazil","flag":"🇧🇷"}]` | ⚠️ **DEPRECATED — Phase 18b 移除**。Phase 14c~18b 過渡期:Edge Function Section 10 仍讀此欄位,所以**匯入時與 `nationality_breakdown` 雙寫同一份學校的國籍清單**,否則 Section 10 國籍卡會空白。18b 切到 `nationality_breakdown` 後同步 DROP COLUMN。 |
| `nationality_breakdown` | JSONB | ✅ | `[{"flag":"🇪🇸","name":"西班牙","pct":24},{"flag":"🇧🇷","name":"巴西","pct":18}]` | 前 5-7 個主要學生國籍 **含百分比**。每筆物件含 `flag` / `name` / `pct` 三欄,**`pct` 必填**(數字,顧問據實估算,總和不需精確 100)。Phase 18b 起為 Section 10 國籍卡唯一資料源。建議每年更新一次(Phase 18a 新增)。 |
| `persona_match` | 陣列 |  | `exam_prep, pathway_grad, career_change` | 適合的學員人物 tag,**用半形逗號分隔**,從 master list 挑選(Phase 16c 新增):<br>• `exam_prep`(考試衝刺)<br>• `pathway_uni`(銜接升大學)<br>• `pathway_grad`(銜接升研究所)<br>• `working_holiday`(打工度假/WHV 配套)<br>• `career_change`(職涯轉換,鎖定 30+)<br>• `gap_year`(學測後 Gap year)<br>Section 4「人物 × 校」矩陣用 |

**範例 rows:**

| name | full_name | country | founded | english_only_policy | accreditation | nationality_count | notes | class_size_typical | class_size_max | strengths | suitable_for |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ILAC | International Language Academy of Canada | Canada | 1997 | TRUE | Languages Canada, ACCET | 80 | 多倫多老牌大校 | 13 | 18 | 商英最強, 年輕活潑, 升學銜接強 | 想升學, 想兼打工, 想短期體驗 |
| Kaplan | Kaplan International Languages | UK | 1938 | FALSE | British Council, English UK | 150 | 全球網絡大 | 14 | 15 | 全球網絡, 考試準備, 品牌穩定 | 想國際同學圈, 想考試衝刺 |
| EC | EC English Language Centres | UK | 1991 | TRUE | British Council, IALC | 140 | 課程結構嚴謹 | 12 | 15 | 課程結構嚴謹, 老師資深, 國籍均衡 | 想穩紮穩打學英文, 想避免亞洲學生過多 |

---

## 2. `campuses` — 校區(地點)

一間學校在不同城市有多個校區,每個校區一筆。

| 欄位 | 類型 | 必填 | 範例 | 說明 |
|---|---|:---:|---|---|
| `school_name` ⚠ | TEXT | ✅ | `ILAC` | **對應 schools.name**(不是 UUID),匯入時自動轉 school_id |
| `city` | TEXT | ✅ | `Toronto` | 英文城市名,必須與 `city_info.city` 一致 |
| `metro_station` | TEXT |  | `Yonge` | 最近捷運站 |
| `walk_minutes` | INT |  | `3` | 步行時間(分鐘) |
| `highlight` | TEXT |  | `市中心金融區,步行可達多倫多大學` | 該校區特色,中文 |

⚠ `school_name` 是匯入用對應欄位,**DB 實際存的是 school_id (UUID)**。

**範例 rows:**

| school_name | city | metro_station | walk_minutes | highlight |
|---|---|---|---|---|
| ILAC | Toronto | Yonge | 3 | 市中心金融區 |
| ILAC | Vancouver | Burrard | 5 | 緊鄰加拿大廣場 |
| Kaplan | London | Covent Garden | 4 | 倫敦西區劇院文化區 |
| Kaplan | Sydney | Town Hall | 2 | 雪梨市中心 |

---

## 3. `programs` — 課程方案

每間學校的課程方案,可能多筆(General English / IELTS / Cambridge / Business 等)。

| 欄位 | 類型 | 必填 | 範例 | 說明 |
|---|---|:---:|---|---|
| `school_name` ⚠ | TEXT | ✅ | `ILAC` | 對應 schools.name |
| `name` | TEXT | ✅ | `General English` | 課程名稱,英文 |
| `hours_per_week` | INT |  | `30` | 每週小時數 |
| `schedule` | TEXT |  | `週一至五 9:00-15:00` | 上課時段描述,中文可 |
| `entry_level` | TEXT |  | `Pre-Intermediate (A2)` | 入學門檻,用 CEFR 等級或 IELTS 分數,讓學生知道「我這程度上得到嗎」(Phase 15a 新增) |
| `outcome_level` | TEXT |  | `C1 / IELTS 6.5+` | 預期學成後 outcome,讓學生知道「畢業後我會到什麼程度」(Phase 15a 新增) |
| `min_weeks` | INT |  | `4` | 該課程最短可報週數,Section 5 比較表用(Phase 16a 新增) |

**範例 rows:**

| school_name | name | hours_per_week | schedule | entry_level | outcome_level |
|---|---|---|---|---|---|
| ILAC | Intensive English | 30 | 週一至五 9:00-15:30 | Beginner (A1) | B2 / IELTS 6.0 |
| ILAC | Power English | 38 | 週一至五 9:00-18:00 | Intermediate (B1) | C1 / IELTS 7.0+ |
| ILAC | IELTS Preparation | 32 | 週一至五 9:00-16:00 | Upper-Intermediate (B2) | IELTS 6.5+ |
| Kaplan | Vacation English | 20 | 週一至五 9:00-13:00 | Beginner (A1) | A2 |
| Kaplan | Intensive Academic | 28 | 週一至五 9:00-15:30 | Intermediate (B1) | B2 / IELTS 6.0+ |

---

## 4. `tuition_tiers` — 學費價格

對應每個課程的學費,**可能多筆(階梯式定價:1-11 週、12-23 週、24+ 週)**。

| 欄位 | 類型 | 必填 | 範例 | 說明 |
|---|---|:---:|---|---|
| `school_name` ⚠ | TEXT | ✅ | `ILAC` | 對應 schools.name |
| `program_name` ⚠ | TEXT | ✅ | `Intensive English` | 對應該校的 programs.name |
| `price_per_week` | NUMERIC | ✅ | `350` | 每週學費,**不含幣別符號** |
| `currency` | TEXT | ✅ | `CAD` | 幣別 ISO code:`CAD` / `USD` / `GBP` / `AUD` / `EUR` / `NZD` |
| `min_weeks` | INT |  | `1` | 此價位適用的最少週數(階梯定價用) |
| `max_weeks` | INT |  | `11` | 此價位適用的最多週數 |

⚠ `school_name` + `program_name` 是聯合對應鍵,匯入時組合找 program_id。

**範例 rows(同課程的階梯定價):**

| school_name | program_name | price_per_week | currency | min_weeks | max_weeks |
|---|---|---|---|---|---|
| ILAC | Intensive English | 380 | CAD | 1 | 11 |
| ILAC | Intensive English | 360 | CAD | 12 | 23 |
| ILAC | Intensive English | 340 | CAD | 24 |  |
| Kaplan | Intensive Academic | 320 | GBP | 1 | 11 |
| Kaplan | Intensive Academic | 295 | GBP | 12 | 23 |
| EC | General English | 280 | USD | 1 | 11 |

---

## 5. `housing` — 住宿

每間學校提供的住宿選項,可能多筆。

| 欄位 | 類型 | 必填 | 範例 | 說明 |
|---|---|:---:|---|---|
| `school_name` ⚠ | TEXT | ✅ | `ILAC` | 對應 schools.name |
| `type` | TEXT | ✅ | `Homestay` | 大類型:`Homestay` / `Residence` / `Apartment` / `Hotel` |
| `subtype` | TEXT |  | `Single Room, Half Board` | 細項描述 |
| `price_per_week` | NUMERIC | ✅ | `250` | 每週費用,不含幣別 |
| `currency` | TEXT | ✅ | `CAD` | 幣別 ISO code |
| `includes` | TEXT |  | `半膳(早晚餐)` | 含什麼(早餐/半膳/自理/含洗衣...),Section 8 住宿矩陣用(Phase 16a 新增) |
| `commute_to_school` | TEXT |  | `步行 5 分鐘` | 通勤描述,Section 8 用(Phase 16a 新增) |

**範例 rows:**

| school_name | type | subtype | price_per_week | currency |
|---|---|---|---|---|
| ILAC | Homestay | Single Room + Half Board | 270 | CAD |
| ILAC | Residence | Standard Single | 320 | CAD |
| Kaplan | Homestay | Single + Half Board | 250 | GBP |
| Kaplan | Residence | Premium Studio | 380 | GBP |

---

## 6. `city_info` — 城市資訊

每個城市一筆。**city 的值必須與 campuses.city 一字不差**(包含大小寫)。

| 欄位 | 類型 | 必填 | 範例 | 說明 |
|---|---|:---:|---|---|
| `city` | TEXT | ✅ | `Toronto` | 與 campuses.city 一致 |
| `country` | TEXT | ✅ | `Canada` | 國家 |
| `climate` | TEXT |  | `四季分明,冬季嚴寒` | 氣候描述,中文 |
| `population` | TEXT |  | `280萬` | 人口(用字串避免處理單位) |
| `cost_of_living_monthly` | INT |  | `1500` | 月生活費(數字,不含幣別) |
| `cost_of_living_currency` | TEXT |  | `CAD` | 生活費幣別 |
| `highlights` | 陣列 |  | `金融中心, 多元文化, 大湖區` | 城市特色,半形逗號分隔 |
| `visa_options` | 陣列 |  | `eTA, 學簽, 工簽` | 該城市/國家適用簽證選項,半形逗號分隔,Section 5 比較表用(Phase 16a 新增) |

**範例 rows:**

| city | country | climate | population | cost_of_living_monthly | cost_of_living_currency | highlights |
|---|---|---|---|---|---|---|
| Toronto | Canada | 四季分明 | 280萬 | 1500 | CAD | 金融中心, 多元文化 |
| Vancouver | Canada | 溫和多雨 | 67萬 | 1700 | CAD | 山海景, 亞洲文化濃 |
| London | UK | 冬季陰雨 | 900萬 | 1800 | GBP | 國際都會, 文化遺產 |
| New York | USA | 四季分明 | 830萬 | 2500 | USD | 全球中心, 機會多 |

---

## 7. 共通規則 / 注意事項

### 文字編碼
- 中英混合 OK
- 全形/半形:**精確用「半形」**(逗號 `,` 不是 `,`;括號 `()` 不是 `()`)— 否則匯入時會被當字面字串

### 陣列欄位
- `accreditation` / `highlights` 在 Sheets 用「逗號分隔字串」填寫
- 匯入時自動 split 成 TEXT[](Postgres array)
- 不要自己加 `{}` 或引號

### 必填驗證
- 表中標 ✅ 的欄位**不能空白**,匯入會拒絕
- 其他可空,DB 存 NULL,Edge Function 已有空值保護(Phase 4 修)

### 一致性
- `schools.name` 在 schools / campuses / programs / housing 都會被引用 → **拼字必須完全一致**
- `city` 在 campuses / city_info 引用 → **同上**
- 範例:寫了 `Toronto` 就都寫 `Toronto`,不要混 `toronto` / `Toronto, ON`

### 幣別建議用 ISO code
- `CAD` / `USD` / `GBP` / `AUD` / `EUR` / `NZD` / `IEP`(愛爾蘭) / `MTL`(馬爾他)
- 不要寫 `$` / `CA$` / `£` 等符號

### 不確定的欄位
- 缺資料就留空白,**不要瞎填**
- 顧問才知道哪些欄位對「打動學生」最重要

---

## 8. 給 Claude 的訊號

填好後,在 chat 跟我說:

```
資料齊了,在 [Google Sheets URL / 下載成 CSV 上傳路徑]
```

或:

```
schools / campuses 那兩張表先匯入,其他下次
```

我會:
1. 確認 schema 已套用(Phase 14a)
2. 寫匯入腳本(Node.js + supabase-js,讀 CSV → 解析 → batch insert)
3. 跑匯入並回報筆數
4. 跑驗證 SQL(無 NULL FK、country/currency 都有值)
5. 更新 Edge Function 讀新欄位(`country` 顯示在 hero、`currency` 顯示在學費/住宿)
6. 重新 deploy generate-page v24
7. 你前台測試一個多國家比較頁(例如 ILAC Toronto vs Kaplan London)
8. 視覺、幣別、城市資訊都正確 → Phase 14c 完成 → 正式封測

---

## 修訂歷史

| 日期 | 變更 |
|---|---|
| 2026-06-01 | Phase 14b 初版 |
| 2026-06-01 | Phase 15a 同步:schools 加 4 欄(class_size_typical / class_size_max / strengths / suitable_for)、programs 加 2 欄(entry_level / outcome_level) |
