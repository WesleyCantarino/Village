const express = require('express');
const router = express.Router();
const db = require('../database');
const engine = require('../game/engine');
const CONFIG = require('../game/config');

function processBuildQueue(villageId) {
  const now = Date.now();
  const queue = db.getBuildQueue(villageId);
  const completed = [];
  for (const item of queue) {
    if (item.finish_at <= now) {
      db.completeBuild(item.id, villageId, item.building_id, item.target_level);
      completed.push(item);
    }
  }
  return completed;
}

router.get('/health', (_req, res) => res.json({ ok: true }));

router.get('/config', (_req, res) => res.json(CONFIG));

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

router.post('/player/create', (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (name.length < 2) return res.status(400).json({ error: 'Nome muito curto (mínimo 2 caracteres).' });
    if (name.length > 20) return res.status(400).json({ error: 'Nome muito longo (máximo 20 caracteres).' });
    if (!/^[\w\s\-áéíóúàèìòùâêîôûãõçÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ]+$/u.test(name)) {
      return res.status(400).json({ error: 'Nome contém caracteres inválidos.' });
    }

    const result = db.createPlayer(name);
    res.json({ success: true, ...result });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Este nome já está em uso. Escolha outro.' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.post('/player/login', (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const result = db.getPlayer(name);
    if (!result) return res.status(404).json({ error: 'Jogador não encontrado.' });
    res.json({ success: true, playerId: result.player.id, villageId: result.village.id, playerName: result.player.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Village state
// ---------------------------------------------------------------------------

router.get('/village/:id', (req, res) => {
  try {
    const { id } = req.params;

    const completed = processBuildQueue(id);

    const village = db.getVillage(id);
    if (!village) return res.status(404).json({ error: 'Aldeia não encontrada.' });

    const rawBuildings = db.getBuildings(id);
    const queue = db.getBuildQueue(id);

    const resUpdate = engine.updateResources(village, rawBuildings);
    db.updateVillageResources(id, resUpdate.wood, resUpdate.clay, resUpdate.iron, resUpdate.last_resource_update);

    const hqLevel = rawBuildings.headquarters || 0;
    const buildingDetails = {};

    for (const [bid, bcfg] of Object.entries(CONFIG.BUILDINGS)) {
      const level = rawBuildings[bid] || 0;
      const nextLevel = level + 1;
      const inQueue = queue.some(q => q.building_id === bid);
      const queueItem = queue.find(q => q.building_id === bid) || null;

      const detail = {
        id: bid,
        name: bcfg.name,
        description: bcfg.description,
        icon: bcfg.icon,
        color: bcfg.color,
        category: bcfg.category,
        maxLevel: bcfg.maxLevel,
        currentLevel: level,
        inQueue,
        queueItem,
        position: bcfg.position,
        isWall: bcfg.isWall || false,
      };

      if (nextLevel <= bcfg.maxLevel) {
        detail.nextLevel = nextLevel;
        detail.nextCost = engine.calculateBuildCost(bid, nextLevel);
        detail.nextTime = engine.calculateBuildTime(bid, nextLevel, hqLevel);
        const req = engine.checkRequirements(bid, rawBuildings);
        detail.canAfford = engine.canAfford(resUpdate, detail.nextCost);
        detail.requirementsMet = req.met;
        detail.missingRequirements = req.missing;
      }

      if (bcfg.resource) {
        detail.production = engine.calculateProduction(level, bcfg.resource);
        if (nextLevel <= bcfg.maxLevel) {
          detail.nextProduction = engine.calculateProduction(nextLevel, bcfg.resource);
        }
      }

      if (bid === 'warehouse') {
        detail.storageCapacity = engine.calculateStorage(level);
        if (nextLevel <= bcfg.maxLevel) {
          detail.nextStorageCapacity = engine.calculateStorage(nextLevel);
        }
      }

      if (bid === 'farm') {
        detail.farmCapacity = engine.calculateFarmCapacity(level);
        if (nextLevel <= bcfg.maxLevel) {
          detail.nextFarmCapacity = engine.calculateFarmCapacity(nextLevel);
        }
      }

      if (bid === 'wall') {
        detail.defenseBonus = engine.getDefenseBonus(level);
        if (nextLevel <= bcfg.maxLevel) {
          detail.nextDefenseBonus = engine.getDefenseBonus(nextLevel);
        }
      }

      if (bid === 'headquarters') {
        detail.buildReduction = Math.round(level * CONFIG.HQ_BUILD_REDUCTION_PER_LEVEL * 100);
        if (nextLevel <= bcfg.maxLevel) {
          detail.nextBuildReduction = Math.round(nextLevel * CONFIG.HQ_BUILD_REDUCTION_PER_LEVEL * 100);
        }
      }

      buildingDetails[bid] = detail;
    }

    const farmLevel = rawBuildings.farm || 0;

    res.json({
      village: {
        id: village.id,
        name: village.name,
        x: village.x,
        y: village.y,
        wood: resUpdate.wood,
        clay: resUpdate.clay,
        iron: resUpdate.iron,
      },
      resources: {
        wood: resUpdate.wood,
        clay: resUpdate.clay,
        iron: resUpdate.iron,
        maxStorage: resUpdate.maxStorage,
        productions: resUpdate.productions,
        farmCapacity: engine.calculateFarmCapacity(farmLevel),
      },
      buildings: buildingDetails,
      queue,
      completedBuilds: completed,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Start building upgrade
// ---------------------------------------------------------------------------

router.post('/village/:id/build', (req, res) => {
  try {
    const { id } = req.params;
    const { buildingId } = req.body;

    if (!buildingId || !CONFIG.BUILDINGS[buildingId]) {
      return res.status(400).json({ error: 'Edificação inválida.' });
    }

    processBuildQueue(id);

    const village = db.getVillage(id);
    if (!village) return res.status(404).json({ error: 'Aldeia não encontrada.' });

    const rawBuildings = db.getBuildings(id);
    const queue = db.getBuildQueue(id);

    // Max 1 item in queue (upgrades to 2 with HQ level 5+, classic Tribal Wars rule)
    const maxQueue = (rawBuildings.headquarters || 0) >= 5 ? 2 : 1;
    if (queue.length >= maxQueue) {
      return res.status(400).json({ error: `Fila de construção cheia! (máximo ${maxQueue} obras simultâneas)` });
    }

    if (queue.some(q => q.building_id === buildingId)) {
      return res.status(400).json({ error: 'Esta edificação já está na fila de construção.' });
    }

    const bcfg = CONFIG.BUILDINGS[buildingId];
    const currentLevel = rawBuildings[buildingId] || 0;
    const targetLevel = currentLevel + 1;

    if (targetLevel > bcfg.maxLevel) {
      return res.status(400).json({ error: 'Edificação já está no nível máximo!' });
    }

    const req = engine.checkRequirements(buildingId, rawBuildings);
    if (!req.met) {
      const missing = req.missing.map(m => `${CONFIG.BUILDINGS[m.building]?.name || m.building} nível ${m.required}`).join(', ');
      return res.status(400).json({ error: `Pré-requisitos não atendidos: ${missing}` });
    }

    const resUpdate = engine.updateResources(village, rawBuildings);
    db.updateVillageResources(id, resUpdate.wood, resUpdate.clay, resUpdate.iron, resUpdate.last_resource_update);

    const cost = engine.calculateBuildCost(buildingId, targetLevel);
    if (!engine.canAfford(resUpdate, cost)) {
      return res.status(400).json({ error: 'Recursos insuficientes!' });
    }

    const hqLevel = rawBuildings.headquarters || 0;
    const buildTime = engine.calculateBuildTime(buildingId, targetLevel, hqLevel);
    const finishAt = Date.now() + buildTime * 1000;

    db.deductResources(id, cost.wood, cost.clay, cost.iron);
    db.addToQueue(id, buildingId, targetLevel, finishAt);

    res.json({
      success: true,
      message: `Construção de ${bcfg.name} nível ${targetLevel} iniciada!`,
      finishAt,
      buildTimeSeconds: buildTime,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Cancel build
// ---------------------------------------------------------------------------

router.post('/village/:id/cancel-build', (req, res) => {
  try {
    const { id } = req.params;
    const { queueId } = req.body;

    const queue = db.getBuildQueue(id);
    const item = queue.find(q => q.id === queueId);
    if (!item) return res.status(404).json({ error: 'Item não encontrado na fila.' });

    const cost = engine.calculateBuildCost(item.building_id, item.target_level);
    const refund = {
      wood: Math.floor(cost.wood * 0.75),
      clay: Math.floor(cost.clay * 0.75),
      iron: Math.floor(cost.iron * 0.75),
    };

    const database = require('../database').getDb();
    const tx = database.transaction(() => {
      database.prepare('DELETE FROM build_queue WHERE id = ?').run(queueId);
      database.prepare(
        'UPDATE villages SET wood = MIN(wood + ?, (SELECT COALESCE(MAX(level), 0) FROM buildings WHERE village_id = ? AND building_id = \'warehouse\')), clay = clay + ?, iron = iron + ? WHERE id = ?'
      );
      database.prepare(
        'UPDATE villages SET wood = wood + ?, clay = clay + ?, iron = iron + ? WHERE id = ?'
      ).run(refund.wood, refund.clay, refund.iron, id);
    });
    tx();

    res.json({ success: true, refund, message: 'Construção cancelada. 75% dos recursos devolvidos.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// World map
// ---------------------------------------------------------------------------

router.get('/map', (_req, res) => {
  try {
    res.json({ map: db.getWorldMap() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
