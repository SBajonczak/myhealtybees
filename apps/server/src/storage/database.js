const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_FILE = process.env.DATABASE_FILE
  ? path.resolve(process.env.DATABASE_FILE)
  : path.join(DATA_DIR, 'database.json');

const defaultState = () => ({
  users: [],
  hives: [],
  activities: []
});

function ensureDataFile() {
  const targetDir = path.dirname(DB_FILE);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultState(), null, 2), 'utf8');
  }
}

async function readDatabase() {
  ensureDataFile();
  const raw = await fs.promises.readFile(DB_FILE, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || !parsed) {
      throw new Error('Database malformed');
    }
    return Object.assign(defaultState(), parsed);
  } catch (error) {
    // If the database file is corrupted we back it up and start fresh to avoid breaking the app.
    const backupFile = `${DB_FILE}.${Date.now()}.bak`;
    await fs.promises.copyFile(DB_FILE, backupFile);
    const fresh = defaultState();
    await fs.promises.writeFile(DB_FILE, JSON.stringify(fresh, null, 2), 'utf8');
    return fresh;
  }
}

async function writeDatabase(data) {
  ensureDataFile();
  const safeData = Object.assign(defaultState(), data);
  await fs.promises.writeFile(DB_FILE, JSON.stringify(safeData, null, 2), 'utf8');
}

module.exports = {
  readDatabase,
  writeDatabase,
  defaultState,
  DB_FILE
};
