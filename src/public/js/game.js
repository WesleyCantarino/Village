// =============================================================================
// Village Wars - Frontend Game Logic
// =============================================================================

const API = '/api';
let villageId = null;
let playerId = null;
let config = null;
let villageData = null;
let selectedBuilding = null;
let updateInterval = null;

// Initialize game
async function initGame() {
  villageId = localStorage.getItem('villageId');
  playerId = localStorage.getItem('playerId');
  
  if (!villageId || !playerId) {
    window.location.href = '/';
    return;
  }

  document.getElementById('playerName').textContent = localStorage.getItem('playerName') || 'Jogador';

  try {
    // Load game config
    const configRes = await fetch(`${API}/config`);
    config = await configRes.json();
    
    // Load village data
    await loadVillage();
    
    // Start auto-update
    updateInterval = setInterval(loadVillage, 5000);
    
    document.getElementById('loading').style.display = 'none';
  } catch (err) {
    console.error('Error initializing game:', err);
    alert('Erro ao carregar o jogo. Redirecionando...');
    window.location.href = '/';
  }
}

async function loadVillage() {
  try {
    const res = await fetch(`${API}/village/${villageId}`);
    if (!res.ok) throw new Error('Failed to load village');
    
    villageData = await res.json();
    renderVillage();
  } catch (err) {
    console.error('Error loading village:', err);
  }
}

function renderVillage() {
  if (!villageData) return;
  
  // Update village name
  document.getElementById('villageName').textContent = villageData.village.name;
  
  // Update resources
  const r = villageData.resources;
  document.getElementById('woodValue').textContent = Math.floor(r.wood);
  document.getElementById('clayValue').textContent = Math.floor(r.clay);
  document.getElementById('ironValue').textContent = Math.floor(r.iron);
  
  // Update production rates
  const prod = villageData.resources.productions || { wood: 0, clay: 0, iron: 0 };
  document.getElementById('woodRate').textContent = `+${Math.floor(prod.wood)}/h`;
  document.getElementById('clayRate').textContent = `+${Math.floor(prod.clay)}/h`;
  document.getElementById('ironRate').textContent = `+${Math.floor(prod.iron)}/h`;
  
  // Render building list
  renderBuildingList();
  
  // Render village grid
  renderVillageGrid();
  
  // Render build queue
  renderBuildQueue();
  
  // Update building info panel if something is selected
  if (selectedBuilding) {
    updateBuildingInfo(selectedBuilding);
  }
}

function renderBuildingList() {
  const list = document.getElementById('buildingList');
  list.innerHTML = '';
  
  const buildings = villageData.buildings;
  
  for (const [buildingId, buildingConfig] of Object.entries(config.BUILDINGS)) {
    const level = buildings[buildingId] || 0;
    const card = document.createElement('div');
    card.className = `building-card${selectedBuilding === buildingId ? ' selected' : ''}`;
    card.innerHTML = `
      <div class="building-name">${buildingConfig.icon} ${buildingConfig.name}</div>
      <div class="building-level">Nível: <span>${level}</span></div>
    `;
    card.onclick = () => selectBuilding(buildingId);
    list.appendChild(card);
  }
}

function renderVillageGrid() {
  const grid = document.getElementById('villageGrid');
  grid.innerHTML = '';
  
  const buildings = villageData.buildings;
  const buildingMap = config.BUILDINGS;
  
  // Create 20 plots (5x4 grid)
  for (let i = 0; i < 20; i++) {
    const plot = document.createElement('div');
    plot.className = 'village-plot';
    
    // Find building for this position
    let buildingAtPosition = null;
    let buildingId = null;
    
    for (const [bid, bcfg] of Object.entries(buildingMap)) {
      if (bcfg.position && bcfg.position.gridIndex === i) {
        buildingAtPosition = bcfg;
        buildingId = bid;
        break;
      }
    }
    
    if (buildingAtPosition && buildings[buildingId] > 0) {
      plot.className = 'village-plot built';
      plot.innerHTML = `
        <div class="plot-building">
          <span class="plot-building-icon">${buildingAtPosition.icon}</span>
          <span class="plot-building-name">${buildingAtPosition.name}</span>
          <span class="plot-building-level">N${buildings[buildingId]}</span>
        </div>
      `;
      plot.onclick = () => selectBuilding(buildingId);
    }
    
    grid.appendChild(plot);
  }
}

function renderBuildQueue() {
  const queueEl = document.getElementById('buildQueue');
  const queue = villageData.buildQueue || [];
  
  if (queue.length === 0) {
    queueEl.innerHTML = '<p class="queue-empty">Nenhuma construção em andamento</p>';
    return;
  }
  
  queueEl.innerHTML = '';
  
  for (const item of queue) {
    const building = config.BUILDINGS[item.building_id];
    const div = document.createElement('div');
    div.className = 'queue-item';
    
    const finishTime = item.finish_at;
    const now = Date.now();
    const remaining = Math.max(0, finishTime - now);
    
    div.innerHTML = `
      <div class="queue-item-name">${building.icon} ${building.name} → N${item.target_level}</div>
      <div class="queue-item-timer" data-finish="${finishTime}">Calculando...</div>
    `;
    queueEl.appendChild(div);
  }
  
  // Update timers
  updateQueueTimers();
}

