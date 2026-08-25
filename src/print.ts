// A printable inventory sheet.
//
// Opens in its own window rather than taking over the app: players keep
// their place, and the sheet is a plain self-contained HTML document with
// no scripts to speak of, so Print works the moment it lands. Two densities
// share one page — Normal is the collapsed plaque's information, Detailed
// adds everything the expanded card shows — and the toggle is a CSS class
// flip, so switching never re-renders or loses the scroll position.
import type { Gold, HolderId, Item } from './types';
import { CATEGORIES, PP_IN_GP, categoryLabel, categoryOf, isFood, itemIcon, parseGoldValue } from './types';
import { parseSpellLines } from './dice';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const catIndex = (c: string) => {
  const i = CATEGORIES.findIndex((x) => x.key === c);
  return i < 0 ? CATEGORIES.length : i;
};
const subIndex = (c: string, s: string) => {
  const cat = CATEGORIES.find((x) => x.key === c);
  if (!cat || !s) return 99;
  const i = cat.subtypes.indexOf(s);
  return i < 0 ? 99 : i;
};
// same order the app groups by, so the sheet reads like the screen
const byTaxonomy = (a: Item, b: Item) =>
  catIndex(a.category) - catIndex(b.category) ||
  subIndex(a.category, a.subtype) - subIndex(b.category, b.subtype) ||
  a.name.localeCompare(b.name);

const lb = (n: number) => Math.round(n * 10) / 10;
const entryDate = (at: number) =>
  new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const weightOf = (i: Item) => (i.weight ?? 0) * i.qty;

// The one-line summary under a collapsed plaque: what's poured in, else the
// written text, else the freshest journal entry, else the notes.
function previewOf(item: Item): string {
  const latest = item.entries?.length ? item.entries[item.entries.length - 1] : undefined;
  const held = item.liquid
    ? `Contains ${item.liquid.name}${item.liquid.doses > 1 ? ` (${item.liquid.doses} doses)` : ''}`
    : '';
  return held || item.content || latest?.title || latest?.text || item.notes || '';
}

// The chips along an expanded plaque, as plain text.
function tagsOf(item: Item): string[] {
  const out: string[] = [];
  const label = categoryLabel(item.category, item.subtype);
  if (label) out.push(label);
  if (item.rarity) out.push(item.rarity);
  if (item.requiresAttunement) out.push(item.attuned ? '◈ attuned' : '◇ attunement');
  const s = item.stats ?? {};
  if (s.charges !== undefined) out.push(`⚡ ${s.charges}${s.chargesMax !== undefined ? `/${s.chargesMax}` : ''}`);
  if (item.freshness !== undefined) {
    const food = isFood(item.category, item.subtype);
    out.push(
      item.freshness <= 0
        ? food ? '🤢 spoiled' : '⌛ expired'
        : `${food ? '🍏' : '⏳'} ${item.freshness} rest${item.freshness === 1 ? '' : 's'}`
    );
  }
  if (item.weight !== null) out.push(`${lb(weightOf(item))} lb`);
  // on paper a value you can't actually spend needs saying so up front —
  // nobody tallying by hand should count a diamond that's been set aside
  if (item.value) out.push(item.fungible === false ? `${item.value} 🔒` : item.value);
  return out;
}

