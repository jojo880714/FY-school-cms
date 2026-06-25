/**
 * Card 元件 — LP 校區卡片 ABCD 4 variant
 *
 * 移植自 jojo 給的 LP_card_variants.jsx,拿掉 demo 切換 UI + hardcode 匯率。
 * variant 由 props 控制(對應 generate-page EF 的 cardVariant 參數)。
 *
 * **用途**:CreatePage 內 admin 預覽用(近似預覽,不要求跟 EF 輸出 pixel sync)。
 * EF server-side render 才是公開 LP 的 source-of-truth。
 *
 * 匯率:`defaultRates` from `src/lib/quotation`(不 hardcode 在本檔)。
 *
 * Phase 2 Batch 1 B1-3 落地。
 */
import { defaultRates } from '../../lib/quotation';

// 匯率 lookup:LP source 用 simple symbol key('£', '$', '€' 等),
// quotation defaultRates 用 ISO key(GBP/USD/EUR/AUD/CAD/NZD/TWD)。
// 提供 symbol → quotation key 對映,fallback NT$30。
const SYMBOL_TO_ISO: Record<string, keyof typeof defaultRates> = {
  '£': 'GBP', '$': 'USD', '€': 'EUR',
  'A$': 'AUD', 'C$': 'CAD', 'NZ$': 'NZD',
};
const rate = (sym: string): number => {
  const iso = SYMBOL_TO_ISO[sym];
  return iso ? defaultRates[iso] : 30;
};

function ageBadgeClass(age: string): string {
  if (age.startsWith('16')) return 'age-16';
  if (age.startsWith('18')) return 'age-18';
  return 'age-30plus';
}
function accommTypeLabel(t: string): string {
  return ({ home: '寄宿家庭', dorm: '學生宿舍', apt: '公寓', hotel: '飯店', hostel: '青旅' } as Record<string, string>)[t] || t;
}
function rangeToTwd(range: string, cur: string): string {
  const nums = (range.match(/[0-9,]+/g) || []).map((s) => parseInt(s.replace(/,/g, ''), 10));
  if (nums.length < 2) return '';
  const r = rate(cur);
  return `≈ NT$${Math.round(nums[0] * r).toLocaleString()}–${Math.round(nums[1] * r).toLocaleString()}`;
}

/**
 * Campus card data(對應 LP_card_variants.jsx 的 c 結構)
 * Admin 預覽用,EF server-side render 用自己的 per-school 結構(不互通)。
 */
export interface CardCampusData {
  name: string;
  region: string;
  flag: string;
  cur: string;
  age: string;
  ageMin: number;
  minDur: string;
  classSize: string;
  personas: string[];
  features: string[];
  moodTag: string;
  moodDesc: string;
  moodScene: string;
  pills: string[];
  courseFrom: number;
  accommFrom: number;
  costLevel: number;
  courseRange: string;
  accommRange: string;
  visaTags: string[];
  courseTypes: string[];
  specialCourses: string[];
  accommTypes: string[];
}

/**
 * 預覽用 placeholder data(真實 EP Canary Wharf,LP source 同步)。
 * Admin 預覽切 ABCD variant 時用這個資料當 demo,不依賴 CreatePage 已選 campus。
 */
export const PLACEHOLDER_CAMPUS: CardCampusData = {
  name: '倫敦 Canary Wharf',
  region: '英國',
  flag: '🇬🇧',
  cur: '£',
  age: '30+',
  ageMin: 30,
  minDur: '1 週',
  classSize: '15 人',
  personas: ['30歲以上', '職場英語', '商業認證'],
  features: ['金融核心地帶,職場沉浸強', 'DMI 國際商業管理認證課程', '30+ 獨立班,成熟學習環境'],
  moodTag: '職場沉浸・金融核心',
  moodDesc: '在 Canary Wharf 金融區學英語,下課即步入真實的全球商業世界。',
  moodScene: '下課走出教室,進的是 HSBC 和摩根大通的地盤',
  pills: ['金融區', '兩線地鐵', '職場英語', '30+ 限定'],
  courseFrom: 300,
  accommFrom: 270,
  costLevel: 75,
  courseRange: '£300–510',
  accommRange: '£270–460',
  visaTags: ['訪客簽 6個月', 'YMS'],
  courseTypes: ['標準 20hr', '密集 27hr', '超密集 40hr', '1-on-1'],
  specialCourses: ['商業管理證書', '數位行銷認證', '帶薪飯店實習'],
  accommTypes: ['home', 'dorm'],
};

