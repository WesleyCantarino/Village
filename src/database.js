const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const CONFIG = require('./game/config');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/village.db');
let db = null;
let SQL = null;

async function initDb() {
  if (db) return db;
  
  // Locate the wasm file
  const wasmPaths = [
    path.join(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm'),
    path.join(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm'),
    path.join(__dirname, '../../../node_modules/sql.js/dist/sql-wasm.wasm'),
  ];
  
  let wasmBinary = null;
  for (const p of wasmPaths) {
    if (fs.existsSync(p)) {
      wasmBinary = fs.readFileSync(p);
      break;
    }
  }
  
  SQL = await initSqlJs({
    wasmBinary: wasmBinary,
  });
  
  // Load existing database or create new one
  let data = null;
  if (fs.existsSync(DB_PATH)) {
    data = fs.readFileSync(DB_PATH);
  }
  
  db = new SQL.Database(data);
  
  initSchema();
  return db;
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS villages (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      name TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      wood REAL NOT NULL DEFAULT 500,
      clay REAL NOT NULL DEFAULT 500,
      iron REAL NOT NULL DEFAULT 500,
      last_resource_update INTEGER NOT NULL,
      FOREIGN KEY (player_id) REFERENCES players(id)
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS buildings (
      village_id TEXT NOT NULL,
      building_id TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (village_id, building_id),
      FOREIGN KEY (village_id) REFERENCES villages(id)
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS build_queue (
      id TEXT PRIMARY KEY,
      village_id TEXT NOT NULL,
      building_id TEXT NOT NULL,
      target_level INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      finish_at INTEGER NOT NULL,
      FOREIGN KEY (village_id) REFERENCES villages(id)
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS world_map (
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      village_id TEXT,
      PRIMARY KEY (x, y)
    )
  `);

  const count = db.exec('SELECT COUNT(*) as c FROM world_map')[0]?.values[0][0] || 0;
  if (count === 0) {
    for (let x = 0; x < 20; x++) {
      for (let y = 0; y < 20; y++) {
        db.run('INSERT INTO world_map (x, y) VALUES (?, ?)', [x, y]);
      }
    }
  }
  saveDb();
}

function createPlayer(name) {
  const database = getDb();
  
  const spotResult = database.exec(
    'SELECT x, y FROM world_map WHERE village_id IS NULL ORDER BY RANDOM() LIMIT 1'
  );
  if (!spotResult.length || !spotResult[0].values.length) {
    throw new Error('Mapa lotado! Não há mais espaço para novas aldeias.');
  }
  const spot = { x: spotResult[0].values[0][0], y: spotResult[0].values[0][1] };

  const playerId = uuidv4();
  const villageId = uuidv4();
  const now = Date.now();

  database.run(
    'INSERT INTO players (id, name, created_at) VALUES (?, ?, ?)',
    [playerId, name, now]
  );

  database.run(
    'INSERT INTO villages (id, player_id, name, x, y, wood, clay, iron, last_resource_update) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [villageId, playerId, `Aldeia de ${name}`, spot.x, spot.y,
     CONFIG.STARTING_RESOURCES.wood, CONFIG.STARTING_RESOURCES.clay,
     CONFIG.STARTING_RESOURCES.iron, now]
  );

  for (const bid of Object.keys(CONFIG.BUILDINGS)) {
    const startLevel = (bid === 'headquarters' || bid === 'timberCamp' || bid === 'clayPit' || bid === 'ironMine' || bid === 'farm' || bid === 'warehouse') ? 1 : 0;
    database.run(
      'INSERT INTO buildings (village_id, building_id, level) VALUES (?, ?, ?)',
      [villageId, bid, startLevel]
    );
  }

  database.run(
    'UPDATE world_map SET village_id = ? WHERE x = ? AND y = ?',
    [villageId, spot.x, spot.y]
  );
  
  saveDb();
  return { playerId, villageId };
}

function getPlayer(name) {
  const database = getDb();
  const result = database.exec('SELECT * FROM players WHERE name = ?', [name]);
  if (!result.length || !result[0].values.length) return null;
  
  const columns = result[0].columns;
  const player = result[0].values[0].reduce((obj, val, i) => {
    obj[columns[i]] = val;
    return obj;
  }, {});
  
  const villageResult = database.exec('SELECT * FROM villages WHERE player_id = ?', [player.id]);
  if (!villageResult.length || !villageResult[0].values.length) return null;
  
  const villageColumns = villageResult[0].columns;
  const village = villageResult[0].values[0].reduce((obj, val, i) => {
    obj[villageColumns[i]] = val;
    return obj;
  }, {});
  
  return { player, village };
}

function getVillage(villageId) {
  const result = getDb().exec('SELECT * FROM villages WHERE id = ?', [villageId]);
  if (!result.length || !result[0].values.length) return null;
  
  const columns = result[0].columns;
  return result[0].values[0].reduce((obj, val, i) => {
    obj[columns[i]] = val;
    return obj;
  }, {});
}

function getBuildings(villageId) {
  const result = getDb().exec(
    'SELECT building_id, level FROM buildings WHERE village_id = ?',
    [villageId]
  );
  const map = {};
  if (result.length) {
    for (const row of result[0].values) {
      map[row[0]] = row[1];
    }
  }
  return map;
}

function getBuildQueue(villageId) {
  const result = getDb().exec(
    'SELECT * FROM build_queue WHERE village_id = ? ORDER BY finish_at ASC',
    [villageId]
  );
  if (!result.length) return [];
  
  const columns = result[0].columns;
  return result[0].values.map(row => {
    return columns.reduce((obj, val, i) => {
      obj[columns[i]] = val;
      return obj;
    }, {});
  });
}

function updateVillageResources(villageId, wood, clay, iron, ts) {
  getDb().run(
    'UPDATE villages SET wood = ?, clay = ?, iron = ?, last_resource_update = ? WHERE id = ?',
    [wood, clay, iron, ts, villageId]
  );
  saveDb();
}

function deductResources(villageId, wood, clay, iron) {
  getDb().run(
    'UPDATE villages SET wood = wood - ?, clay = clay - ?, iron = iron - ? WHERE id = ?',
    [wood, clay, iron, villageId]
  );
  saveDb();
}

function addToQueue(villageId, buildingId, targetLevel, finishAt) {
  const id = uuidv4();
  const now = Date.now();
  getDb().run(
    'INSERT INTO build_queue (id, village_id, building_id, target_level, started_at, finish_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, villageId, buildingId, targetLevel, now, finishAt]
  );
  saveDb();
  return id;
}

function completeBuild(queueId, villageId, buildingId, level) {
  getDb().run('DELETE FROM build_queue WHERE id = ?', [queueId]);
  getDb().run(
    'UPDATE buildings SET level = ? WHERE village_id = ? AND building_id = ?',
    [level, villageId, buildingId]
  );
  saveDb();
}

function getWorldMap() {
  const result = getDb().exec(`
    SELECT m.x, m.y, v.id AS village_id, v.name AS village_name, p.name AS player_name
    FROM world_map m
    LEFT JOIN villages v ON m.village_id = v.id
    LEFT JOIN players p ON v.player_id = p.id
    ORDER BY m.y, m.x
  `);
  if (!result.length) return [];
  
  const columns = result[0].columns;
  return result[0].values.map(row => {
    return columns.reduce((obj, val, i) => {
      obj[columns[i]] = val;
      return obj;
    }, {});
  });
}

module.exports = {
  initDb,
  getDb,
  createPlayer,
  getPlayer,
  getVillage,
  getBuildings,
  getBuildQueue,
  updateVillageResources,
  deductResources,
  addToQueue,
  completeBuild,
  getWorldMap,
};