// The detail view's label/value grid, flattened to strings.
function rowsOf(item: Item): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const s = item.stats ?? {};
  const cat = categoryOf(item.category);
  if (cat) rows.push(['Type', `${cat.emoji} ${cat.name}${item.subtype ? ' · ' + item.subtype : ''}`]);
  if (s.dmg || s.dtype || s.bonus)
    rows.push(['Damage', [s.dmg, s.dtype, s.bonus ? `+${s.bonus}` : ''].filter(Boolean).join(' ')]);
  if (s.properties) rows.push(['Properties', s.properties]);
  if (s.ac)
    rows.push(['AC', [s.ac, s.armorClass, s.stealthDis ? 'Stealth dis.' : '', s.strReq ? `Str ${s.strReq}` : ''].filter(Boolean).join(' · ')]);
  if (s.charges !== undefined || s.chargesMax !== undefined)
    rows.push([
      'Charges',
      `⚡ ${s.charges ?? '?'}${s.chargesMax !== undefined ? `/${s.chargesMax}` : ''}${s.recharge ? ` · ${s.recharge}` : ''}`,
    ]);
  if (s.heal) rows.push(['Heals', s.heal]);
  const spellMeta = [s.spell?.trim(), s.spellLevel && `${s.spellLevel} level`, s.dc].filter(Boolean).join(' · ');
  if (spellMeta) rows.push(['Spell', spellMeta]);
  if (s.capacity) rows.push(['Capacity', s.capacity]);
  if (item.liquid)
    rows.push(['Contains', `🫗 ${item.liquid.name}${item.liquid.doses > 1 ? ` · ${item.liquid.doses} doses` : ''}`]);
  if (s.language) rows.push(['Language', s.language]);
  if (s.cursed) rows.push(['💀 Cursed', s.curseText || 'Yes — someone should probably mention that.']);
  if (item.freshness !== undefined) {
    const food = isFood(item.category, item.subtype);
    const max = item.freshnessMax ?? item.freshness;
    rows.push([
      food ? 'Freshness' : 'Keeps until',
      item.freshness <= 0
        ? food ? '🤢 Spoiled — eat at your own risk' : '⌛ Expired — no longer any good'
        : `${item.freshness} of ${max} rest${max === 1 ? '' : 's'} left`,
    ]);
  }
  if (item.rarity) rows.push(['Rarity', item.rarity]);
  if (item.qty > 1) rows.push([item.subtype === 'ammunition' ? 'Ammo' : 'Quantity', String(item.qty)]);
  if (item.weight !== null)
    rows.push(['Weight', item.qty > 1 ? `${item.weight} lb each · ${lb(weightOf(item))} lb total` : `${item.weight} lb`]);
  if (item.value) rows.push(['Value', item.fungible === false ? `${item.value} · 🔒 set aside` : item.value]);
  if (item.requiresAttunement)
    rows.push(['Attunement', item.attuned ? '◈ Attuned' : '◇ Required, not attuned']);
  else if (item.magic) rows.push(['Magic', 'Yes']);
  return rows;
}