interface CardProps {
  variant: 'A' | 'B' | 'C' | 'D';
  c: CardCampusData;
}

export function Card({ variant, c }: CardProps) {
  const ageWarning =
    c.ageMin >= 30 ? (
      <div className="lp-card-age-banner">
        <span>⚠️</span>
        <span>此校區僅開放 <strong>{c.age}</strong> 學員就讀</span>
      </div>
    ) : null;
  const flagLine = (
    <div className="lp-card-region">{c.flag} {c.region}・EP {c.name}</div>
  );
  const ageBadge = <span className={`lp-card-badge-age ${ageBadgeClass(c.age)}`}>{c.age}</span>;

  // A — 學員適配 + 數據 + 特色
  if (variant === 'A') {
    return (
      <div className="lp-card">
        {ageWarning}
        <div className="lp-card-personas">
          {c.personas.map((p, i) => (
            <span key={i} className="lp-card-persona-tag">{p}</span>
          ))}
        </div>
        <div>
          <div className="lp-card-city">{c.name}</div>
          {flagLine}
        </div>
        <div className="lp-card-divider" />
        <div className="lp-card-stat-row">
          <div className="lp-card-stat-box">
            <div className="lp-card-stat-label">最低年齡</div>
            <div className="lp-card-stat-val">{c.age}</div>
          </div>
          <div className="lp-card-stat-box">
            <div className="lp-card-stat-label">週費起</div>
            <div className="lp-card-stat-val">{c.cur}{c.courseFrom}</div>
            <div className="lp-card-fee-twd">≈ NT${Math.round(c.courseFrom * rate(c.cur)).toLocaleString()}</div>
          </div>
          <div className="lp-card-stat-box">
            <div className="lp-card-stat-label">最短修讀</div>
            <div className="lp-card-stat-val">{c.minDur}</div>
          </div>
        </div>
        <div className="lp-card-divider" />
        <div className="lp-card-feat-list">
          {c.features.map((f, i) => (
            <div key={i} className="lp-card-feat-item">{f}</div>
          ))}
        </div>
      </div>
    );
  }

  // B — 費用導向
  if (variant === 'B') {
    const levelLabel = c.costLevel >= 70 ? '高' : c.costLevel >= 50 ? '中高' : c.costLevel >= 35 ? '中' : '低';
    const estLow = (c.courseFrom + c.accommFrom) * 4;
    const estHigh = Math.round(estLow * 1.25);
    const twdLow = Math.round((estLow * rate(c.cur)) / 10000);
    const twdHigh = Math.round((estHigh * rate(c.cur)) / 10000);
    return (
      <div className="lp-card">
        {ageWarning}
        <div className="lp-card-head">
          <div>
            <div className="lp-card-city">{c.name}</div>
            {flagLine}
          </div>
          {ageBadge}
        </div>
        <div className="lp-card-divider" />
        <div className="lp-card-fee-grid">
          <div>
            <div className="lp-card-fee-label">課程費(週)</div>
            <div className="lp-card-fee-val">{c.courseRange}</div>
            <div className="lp-card-fee-twd">{rangeToTwd(c.courseRange, c.cur)}</div>
          </div>
          <div>
            <div className="lp-card-fee-label">住宿費(週)</div>
            <div className="lp-card-fee-val">{c.accommRange}</div>
            <div className="lp-card-fee-twd">{rangeToTwd(c.accommRange, c.cur)}</div>
          </div>
        </div>
        <div>
          <div className="lp-card-fee-bar">
            <div className="lp-card-fee-bar-fill" style={{ width: `${c.costLevel}%` }} />
          </div>
          <div className="lp-card-fee-level">
            <span>費用水位(相對其他校區)</span>
            <span>{levelLabel}</span>
          </div>
        </div>
        <div className="lp-card-fee-estimate">
          4 週估算:{c.cur}{estLow.toLocaleString()}–{estHigh.toLocaleString()}
          <br />
          約台幣 {twdLow}–{twdHigh} 萬
        </div>
      </div>
    );
  }

  // C — 氛圍 / 情感導向
  if (variant === 'C') {
    return (
      <div className="lp-card">
        {ageWarning}
        <div className="lp-card-mood-tag">{c.moodTag}</div>
        <div>
          <div className="lp-card-city">{c.name}</div>
          {flagLine}
        </div>
        <div className="lp-card-mood-desc">{c.moodDesc}</div>
        <div className="lp-card-icon-pills">
          {c.pills.map((p, i) => (
            <span key={i} className="lp-card-icon-pill">{p}</span>
          ))}
        </div>
        <div className="lp-card-quote-box">「{c.moodScene}」</div>
        <div className="lp-card-foot">週費起 {c.cur}{c.courseFrom}・最低年齡 {c.age}</div>
      </div>
    );
  }

  // D — 資訊密集
  return (
    <div className="lp-card">
      {ageWarning}
      <div className="lp-card-head">
        <div>
          <div className="lp-card-city">{c.name} {c.flag}</div>
          {flagLine}
        </div>
        {ageBadge}
      </div>
      <div className="lp-card-divider" />
      <div className="lp-card-kv-grid">
        <div className="lp-card-kv">
          <div className="lp-card-kv-l">最短修讀</div>
          <div className="lp-card-kv-v">{c.minDur}</div>
        </div>
        <div className="lp-card-kv">
          <div className="lp-card-kv-l">最大班級</div>
          <div className="lp-card-kv-v">{c.classSize}</div>
        </div>
        <div className="lp-card-kv">
          <div className="lp-card-kv-l">課程週費起</div>
          <div className="lp-card-kv-v">{c.cur}{c.courseFrom}</div>
          <div className="lp-card-fee-twd">≈ NT${Math.round(c.courseFrom * rate(c.cur)).toLocaleString()}</div>
        </div>
        <div className="lp-card-kv">
          <div className="lp-card-kv-l">住宿週費起</div>
          <div className="lp-card-kv-v">{c.cur}{c.accommFrom}</div>
          <div className="lp-card-fee-twd">≈ NT${Math.round(c.accommFrom * rate(c.cur)).toLocaleString()}</div>
        </div>
      </div>
      <div>
        <div className="lp-card-tag-line">簽證選項</div>
        <div className="lp-card-row-tags">
          {c.visaTags.map((v, i) => (
            <span key={i} className="lp-card-mini-tag">{v}</span>
          ))}
        </div>
      </div>
      <div>
        <div className="lp-card-tag-line">課程類型</div>
        <div className="lp-card-row-tags">
          {c.courseTypes.map((t, i) => (
            <span key={i} className="lp-card-mini-tag">{t}</span>
          ))}
          {c.specialCourses.slice(0, 2).map((t, i) => (
            <span key={`s${i}`} className="lp-card-mini-tag lp-card-mini-tag-special">{t}</span>
          ))}
        </div>
      </div>
      <div>
        <div className="lp-card-tag-line">住宿選項</div>
        <div className="lp-card-row-tags">
          {c.accommTypes.map((t, i) => (
            <span key={i} className="lp-card-mini-tag">{accommTypeLabel(t)}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Card 元件 inline CSS — scoped 樣式,不依賴 admin 頁是否 import tokens.css。
 * 玫瑰金 token hardcode(對齊 src/styles/tokens.css 一致)。
 * 在 CreatePage 預覽區一次 inject 即可(class 名 lp-card-* 避開 admin 衝突)。
 */
export const CARD_CSS = `
.lp-card {
  background: #FFFFFF;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 14px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: border-color .2s ease, transform .2s ease;
  font-family: 'Noto Sans TC', system-ui, -apple-system, sans-serif;
  color: #1A1A1E;
}
.lp-card:hover { border-color: rgba(0,0,0,0.14); transform: translateY(-1px); }
.lp-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.lp-card-city { font-weight: 600; font-size: 28px; line-height: 1.1; color: #1A1A1E; }
.lp-card-region { font-size: 12px; color: #6A6A70; margin-top: 4px; letter-spacing: 0.04em; }
.lp-card-divider { height: 1px; background: rgba(0,0,0,0.08); margin: 2px 0; }
.lp-card-badge-age {
  display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 999px;
  font-family: 'DM Mono', ui-monospace, monospace; font-size: 11px; font-weight: 500;
}
.lp-card-badge-age.age-16 { background: #E5F4E8; color: #2A6B3A; }
.lp-card-badge-age.age-18 { background: #E1ECF7; color: #1D4F87; }
.lp-card-badge-age.age-30plus { background: #F0F0EE; color: #1A1A1E; border: 1px solid rgba(0,0,0,0.14); font-weight: 700; padding: 3px 10px; font-size: 12px; }
.lp-card-age-banner {
  display: flex; align-items: center; gap: 7px;
  background: #F0F0EE; border: 1px solid rgba(0,0,0,0.14); border-radius: 6px;
  padding: 7px 12px; font-size: 12px; color: #1A1A1E; font-weight: 500; line-height: 1.4;
}

/* A */
.lp-card-personas { display: flex; flex-wrap: wrap; gap: 6px; }
.lp-card-persona-tag { background: #F0F0EE; color: #1A1A1E; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 500; }
.lp-card-stat-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 4px 0; }
.lp-card-stat-box { background: #F0F0EE; border-radius: 10px; padding: 10px 8px; text-align: center; }
.lp-card-stat-label { font-size: 10px; color: #6A6A70; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 4px; }
.lp-card-stat-val { font-family: 'DM Mono', ui-monospace, monospace; font-size: 14px; font-weight: 500; color: #1A1A1E; }
.lp-card-feat-list { display: flex; flex-direction: column; gap: 8px; }
.lp-card-feat-item { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; color: #3A3A40; line-height: 1.5; }
.lp-card-feat-item::before { content: '✓'; color: #6A6A70; font-weight: 700; flex-shrink: 0; margin-top: 1px; font-size: 13px; }

/* B */
.lp-card-fee-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 4px 0; }
.lp-card-fee-label { font-size: 11px; color: #6A6A70; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
.lp-card-fee-val { font-family: 'DM Mono', ui-monospace, monospace; font-size: 22px; font-weight: 500; color: #1A1A1E; }
.lp-card-fee-twd { font-family: 'DM Mono', ui-monospace, monospace; font-size: 11px; color: #9A9A9F; font-weight: 400; margin-top: 2px; }
.lp-card-fee-bar { height: 6px; background: #F0F0EE; border-radius: 999px; overflow: hidden; margin: 2px 0; }
.lp-card-fee-bar-fill { height: 100%; border-radius: 999px; background: #1A1A1E; }
.lp-card-fee-level { font-size: 11px; color: #6A6A70; display: flex; justify-content: space-between; margin-top: 4px; }
.lp-card-fee-estimate { background: #F0F0EE; border-radius: 10px; padding: 10px 12px; font-size: 13px; color: #3A3A40; font-family: 'DM Mono', ui-monospace, monospace; line-height: 1.5; }

/* C */
.lp-card-mood-tag { font-size: 15px; color: #6A6A70; letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; }
.lp-card-mood-desc { font-size: 13px; color: #6A6A70; line-height: 1.6; }
.lp-card-icon-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.lp-card-icon-pill { background: #F0F0EE; color: #3A3A40; padding: 5px 10px; border-radius: 999px; font-size: 11px; }
.lp-card-quote-box {
  background: #F0F0EE; border-left: 3px solid rgba(0,0,0,0.14); padding: 12px 14px;
  border-radius: 0 10px 10px 0; font-size: 15px; color: #3A3A40; line-height: 1.5;
}
.lp-card-foot { font-size: 12px; color: #6A6A70; font-family: 'DM Mono', ui-monospace, monospace; margin-top: auto; padding-top: 8px; border-top: 1px solid rgba(0,0,0,0.08); }

/* D */
.lp-card-kv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; }
.lp-card-kv { font-size: 12px; }
.lp-card-kv-l { color: #6A6A70; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.04em; font-size: 10px; }
.lp-card-kv-v { font-family: 'DM Mono', ui-monospace, monospace; color: #1A1A1E; font-weight: 500; }
.lp-card-row-tags { display: flex; flex-wrap: wrap; gap: 5px; }
.lp-card-tag-line { font-size: 11px; color: #6A6A70; margin-bottom: 4px; letter-spacing: 0.04em; }
.lp-card-mini-tag { background: #F0F0EE; color: #3A3A40; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-family: 'DM Mono', ui-monospace, monospace; }
.lp-card-mini-tag-special { color: #1A1A1E; font-weight: 600; }
`;
