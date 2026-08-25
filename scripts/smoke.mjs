// End-to-end smoke test: drives the built app in a real browser through the
// flows the party actually uses. Run it before pushing anything structural,
// and especially when `src/api.ts` changes — it is the safety net for the
// eventual move off localStorage onto a server.
//
//   npm run smoke            (builds first, then drives dist/)
//
// Needs Chromium. CI or a different machine can point at its own binary:
//   CHROMIUM=/path/to/chrome npm run smoke
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('../dist/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    let file = join(ROOT, path === '/' ? 'index.html' : path);
    let body;
    try {
      body = await readFile(file);
    } catch {
      file = join(ROOT, 'index.html'); // single-page app
      body = await readFile(file);
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const step = (name) => console.log(`\n▸ ${name}`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const crashes = [];
page.on('pageerror', (e) => crashes.push(String(e)));
const db = () => page.evaluate(() => JSON.parse(localStorage.getItem('pim-db') ?? '{}'));
const items = async () => (await db()).items ?? [];
const named = async (n) => (await items()).find((i) => i.name === n);

try {
  step('Cold start');
  await page.goto(base);
  await page.waitForSelector('.gold-line');
  check('starts empty — no demo loot', (await items()).length === 0, `${(await items()).length} items`);
  check('party gold starts at zero', (await page.$eval('.gold-amount', (e) => e.textContent)).startsWith('0'));

  step('Adding items');
  await page.selectOption('.actor-picker select', { label: 'Radish' });
  await page.click('.add-big');
  await page.fill('.add-name', 'Longsword');
  await page.waitForSelector('.suggest-row');
  await page.click('.suggest-row:has-text("Longsword")');
  await page.selectOption('.add-location', { label: '→ Radish' });
  await page.click('.add-form button[type="submit"]');
  await page.waitForTimeout(500);
  const sword = await named('Longsword');
  check('catalogue pick lands with its data', !!sword && sword.subtype === 'weapon', sword && `${sword.category}/${sword.subtype}`);

  await page.click('.add-big');
  await page.fill('.add-name', 'Rope of Suspicion');
  await page.keyboard.press('Escape');
  await page.selectOption('.add-location', { label: '→ Radish' });
  await page.click('.add-form button[type="submit"]');
  await page.waitForTimeout(500);
  check('a bare typed name works too', !!(await named('Rope of Suspicion')));

  step('Moving between holders');
  await page.click('.tab[data-scope="radish"]');
  await page.click('.item-row:has-text("Rope of Suspicion") .item-send');
  await page.click('.send-holder:has-text("Senchez")');
  await page.waitForTimeout(700);
  check('item moves to another holder', (await named('Rope of Suspicion'))?.location === 'senchez');

  step('Money');
  await page.click('.tab[data-scope="radish"]');
  await page.click('.purse-line');
  await page.click('.purse-actions button:has-text("Add")');
  await page.fill('.purse-editing .coin-field:nth-of-type(1) input', '40');
  await page.fill('.purse-editing .coin-field:nth-of-type(2) input', '3');
  await page.click('.purse-editing button[type="submit"]');
  await page.waitForTimeout(500);
  let d = await db();
  check('gold and platinum add together', d.gold.radish === 40 && d.platinum.radish === 3, `${d.gold.radish} gp / ${d.platinum.radish} pp`);

  await page.click('.purse-actions button:has-text("Spend")');
  await page.fill('.purse-editing .coin-field:nth-of-type(1) input', '500');
  await page.click('.purse-editing button[type="submit"]');
  await page.waitForTimeout(400);
  d = await db();
  const err = await page.$eval('.error-banner', (e) => e.textContent).catch(() => '');
  check('overdraw is refused, purse untouched', d.gold.radish === 40 && err.includes('only has'));
  check("platinum doesn't break into gold", err.includes('doesn’t break into gold'));
  await page.click('.error-banner');

  step('Selling');
  await page.click('.item-row:has-text("Longsword") .item-main');
  await page.click('.item-row:has-text("Longsword") .item-trash');
  await page.click('.dispose-options button:has-text("Sold")');
  await page.fill('.dispose-form input[type="number"]', '15');
  await page.click('.dispose-form button[type="submit"]');
  await page.waitForTimeout(900);
  d = await db();
  check('sold item leaves and pays its holder', !(await named('Longsword')) && d.gold.radish === 55, `${d.gold.radish} gp`);

  step('Long rest — recharge, perishables, supper');
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('pim-db'));
    const b = { rarity: '', value: '', magic: true, requiresAttunement: false, attuned: false, notes: '', createdAt: 1, updatedAt: 1, weight: 1 };
    s.items.push({ ...b, id: 'smoke-wand', name: 'Smoke Wand', category: 'arcana', subtype: 'wand', location: 'radish', qty: 1, stats: { charges: 1, chargesMax: 7, recharge: '1d6+1 at dawn' } });
    s.items.push({ ...b, id: 'smoke-lamp', name: 'Smoke Lamp', category: 'other', subtype: '', location: 'radish', qty: 1, stats: { charges: 0, chargesMax: 3 } });
    s.items.push({ ...b, id: 'smoke-stew', name: 'Smoke Stew', category: 'consumable', subtype: 'food & drink', location: 'radish', qty: 2, freshness: 1, freshnessMax: 4 });
    s.items.push({ ...b, id: 'smoke-rations', name: 'Smoke Rations', category: 'consumable', subtype: 'food & drink', location: 'radish', qty: 3 });
    localStorage.setItem('pim-db', JSON.stringify(s));
  });
  await page.reload();
  await page.click('.tab[data-scope="radish"]');
  await page.click('.heading-rest');
  await page.waitForSelector('.rest-modal');
  let text = await page.$eval('.rest-modal', (e) => e.textContent);
  check('preview explains what will happen', text.includes('A long rest here will') && text.includes('Smoke Lamp'));
  check('preview announces spoilage', text.includes('Spoil overnight: Smoke Stew'));
  await page.click('.rest-modal button:has-text("Take a long rest")');
  await page.waitForSelector('.rest-roll-row input');
  check('dice recharges wait for a roll', (await page.$eval('.rest-roll-row input', (e) => e.value)) === '');
  await page.click('.rest-roll-row .charge-btn:has-text("Roll")');
  await page.waitForTimeout(1400);
  const rolled = await page.$eval('.rest-roll-row input', (e) => e.value);
  check('in-app roll fills the total', Number(rolled) >= 2 && Number(rolled) <= 7, rolled);
  await page.click('.torch-actions button');
  await page.waitForTimeout(900);
  const wand = await named('Smoke Wand');
  const lamp = await named('Smoke Lamp');
  check('rolled recharge applied', wand.stats.charges === Math.min(7, 1 + Number(rolled)), `${wand.stats.charges}/7`);
  check('auto recharge filled', lamp.stats.charges === 3);
  check('perishable spoiled on schedule', (await named('Smoke Stew')).freshness === 0);
  text = await page.$eval('.rest-modal', (e) => e.textContent);
  check('supper prompt appears', text.includes('should eat and drink'));
  await page.click('.rest-roll-row:has-text("Smoke Rations") .charge-btn:has-text("Eat one")');
  await page.waitForTimeout(600);
  check('eating at camp consumes one', (await named('Smoke Rations')).qty === 2);
  await page.click('.rest-roll-row:has-text("Smoke Stew") .charge-btn:has-text("Toss")');
  await page.waitForTimeout(700);
  check('one-tap toss clears spoiled food', !(await named('Smoke Stew')));
  await page.click('.rest-modal button:has-text("Good morning")');

  step('Spell compendium');
  await page.click('.tab[data-scope="home"]');
  await page.click('.spell-book-btn');
  await page.waitForSelector('.spell-comp-modal .cat-row', { timeout: 10000 });
  check('all 319 SRD spells load', (await page.$$('.spell-comp-modal .cat-row')).length === 319);
  await page.fill('.spell-comp-modal .cat-search', 'fireball');
  await page.click('.spell-comp-modal .cat-row:has-text("Fireball")');
  await page.waitForSelector('.spell-card');
  check('a spell card opens with its text', (await page.$eval('.spell-card', (e) => e.textContent)).includes('8d6'));
  await page.click('.spell-card .link-button');
  await page.click('.spell-comp-modal > .modal-head .link-button:has-text("✕")');

  step('Change log');
  await page.click('.tab[data-scope="log"]');
  await page.waitForSelector('.log-entry');
  const before = (await page.$$('.log-entry')).length;
  await page.fill('.log-search', 'sold');
  const after = (await page.$$('.log-entry')).length;
  check('log records the session and filters', before > 5 && after < before, `${before} entries, ${after} matching "sold"`);

  step('Passing the torch');
  await page.click('.tab[data-scope="radish"]');
  await page.click('.heading-name');
  await page.click('.torch-open');
  await page.fill('.torch-form .rename-label input', 'Thistle');
  await page.click('.torch-choice label:has-text("Senchez") input');
  await page.click('.torch-confirm input');
  await page.click('.torch-actions button[type="submit"]');
  await page.waitForTimeout(900);
  d = await db();
  check('slot takes the new name', d.names.radish === 'Thistle');
  check('belongings swept to the bag', !d.items.some((i) => i.location === 'radish'));
  check('coins swept too', (d.gold.radish ?? 0) === 0 && d.gold.senchez > 0, `bag holds ${d.gold.senchez} gp`);
  check('eulogy written to the log', d.log[0].text.includes('🕯️') && d.log[0].text.includes('Thistle'));

  step('Health');
  check('no uncaught page errors', crashes.length === 0, crashes.join(' | '));
} catch (e) {
  console.log('\n✗ smoke test threw:', e.message);
  failures++;
} finally {
  await browser.close();
  server.close();
}

console.log(failures === 0 ? '\n✅ smoke test passed\n' : `\n❌ ${failures} check(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
