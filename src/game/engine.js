const CONFIG = require('./config');

function calculateProduction(level, resourceType) {
  if (level === 0) return CONFIG.BASE_PRODUCTION[resourceType] * 0.1;
  return CONFIG.BASE_PRODUCTION[resourceType] * Math.pow(CONFIG.PRODUCTION_FACTOR, level - 1);
}

function calculateStorage(warehouseLevel) {
  if (warehouseLevel === 0) return CONFIG.BASE_STORAGE;
  return Math.floor(CONFIG.WAREHOUSE_BASE * Math.pow(CONFIG.STORAGE_FACTOR, warehouseLevel - 1));
}

function calculateFarmCapacity(farmLevel) {
  if (farmLevel === 0) return CONFIG.BASE_FARM_CAPACITY;
  return Math.floor(CONFIG.BASE_FARM_CAPACITY * Math.pow(CONFIG.FARM_CAPACITY_FACTOR, farmLevel - 1));
}

function calculateBuildCost(buildingId, targetLevel) {
  const b = CONFIG.BUILDINGS[buildingId];
  const exp = targetLevel - 1;
  return {
    wood: Math.ceil(b.baseCost.wood * Math.pow(b.costFactor, exp)),
    clay: Math.ceil(b.baseCost.clay * Math.pow(b.costFactor, exp)),
    iron: Math.ceil(b.baseCost.iron * Math.pow(b.costFactor, exp)),
  };
}

function calculateBuildTime(buildingId, targetLevel, hqLevel) {
  const b = CONFIG.BUILDINGS[buildingId];
  const exp = targetLevel - 1;
  const rawTime = b.baseTime * Math.pow(b.timeFactor, exp);
  const hqReduction = Math.max(0.1, 1 - hqLevel * CONFIG.HQ_BUILD_REDUCTION_PER_LEVEL);
  return Math.max(5, Math.ceil(rawTime * hqReduction / CONFIG.GAME_SPEED));
}

function updateResources(village, buildings) {
  const now = Date.now();
  const elapsedHours = (now - village.last_resource_update) / 3600000;

  const woodLevel = buildings.timberCamp || 0;
  const clayLevel = buildings.clayPit || 0;
  const ironLevel = buildings.ironMine || 0;
  const warehouseLevel = buildings.warehouse || 0;

  const woodProd = calculateProduction(woodLevel, 'wood');
  const clayProd = calculateProduction(clayLevel, 'clay');
  const ironProd = calculateProduction(ironLevel, 'iron');
  const maxStorage = calculateStorage(warehouseLevel);

  return {
    wood: Math.min(village.wood + woodProd * elapsedHours, maxStorage),
    clay: Math.min(village.clay + clayProd * elapsedHours, maxStorage),
    iron: Math.min(village.iron + ironProd * elapsedHours, maxStorage),
    last_resource_update: now,
    maxStorage,
    productions: { wood: woodProd, clay: clayProd, iron: ironProd },
  };
}

function checkRequirements(buildingId, buildings) {
  const b = CONFIG.BUILDINGS[buildingId];
  if (!b.requirements) return { met: true, missing: [] };

  const missing = [];
  for (const [req, minLevel] of Object.entries(b.requirements)) {
    const current = buildings[req] || 0;
    if (current < minLevel) {
      missing.push({ building: req, required: minLevel, current });
    }
  }
  return { met: missing.length === 0, missing };
}

function canAfford(resources, cost) {
  return resources.wood >= cost.wood &&
    resources.clay >= cost.clay &&
    resources.iron >= cost.iron;
}

function getDefenseBonus(wallLevel) {
  return Math.round((Math.pow(1.037, wallLevel) - 1) * 100);
}

module.exports = {
  calculateProduction,
  calculateStorage,
  calculateFarmCapacity,
  calculateBuildCost,
  calculateBuildTime,
  updateResources,
  checkRequirements,
  canAfford,
  getDefenseBonus,
};
