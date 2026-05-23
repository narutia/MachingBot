const fs = require("fs");
const path = require("path");

let pgPool = null;
let storageReady = false;
let storageDescription = null;

const DATA_FILE =
  process.env.DATA_FILE ||
  (process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "data.json")
    : path.join(__dirname, "data.json"));

function createEmptyData() {
  return {
    scrims: [],
    results: [],
    teams: {},
    teamProfiles: {},
    pendingSelections: {},
    guildSettings: {}
  };
}

function normalizeData(data) {
  const normalized = data && typeof data === "object" ? data : createEmptyData();

  if (!normalized.scrims) normalized.scrims = [];
  if (!normalized.results) normalized.results = [];
  if (!normalized.teams) normalized.teams = {};
  if (!normalized.teamProfiles) normalized.teamProfiles = {};
  if (!normalized.pendingSelections) normalized.pendingSelections = {};
  if (!normalized.guildSettings) normalized.guildSettings = {};

  return normalized;
}

function loadFileData() {
  if (!fs.existsSync(DATA_FILE)) return createEmptyData();
  return normalizeData(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")));
}

function saveFileData(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(normalizeData(data), null, 2));
}

async function initPostgres() {
  const { Pool } = require("pg");
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
  });

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS bot_state (
      id integer PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const existing = await pgPool.query("SELECT id FROM bot_state WHERE id = 1");

  if (existing.rowCount === 0) {
    const initialData = loadFileData();
    await pgPool.query(
      "INSERT INTO bot_state (id, data, updated_at) VALUES (1, $1::jsonb, now())",
      [JSON.stringify(initialData)]
    );
  }

  storageDescription = "PostgreSQL";
}

async function initStorage() {
  if (storageReady) return;

  if (process.env.DATABASE_URL) {
    await initPostgres();
  } else {
    storageDescription = DATA_FILE;
  }

  storageReady = true;
}

async function loadData() {
  await initStorage();

  if (!pgPool) {
    return loadFileData();
  }

  const result = await pgPool.query("SELECT data FROM bot_state WHERE id = 1");
  if (result.rowCount === 0) return createEmptyData();
  return normalizeData(result.rows[0].data);
}

async function saveData(data) {
  await initStorage();

  if (!pgPool) {
    saveFileData(data);
    return;
  }

  await pgPool.query(
    `
      INSERT INTO bot_state (id, data, updated_at)
      VALUES (1, $1::jsonb, now())
      ON CONFLICT (id)
      DO UPDATE SET data = EXCLUDED.data, updated_at = now()
    `,
    [JSON.stringify(normalizeData(data))]
  );
}

function getStorageDescription() {
  return storageDescription || DATA_FILE;
}

module.exports = {
  initStorage,
  loadData,
  saveData,
  getStorageDescription
};