function itemHtml(item: Item): string {
  const qty = item.qty > 1 ? ` <span class="q">×${item.qty}</span>` : '';
  const spoiled = item.freshness !== undefined && item.freshness <= 0;
  const mark = spoiled ? (isFood(item.category, item.subtype) ? ' 🤢' : ' ⌛') : '';
  const preview = previewOf(item);
  const rows = rowsOf(item);
  const spells = item.stats?.spells ? parseSpellLines(item.stats.spells) : [];
  return `<article class="it">
  <div class="line">
    <span class="tick"></span>
    <span class="nm">${esc(itemIcon(item))} ${esc(item.name)}${qty}${mark}</span>
    <span class="tags">${tagsOf(item).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</span>
  </div>
  ${preview ? `<div class="prev">${esc(preview)}</div>` : ''}
  <div class="det">
    ${rows.length ? `<dl>${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
    ${item.pack?.length ? `<div class="sub"><h4>Contents · ${item.pack.length}</h4><ul>${item.pack.map((e) => `<li>${esc(e.name)}${e.qty > 1 ? ` ×${e.qty}` : ''}</li>`).join('')}</ul></div>` : ''}
    ${spells.length ? `<div class="sub"><h4>Spells</h4><ul>${spells.map((sp) => `<li>${esc(sp.name)} <span class="q">⚡${sp.cost}</span></li>`).join('')}</ul></div>` : ''}
    ${item.content ? `<div class="sub"><h4>Contents</h4><blockquote>${esc(item.content)}</blockquote></div>` : ''}
    ${item.notes ? `<p class="notes">${esc(item.notes)}</p>` : ''}
    ${item.entries?.length ? `<div class="sub"><h4>Journal · ${item.entries.length}</h4>${item.entries.map((e) => `<div class="entry"><span class="edate">${esc(entryDate(e.at))}${e.title ? ` — ${esc(e.title)}` : ''}</span>${e.text ? `<p>${esc(e.text)}</p>` : ''}${e.image ? `<p class="q">[sketch]</p>` : ''}</div>`).join('')}</div>` : ''}
  </div>
</article>`;
}

const CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0 0 40px; background: #f6f4ef; color: #16130f;
         font: 15px/1.45 "Iowan Old Style", "Palatino Linotype", Georgia, serif; }
  .sheet { max-width: 760px; margin: 0 auto; padding: 0 20px; }
  .bar { position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; gap: 8px;
         align-items: center; padding: 10px 20px; background: #16130f; color: #f6f4ef;
         font-family: system-ui, sans-serif; font-size: 13px; }
  .bar button { font: inherit; padding: 5px 12px; border-radius: 999px; cursor: pointer;
                border: 1px solid #6b6357; background: transparent; color: inherit; }
  .bar button.on { background: #f6f4ef; color: #16130f; border-color: #f6f4ef; }
  .bar .spacer { flex: 1; }
  .bar .print { background: #b08d3f; border-color: #b08d3f; color: #16130f; font-weight: 600; }
  h1 { font-size: 24px; margin: 22px 0 2px; }
  .meta { color: #6b6357; font-size: 13px; margin-bottom: 4px; }
  .purse { font-size: 14px; margin: 0 0 18px; padding-bottom: 14px; border-bottom: 2px solid #16130f; }
  h2 { font-size: 15px; letter-spacing: 0.08em; text-transform: uppercase; margin: 22px 0 6px;
       padding-bottom: 3px; border-bottom: 1px solid #b8b0a2; page-break-after: avoid; break-after: avoid; }
  h2 .n { color: #6b6357; font-weight: normal; text-transform: none; letter-spacing: 0; }
  .it { padding: 5px 0; border-bottom: 1px dotted #d6cfc2; page-break-inside: avoid; break-inside: avoid; }
  .line { display: flex; align-items: baseline; gap: 8px; }
  .tick { flex: none; width: 11px; height: 11px; border: 1px solid #8c8375; border-radius: 2px;
          transform: translateY(1px); }
  .nm { font-weight: 600; }
  .q { color: #6b6357; font-weight: normal; }
  .tags { margin-left: auto; text-align: right; color: #6b6357; font-size: 12px;
          font-family: system-ui, sans-serif; }
  .tag + .tag::before { content: " · "; }
  .prev { margin: 1px 0 0 19px; color: #6b6357; font-size: 13px; font-style: italic; }
  .det { margin: 6px 0 8px 19px; }
  .det dl { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 1px 18px; font-size: 13px; }
  .det dl > div { display: flex; gap: 6px; }
  .det dt { flex: none; min-width: 74px; color: #6b6357; margin: 0; }
  .det dd { margin: 0; }
  .sub { margin-top: 7px; }
  .sub h4 { margin: 0 0 2px; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase;
            color: #6b6357; font-weight: 600; }
  .sub ul { margin: 0; padding-left: 18px; font-size: 13px; }
  blockquote { margin: 0; padding-left: 10px; border-left: 3px solid #d6cfc2; font-style: italic;
               white-space: pre-wrap; }
  .notes { margin: 7px 0 0; font-size: 13px; white-space: pre-wrap; }
  .entry { margin-bottom: 6px; font-size: 13px; }
  .entry .edate { color: #6b6357; font-size: 12px; }
  .entry p { margin: 1px 0 0; white-space: pre-wrap; }
  .empty { color: #6b6357; font-style: italic; padding: 30px 0; }
  .foot { margin-top: 26px; padding-top: 10px; border-top: 1px solid #d6cfc2;
          color: #6b6357; font-size: 12px; }
  /* the density switch: Detailed simply reveals what Normal keeps folded */
  body.normal .det { display: none; }
  body.detailed .prev { display: none; }
  body.detailed .it { padding: 8px 0; }
  /* on paper, tighter: ink and page count are the scarce things, and nobody
     is squinting at a phone. The screen keeps the roomier spacing above. */
  @media print {
    body { background: #fff; padding: 0; font-size: 12.5px; line-height: 1.35; }
    .bar { display: none; }
    .sheet { max-width: none; padding: 0; }
    h1 { font-size: 20px; margin-top: 0; }
    h2 { font-size: 13px; margin: 13px 0 3px; }
    .purse { margin-bottom: 11px; padding-bottom: 8px; }
    .it { padding: 2.5px 0; }
    body.detailed .it { padding: 5px 0; }
    .tags, .prev, .det dl, .sub ul, .notes, .entry { font-size: 11px; }
    .det { margin: 4px 0 5px 19px; }
    @page { margin: 13mm; }
  }
`;

export interface PrintSheetInput {
  holderName: string;
  holderIcon: string;
  items: Item[];
  gold: Gold;
  platinum: Gold;
  holderId: HolderId;
  // a filter was on when they hit print — the sheet says so rather than
  // quietly handing them a short inventory
  filtered?: boolean;
}

export function sheetHtml({ holderName, holderIcon, items, gold, platinum, holderId, filtered }: PrintSheetInput): string {
  const sorted = [...items].sort(byTaxonomy);
  const groups: Array<{ label: string; items: Item[] }> = [];
  for (const cat of CATEGORIES) {
    const inCat = sorted.filter((i) => i.category === cat.key);
    if (inCat.length) groups.push({ label: `${cat.emoji} ${cat.name}`, items: inCat });
  }
  const loose = sorted.filter((i) => !CATEGORIES.some((c) => c.key === i.category));
  if (loose.length) groups.push({ label: 'Uncategorized', items: loose });

  const gp = gold[holderId] ?? 0;
  const pp = platinum[holderId] ?? 0;
  // gems mirror the purse panel exactly: treasure/gems, qty-aware, minus
  // whatever has been set aside
  const gems = sorted
    .filter((i) => i.category === 'treasure' && i.subtype === 'gems' && i.fungible !== false)
    .reduce((sum, i) => sum + (i.value ? (parseGoldValue(i.value) ?? 0) * i.qty : 0), 0);
  const purse = [
    `🟡 ${gp.toLocaleString()} gp`,
    pp > 0 ? `⚪ ${pp.toLocaleString()} pp (${(pp * PP_IN_GP).toLocaleString()} gp)` : '',
    gems > 0 ? `💎 ${gems.toLocaleString()} gp in gems` : '',
  ].filter(Boolean).join(' · ');
  const total = lb(sorted.reduce((sum, i) => sum + weightOf(i), 0));
  const stamp = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  const body = groups.length
    ? groups
        .map(
          (g) =>
            `<section><h2>${esc(g.label)} <span class="n">· ${g.items.length}${
              lb(g.items.reduce((s, i) => s + weightOf(i), 0)) > 0
                ? ` · ${lb(g.items.reduce((s, i) => s + weightOf(i), 0)).toLocaleString()} lb`
                : ''
            }</span></h2>${g.items.map(itemHtml).join('')}</section>`
        )
        .join('')
    : `<p class="empty">${filtered ? 'Nothing matches that filter.' : 'Carrying nothing at all.'}</p>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(holderName)}’s inventory</title>
<style>${CSS}</style>
</head>
<body class="normal">
<div class="bar">
  <span>View</span>
  <button type="button" id="v-normal" class="on">Normal</button>
  <button type="button" id="v-detail">Detailed</button>
  <span class="spacer"></span>
  <button type="button" class="print" id="go">🖨️ Print</button>
</div>
<div class="sheet">
  <h1>${esc(holderIcon)} ${esc(holderName)}’s inventory</h1>
  <div class="meta">${sorted.length} item${sorted.length === 1 ? '' : 's'} · ${total.toLocaleString()} lb carried · ${esc(stamp)}</div>
  <div class="purse">${esc(purse)}${filtered ? ' <span class="q">— filtered view, not the whole inventory</span>' : ''}</div>
  ${body}
  <div class="foot">Party Item Manager</div>
</div>
<script>
  var b = document.body, n = document.getElementById('v-normal'), d = document.getElementById('v-detail');
  function set(mode) {
    b.className = mode;
    n.className = mode === 'normal' ? 'on' : '';
    d.className = mode === 'detailed' ? 'on' : '';
  }
  n.onclick = function () { set('normal'); };
  d.onclick = function () { set('detailed'); };
  document.getElementById('go').onclick = function () { window.print(); };
</script>
</body></html>`;
}

// Opening has to happen inside the click that asked for it, or the browser
// treats the new window as an unsolicited popup — so callers hand us the
// window they already opened and we only fill it in.
export function writeSheet(win: Window, input: PrintSheetInput): void {
  win.document.open();
  win.document.write(sheetHtml(input));
  win.document.close();
}
