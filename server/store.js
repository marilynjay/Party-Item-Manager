// Tiny JSON-file store. One server process is the only writer, so a
// load-once / write-atomically approach is plenty for a party of five.
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = { items: [], log: [], gold: {} };

export function loadDb() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const db = JSON.parse(raw);
    return { items: db.items ?? [], log: db.log ?? [], gold: db.gold ?? {} };
  } catch {
    return structuredClone(EMPTY);
  }
}

export function saveDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE); // atomic on POSIX
}
