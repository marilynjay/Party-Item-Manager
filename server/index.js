import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { loadDb, saveDb } from './store.js';

const PORT = Number(process.env.PORT || 3001);
const PARTY_PASSWORD = process.env.PARTY_PASSWORD || '';
const AUTH_ENABLED = PARTY_PASSWORD !== ''; // no password set => open access (playtesting mode)
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-not-for-production';
const COOKIE_NAME = 'pim_session';
const PROD = process.env.NODE_ENV === 'production';

if (!AUTH_ENABLED) {
  console.warn('PARTY_PASSWORD not set — login is DISABLED. Set it to require the party password again.');
} else if (PROD && SESSION_SECRET === 'dev-secret-not-for-production') {
  console.warn('WARNING: set SESSION_SECRET to a long random string before exposing this to the internet.');
}

const MEMBER_IDS = ['yiptik', 'radish', 'tuffany', 'astrielle', 'hyrroh'];
const HOLDER_IDS = [...MEMBER_IDS, 'senchez'];

const db = loadDb();
const app = express();
app.use(express.json());

// ---- auth ----------------------------------------------------------------

const sessionToken = () =>
  crypto.createHmac('sha256', SESSION_SECRET).update('party-session-v1').digest('hex');

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isAuthed(req) {
  const tok = parseCookies(req)[COOKIE_NAME];
  if (!tok) return false;
  const expected = sessionToken();
  return (
    tok.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(expected))
  );
}