function updateQueueTimers() {
  const timers = document.querySelectorAll('.queue-item-timer');
  const now = Date.now();
  
  timers.forEach(timer => {
    const finish = parseInt(timer.dataset.finish);
    const remaining = Math.max(0, finish - now);
    
    if (remaining > 0) {
      const seconds = Math.floor(remaining / 1000);
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      timer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    } else {
      timer.textContent = 'Concluindo...';
    }
  });
  
  // Update every second
  setTimeout(updateQueueTimers, 1000);
}

function selectBuilding(buildingId) {
  selectedBuilding = buildingId;
  renderBuildingList();
  updateBuildingInfo(buildingId);
}

function updateBuildingInfo(buildingId) {
  const building = config.BUILDINGS[buildingId];
  const currentLevel = villageData.buildings[buildingId] || 0;
  const nextLevel = currentLevel + 1;
  
  if (currentLevel >= building.maxLevel) {
    document.getElementById('buildingInfo').innerHTML = `
      <div class="building-info">
        <h3>${building.icon} ${building.name}</h3>
        <p style="color: var(--text-muted); text-align: center; padding: 20px;">
          Nível máximo atingido (${currentLevel})
        </p>
      </div>
    `;
    return;
  }
  
  // Calculate costs
  const costs = calculateBuildCost(buildingId, nextLevel);
  const buildTime = calculateBuildTime(buildingId, nextLevel, villageData.buildings.headquarters || 0);
  
  const canBuild = canAfford(costs);
  
  document.getElementById('buildingInfo').innerHTML = `
    <div class="building-info">
      <h3>${building.icon} ${building.name}</h3>
      <div class="building-stats">
        <p>Nível atual: <strong>${currentLevel}</strong></p>
        <p>Próximo nível: <strong>${nextLevel}</strong></p>
        <p style="margin-top: 10px;">${building.description}</p>
      </div>
      
      <div class="cost-section">
        <h4>Custos para nível ${nextLevel}:</h4>
        <div class="cost-item wood">
          <span>🪵 Madeira</span>
          <span>${costs.wood}</span>
        </div>
        <div class="cost-item clay">
          <span>🧱 Argila</span>
          <span>${costs.clay}</span>
        </div>
        <div class="cost-item iron">
          <span>⛓️ Ferro</span>
          <span>${costs.iron}</span>
        </div>
      </div>
      
      <div class="build-time">
        ⏱️ Tempo: ${formatTime(buildTime)}
      </div>
      
      <button class="build-btn" ${canBuild ? '' : 'disabled'} onclick="build('${buildingId}')">
        ${canBuild ? 'Construir' : 'Recursos insuficientes'}
      </button>
    </div>
  `;
}

function calculateBuildCost(buildingId, targetLevel) {
  const b = config.BUILDINGS[buildingId];
  const exp = targetLevel - 1;
  return {
    wood: Math.ceil(b.baseCost.wood * Math.pow(b.costFactor, exp)),
    clay: Math.ceil(b.baseCost.clay * Math.pow(b.costFactor, exp)),
    iron: Math.ceil(b.baseCost.iron * Math.pow(b.costFactor, exp)),
  };
}

function calculateBuildTime(buildingId, targetLevel, hqLevel) {
  const b = config.BUILDINGS[buildingId];
  const exp = targetLevel - 1;
  const rawTime = b.baseTime * Math.pow(b.timeFactor, exp);
  const hqReduction = Math.max(0.1, 1 - hqLevel * config.HQ_BUILD_REDUCTION_PER_LEVEL);
  return Math.max(5, Math.ceil(rawTime * hqReduction / config.GAME_SPEED));
}

function canAfford(costs) {
  const r = villageData.resources;
  return r.wood >= costs.wood && r.clay >= costs.clay && r.iron >= costs.iron;
}

function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

async function build(buildingId) {
  const building = config.BUILDINGS[buildingId];
  const currentLevel = villageData.buildings[buildingId] || 0;
  const nextLevel = currentLevel + 1;
  
  const costs = calculateBuildCost(buildingId, nextLevel);
  
  if (!canAfford(costs)) {
    alert('Recursos insuficientes!');
    return;
  }
  
  try {
    const res = await fetch(`${API}/village/${villageId}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buildingId: buildingId, targetLevel: nextLevel })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      alert(data.error || 'Erro ao construir');
      return;
    }
    
    // Reload village data
    await loadVillage();
    
    alert(`${building.name} nível ${nextLevel} em construção!`);
  } catch (err) {
    console.error('Build error:', err);
    alert('Erro ao iniciar construção');
  }
}

function logout() {
  localStorage.removeItem('playerId');
  localStorage.removeItem('villageId');
  localStorage.removeItem('playerName');
  window.location.href = '/';
}

// Start the game when page loads
window.onload = initGame;