app.post('/api/login', (req, res) => {
  if (!AUTH_ENABLED) return res.json({ ok: true });
  const { password } = req.body ?? {};
  const pw = String(password ?? '');
  const ok =
    pw.length === PARTY_PASSWORD.length &&
    crypto.timingSafeEqual(Buffer.from(pw), Buffer.from(PARTY_PASSWORD));
  if (!ok) return res.status(401).json({ error: 'Wrong password' });
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${sessionToken()}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${PROD ? '; Secure' : ''}`
  );
  res.json({ ok: true });
});

app.post('/api/logout', (_req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
  res.json({ ok: true });
});

app.use('/api', (req, res, next) => {
  if (!AUTH_ENABLED || req.path === '/login') return next();
  if (!isAuthed(req)) return res.status(401).json({ error: 'Not logged in' });
  next();
});

// ---- helpers -------------------------------------------------------------

const newId = () => crypto.randomBytes(8).toString('hex');

function addLog(actor, text) {
  db.log.unshift({ id: newId(), ts: Date.now(), actor: actor || 'Someone', text });
  if (db.log.length > 500) db.log.length = 500;
}

function cleanItem(body, existing) {
  const base = existing ?? {};
  const pick = (key, fallback) => (body[key] !== undefined ? body[key] : (base[key] ?? fallback));
  const location = pick('location', 'senchez');
  if (!HOLDER_IDS.includes(location)) throw new Error('Unknown location');
  const name = String(pick('name', '')).trim();
  if (!name) throw new Error('Name is required');
  const qty = Math.max(1, Math.floor(Number(pick('qty', 1)) || 1));
  const weightRaw = pick('weight', null);
  const weight = weightRaw === null || weightRaw === '' ? null : Math.max(0, Number(weightRaw) || 0);
  return {
    name,
    type: String(pick('type', '')),
    rarity: String(pick('rarity', '')),
    qty,
    weight,
    value: String(pick('value', '')),
    magic: Boolean(pick('magic', false)),
    requiresAttunement: Boolean(pick('requiresAttunement', false)),
    attuned: Boolean(pick('attuned', false)),
    location,
    notes: String(pick('notes', '')),
  };
}

const holderName = (id) => (id === 'senchez' ? 'Senchez' : id.charAt(0).toUpperCase() + id.slice(1));

// ---- API -----------------------------------------------------------------

const fullGold = () => {
  const g = {};
  for (const id of HOLDER_IDS) g[id] = Math.max(0, Math.floor(Number(db.gold?.[id]) || 0));
  return g;
};

app.get('/api/state', (_req, res) => {
  res.json({ items: db.items, log: db.log, gold: fullGold() });
});

app.patch('/api/gold', (req, res) => {
  const { holder, gold, actor } = req.body ?? {};
  if (!HOLDER_IDS.includes(holder)) return res.status(400).json({ error: 'Unknown holder' });
  const amount = Math.max(0, Math.floor(Number(gold) || 0));
  db.gold = fullGold();
  const before = db.gold[holder];
  if (amount !== before) {
    db.gold[holder] = amount;
    const delta = amount - before;
    addLog(actor, `${delta > 0 ? 'added' : 'removed'} ${Math.abs(delta)} gp ${delta > 0 ? 'to' : 'from'} ${holderName(holder)} (now ${amount} gp)`);
    saveDb(db);
  }
  res.json({ gold: db.gold });
});

app.post('/api/items', (req, res) => {
  try {
    const now = Date.now();
    const item = { id: newId(), ...cleanItem(req.body), createdAt: now, updatedAt: now };
    db.items.push(item);
    addLog(req.body.actor, `added ${item.qty > 1 ? item.qty + ' × ' : ''}${item.name} to ${holderName(item.location)}`);
    saveDb(db);
    res.json(item);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.patch('/api/items/:id', (req, res) => {
  const item = db.items.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  try {
    const before = item.location;
    Object.assign(item, cleanItem(req.body, item), { updatedAt: Date.now() });
    if (req.body.location !== undefined && req.body.location !== before) {
      addLog(req.body.actor, `moved ${item.name} from ${holderName(before)} to ${holderName(item.location)}`);
    } else {
      addLog(req.body.actor, `edited ${item.name}`);
    }
    saveDb(db);
    res.json(item);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Move some or all of a stack; merges into a same-named stack at the target.
app.post('/api/items/:id/move', (req, res) => {
  const item = db.items.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const to = req.body.to;
  if (!HOLDER_IDS.includes(to)) return res.status(400).json({ error: 'Unknown destination' });
  if (to === item.location) return res.status(400).json({ error: 'Already there' });
  const qty = Math.max(1, Math.min(item.qty, Math.floor(Number(req.body.qty) || item.qty)));
  const from = item.location;
  const now = Date.now();

  const mergeTarget = db.items.find(
    (i) =>
      i.id !== item.id &&
      i.location === to &&
      i.name.toLowerCase() === item.name.toLowerCase() &&
      i.type === item.type &&
      i.rarity === item.rarity
  );

  if (qty === item.qty) {
    if (mergeTarget) {
      mergeTarget.qty += qty;
      mergeTarget.updatedAt = now;
      db.items = db.items.filter((i) => i.id !== item.id);
    } else {
      item.location = to;
      // Attunement doesn't travel: dropping an item in the bag ends the claim on a slot.
      item.attuned = false;
      item.updatedAt = now;
    }
  } else {
    item.qty -= qty;
    item.updatedAt = now;
    if (mergeTarget) {
      mergeTarget.qty += qty;
      mergeTarget.updatedAt = now;
    } else {
      db.items.push({ ...item, id: newId(), qty, location: to, attuned: false, createdAt: now, updatedAt: now });
    }
  }
  addLog(req.body.actor, `moved ${qty > 1 ? qty + ' × ' : ''}${item.name} from ${holderName(from)} to ${holderName(to)}`);
  saveDb(db);
  res.json({ ok: true });
});

app.delete('/api/items/:id', (req, res) => {
  const item = db.items.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  db.items = db.items.filter((i) => i.id !== req.params.id);
  addLog(req.query.actor, `removed ${item.name} from ${holderName(item.location)}`);
  saveDb(db);
  res.json({ ok: true });
});

// ---- static frontend (production) ---------------------------------------

const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => console.log(`Party Item Manager listening on http://localhost:${PORT}`));
