const API = '/api';
let villageId = null, playerId = null, config = null, villageData = null;
let selectedBuilding = null;
let mapState = { scale: 1, x: 0, y: 0, dragging: false, sx: 0, sy: 0 };
let buildingHitAreas = [];
let particles = [], animFrame = null, lastTs = 0, lastSpawnTs = 0;

// ── Init ──────────────────────────────────────────────────────────────────────
async function initGame() {
  villageId = localStorage.getItem('villageId');
  playerId  = localStorage.getItem('playerId');
  if (!villageId || !playerId) { window.location.href = '/'; return; }
  document.getElementById('playerName').textContent = localStorage.getItem('playerName') || 'Jogador';
  try {
    config = await (await fetch(`${API}/config`)).json();
    await loadVillage();
    setInterval(loadVillage, 5000);
    setupMapControls();
    startQueueTimers();
    startAnimLoop();
    document.getElementById('loadingOverlay').style.display = 'none';
  } catch (e) {
    console.error(e);
    alert('Erro ao carregar o jogo.');
    window.location.href = '/';
  }
}

async function loadVillage() {
  try {
    const res = await fetch(`${API}/village/${villageId}`);
    if (!res.ok) throw new Error();
    villageData = await res.json();
    updateHeader();
    updateQueueBar();
    renderBuildingsGrid();
  } catch (e) { console.error(e); }
}

// ── Header ────────────────────────────────────────────────────────────────────
function updateHeader() {
  if (!villageData) return;
  const v = villageData.village, r = villageData.resources, p = r.productions || {};
  document.getElementById('villageName').textContent = v.name;
  if (v.x != null) document.getElementById('coordBadge').textContent = `(${v.x}|${v.y})`;
  setRes('wood', r.wood, p.wood || 0, r.maxStorage);
  setRes('clay', r.clay, p.clay || 0, r.maxStorage);
  setRes('iron', r.iron, p.iron || 0, r.maxStorage);
}
function setRes(t, amt, prod, max) {
  const a = Math.floor(amt);
  const el = document.getElementById(`res-${t}`); if (!el) return;
  el.textContent = a.toLocaleString('pt-BR');
  el.className = 'resource-amount' + (max && a >= max ? ' at-cap' : max && a >= max * 0.9 ? ' near-cap' : '');
  const em = document.getElementById(`res-${t}-max`); if (em && max) em.textContent = `/${Math.floor(max).toLocaleString('pt-BR')}`;
  const ep = document.getElementById(`res-${t}-prod`); if (ep) ep.textContent = `+${Math.floor(prod)}/h`;
}

// ── Queue bar ─────────────────────────────────────────────────────────────────
function updateQueueBar() {
  const bar = document.getElementById('build-queue-bar');
  const q   = villageData?.queue || [];
  if (!q.length) { bar.className = ''; bar.innerHTML = ''; return; }
  bar.className = 'has-items';
  bar.innerHTML = q.map(item => {
    const b = config.BUILDINGS[item.building_id];
    return `<div class="queue-item">
      <span class="queue-item-icon">${b.icon}</span>
      <span class="queue-item-name">${b.name} → N${item.target_level}</span>
      <span class="queue-item-timer" data-finish="${item.finish_at}">...</span>
    </div>`;
  }).join('');
}

// ── Canvas: main draw loop ────────────────────────────────────────────────────
function drawMap() {
  const canvas = document.getElementById('villageCanvas');
  if (!canvas || !villageData) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.setTransform(mapState.scale, 0, 0, mapState.scale, mapState.x, mapState.y);
  drawTerrain(ctx, W, H);
  drawRoads(ctx, W, H);
  drawTrees(ctx, W, H);
  drawWall(ctx, W, H);
  drawAllBuildings(ctx, W, H);
  drawParticles(ctx);
  ctx.restore();
}

// ── Terrain ───────────────────────────────────────────────────────────────────
function drawTerrain(ctx, W, H) {
  const g = ctx.createRadialGradient(W*.45, H*.45, 0, W*.5, H*.5, Math.max(W,H)*.62);
  g.addColorStop(0,   '#5aaa3a');
  g.addColorStop(0.35,'#429028');
  g.addColorStop(0.7, '#2e6a18');
  g.addColorStop(1,   '#1a3c0c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // Subtle texture blobs
  ctx.globalAlpha = 0.04;
  for (let i = 0; i < 60; i++) {
    const px = ((i * 137 + 31) % 100) / 100 * W;
    const py = ((i * 89  + 17) % 100) / 100 * H;
    ctx.fillStyle = i % 3 === 0 ? '#000' : '#90ee60';
    ctx.beginPath(); ctx.ellipse(px, py, 16 + i%5*3, 9 + i%3*2, i*.7, 0, Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Central plaza (dirt circle)
  const pg = ctx.createRadialGradient(W*.5, H*.5, 0, W*.5, H*.5, W*.14);
  pg.addColorStop(0,   'rgba(120,80,20,0.55)');
  pg.addColorStop(0.7, 'rgba(110,70,15,0.30)');
  pg.addColorStop(1,   'rgba(100,60,10,0)');
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.ellipse(W*.5, H*.5, W*.14, H*.13, 0, 0, Math.PI*2); ctx.fill();
}

// ── Roads ─────────────────────────────────────────────────────────────────────
function drawRoads(ctx, W, H) {
  const cx = W*.5, cy = H*.5;
  const positions = villageData?.buildings
    ? Object.values(villageData.buildings)
        .filter(d => d.position)
        .map(d => [W * parseFloat(d.position.left)/100, H * parseFloat(d.position.top)/100])
    : [];
  ctx.lineCap = 'round';
  for (const [ex, ey] of positions) {
    ctx.strokeStyle = 'rgba(15,8,0,0.45)'; ctx.lineWidth = 16;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(ex,ey); ctx.stroke();
    ctx.strokeStyle = '#6e4c16'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(ex,ey); ctx.stroke();
    ctx.strokeStyle = '#9a6e28'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(ex,ey); ctx.stroke();
  }
}

// ── Trees ─────────────────────────────────────────────────────────────────────
const TREE_PTS = [
  [.05,.10],[.09,.28],[.05,.52],[.04,.74],[.07,.90],
  [.93,.10],[.91,.28],[.95,.52],[.96,.74],[.93,.90],
  [.26,.04],[.50,.03],[.74,.04],[.26,.95],[.50,.97],[.74,.95],
  [.13,.14],[.87,.14],[.13,.86],[.87,.86],
  [.33,.36],[.67,.36],[.33,.64],[.67,.64],
  [.20,.69],[.80,.69],[.20,.31],[.80,.31],
];
function drawTrees(ctx, W, H) {
  for (let i = 0; i < TREE_PTS.length; i++) {
    const [px,py] = TREE_PTS[i];
    drawTree(ctx, W*px, H*py, 11 + (i*7+3)%5*2);
  }
}
function drawTree(ctx, x, y, s) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(x, y+s*.3, s*.52, s*.13, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#3d2208';
  ctx.fillRect(x-s*.09, y-s*.1, s*.18, s*.38);
  [[0.50,'#0b2c06'],[0.42,'#185a0e'],[0.32,'#259118'],[0.18,'rgba(70,180,40,.38)']].forEach(([r,c],i) => {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(x - s*.06*(i%2), y - s*(.22+i*.08), s*r, 0, Math.PI*2); ctx.fill();
  });
}

// ── Wall ──────────────────────────────────────────────────────────────────────
function drawWall(ctx, W, H) {
  const wl = villageData?.buildings?.wall?.currentLevel ?? 0;
  if (!wl) return;
  const cx = W*.5, cy = H*.5;
  const rx = W*.41, ry = H*.41;
  const t  = 9 + Math.floor(wl / 3);

  // Outer shadow
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = t + 10;
  ctx.beginPath(); ctx.ellipse(cx+4, cy+4, rx, ry, 0, 0, Math.PI*2); ctx.stroke();

  // Outer wall fill (stone gradient)
  ctx.strokeStyle = '#4a4038'; ctx.lineWidth = t + 4;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2); ctx.stroke();
  ctx.strokeStyle = '#6a5848'; ctx.lineWidth = t;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2); ctx.stroke();

  // Stone block pattern
  const n = Math.max(24, 18 + wl * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const mx = cx + rx * Math.cos(a), my = cy + ry * Math.sin(a);
    // alternate stone shading
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.save(); ctx.translate(mx, my); ctx.rotate(a);
    ctx.strokeRect(-t/2+1, -t/2+1, t-2, t-2);
    ctx.restore();
  }

  // Battlements (merlons)
  const nb = Math.floor(16 + wl * .8);
  ctx.fillStyle = '#6a5848';
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2;
    const mx = cx + rx * Math.cos(a), my = cy + ry * Math.sin(a);
    ctx.save(); ctx.translate(mx, my); ctx.rotate(a);
    ctx.fillRect(-5, -t/2 - 7, 10, 8);
    ctx.fillStyle = '#4a3828'; ctx.fillRect(-4, -t/2 - 6, 8, 6);
    ctx.fillStyle = '#6a5848';
    ctx.restore();
  }

  // Towers at 4 cardinal points
  const towerPositions = [0, Math.PI/2, Math.PI, Math.PI*3/2];
  for (const ta of towerPositions) {
    const tx = cx + rx * Math.cos(ta), ty = cy + ry * Math.sin(ta);
    drawWallTower(ctx, tx, ty, 11 + Math.floor(wl/4));
  }

  // Inner wall highlight
  ctx.strokeStyle = 'rgba(200,180,140,0.18)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx-t/2, ry-t/2, 0, 0, Math.PI*2); ctx.stroke();
}

function drawWallTower(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(x+3, y+4, r*.9, r*.4, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#5a4838';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#7a6450';
  ctx.beginPath(); ctx.arc(x, y, r*.75, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#2a1e14';
  ctx.beginPath(); ctx.arc(x, y, r*.35, 0, Math.PI*2); ctx.fill();
  // Battlements around tower
  for (let i = 0; i < 5; i++) {
    const a = (i/5)*Math.PI*2;
    const bx = x + Math.cos(a)*r*.9, by = y + Math.sin(a)*r*.9;
    ctx.fillStyle = '#5a4838';
    ctx.fillRect(bx-3, by-3, 6, 6);
  }
}

// ── All buildings ─────────────────────────────────────────────────────────────
function drawAllBuildings(ctx, W, H) {
  if (!villageData?.buildings) return;
  buildingHitAreas = [];
  const queueIds = new Set((villageData.queue || []).map(q => q.building_id));

  const list = Object.entries(villageData.buildings)
    .filter(([id, d]) => id !== 'wall' && d.position && DRAW_FN[id])
    .map(([id, d]) => ({
      id, d,
      cx: W * parseFloat(d.position.left) / 100,
      cy: H * parseFloat(d.position.top)  / 100,
    }))
    .sort((a, b) => a.cy - b.cy);

  for (const { id, d, cx, cy } of list) {
    const sel  = selectedBuilding === id;
    const lv   = d.currentLevel;
    const busy = queueIds.has(id);
    ctx.save();
    ctx.globalAlpha = lv > 0 ? 1 : 0.28;
    if (sel && lv > 0) { ctx.shadowColor = '#d4af37'; ctx.shadowBlur = 22; }
    DRAW_FN[id](ctx, cx, cy, lv, sel, lastTs);
    if (busy && lv > 0) drawConstructionOverlay(ctx, cx, cy, lv);
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    ctx.restore();
    const hw = 52 + lv * .6;
    buildingHitAreas.push({ id, cx, cy, hw, hh: hw * 1.2 });
    drawLevelBadge(ctx, cx + hw * .5, cy - hw, lv);
    drawBuildingLabel(ctx, cx, cy + hw * .35, d.name, sel);
  }
}

function drawConstructionOverlay(ctx, cx, cy, lv) {
  const s = scl(lv);
  const pulse = 0.4 + 0.3 * Math.sin(lastTs / 300);
  ctx.fillStyle = `rgba(255,160,30,${pulse})`;
  ctx.font = `bold ${14*s}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🔨', cx, cy - 60 * s - 12);
}

// ── 3D drawing helpers ────────────────────────────────────────────────────────
function scl(lv) { return Math.min(1 + Math.max(0, lv - 1) * 0.022, 1.55); }

function box3D(ctx, cx, cy, w, h, d, fr, sd, tp) {
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(cx + d*.5, cy + 5, w*.52 + d*.3, 7, 0, 0, Math.PI*2); ctx.fill();
  // right side
  ctx.fillStyle = sd;
  ctx.beginPath();
  ctx.moveTo(cx+w/2, cy);        ctx.lineTo(cx+w/2+d, cy-d*.5);
  ctx.lineTo(cx+w/2+d, cy-h-d*.5); ctx.lineTo(cx+w/2, cy-h);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = .8; ctx.stroke();
  // front face
  ctx.fillStyle = fr;
  ctx.fillRect(cx-w/2, cy-h, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = .8; ctx.strokeRect(cx-w/2, cy-h, w, h);
  // top face
  ctx.fillStyle = tp;
  ctx.beginPath();
  ctx.moveTo(cx-w/2, cy-h); ctx.lineTo(cx+w/2, cy-h);
  ctx.lineTo(cx+w/2+d, cy-h-d*.5); ctx.lineTo(cx-w/2+d, cy-h-d*.5);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = .8; ctx.stroke();
}

function gableRoof(ctx, cx, cy, w, d, rh, fr, sd) {
  const px = cx + d*.4, py = cy - rh;
  // front slope
  ctx.fillStyle = fr;
  ctx.beginPath(); ctx.moveTo(cx-w/2, cy); ctx.lineTo(cx+w/2, cy); ctx.lineTo(px, py); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1; ctx.stroke();
  // right slope
  ctx.fillStyle = sd;
  ctx.beginPath();
  ctx.moveTo(cx+w/2, cy); ctx.lineTo(px, py);
  ctx.lineTo(px+d, py-d*.45); ctx.lineTo(cx+w/2+d, cy-d*.5);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // ridge line
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px+d, py-d*.45); ctx.stroke();
}

function litWindow(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(255,200,60,0.75)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x + w/2 - .5, y, 1, h);
  ctx.fillRect(x, y + h/2 - .5, w, 1);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = .6; ctx.strokeRect(x, y, w, h);
}

function archDoor(ctx, cx, cy, w, h, color) {
  ctx.fillStyle = color || '#2a1a0a';
  ctx.beginPath();
  ctx.arc(cx, cy - h + w/2, w/2, Math.PI, 0);
  ctx.lineTo(cx + w/2, cy);
  ctx.lineTo(cx - w/2, cy);
  ctx.closePath(); ctx.fill();
  // door planks
  ctx.strokeStyle = 'rgba(80,40,10,0.5)'; ctx.lineWidth = 1;
  for (let i = -Math.floor(w/4); i <= Math.floor(w/4); i += Math.max(2, Math.floor(w/4))) {
    ctx.beginPath(); ctx.moveTo(cx + i, cy - h + w/2); ctx.lineTo(cx + i, cy); ctx.stroke();
  }
}

function battlement(ctx, cx, cy, w, d, n, fr, sd) {
  const bw = w / (n * 2 - 1), bh = 7;
  for (let i = 0; i < n; i++) {
    const bx = cx - w/2 + i * bw * 2;
    box3D(ctx, bx + bw/2, cy, bw, bh, d, fr, sd, fr);
  }
}

function drawLevelBadge(ctx, x, y, lv) {
  if (lv === 0) return;
  ctx.fillStyle = 'rgba(0,0,0,.85)'; ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#d4af37';          ctx.beginPath(); ctx.arc(x, y,  9, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#1a0d00'; ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lv, x, y);
}

function drawBuildingLabel(ctx, cx, cy, name, sel) {
  const nm = name.length > 13 ? name.slice(0, 12) + '…' : name;
  ctx.font = '10px sans-serif';
  const tw = ctx.measureText(nm).width;
  const lw = tw + 12, lx = cx - lw/2;
  ctx.fillStyle = sel ? 'rgba(212,175,55,0.88)' : 'rgba(0,0,0,0.75)';
  roundRect(ctx, lx, cy, lw, 17, 3); ctx.fill();
  ctx.fillStyle = sel ? '#1a0d00' : '#f5e6c0';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(nm, cx, cy + 8.5);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y); ctx.closePath();
}

function drawFlag(ctx, x, y, ts) {
  ctx.strokeStyle = '#7a5a28'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y + 14); ctx.lineTo(x, y); ctx.stroke();
  const t = ts / 700;
  const fw = 15, fh = 10;
  ctx.fillStyle = '#cc1818';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x+fw/3, y - 2 + Math.sin(t)*2.5, x+fw*2/3, y + Math.sin(t+1)*2, x+fw, y+fh/2);
  ctx.bezierCurveTo(x+fw*2/3, y+fh/2+Math.sin(t+.5)*2, x+fw/3, y+fh+Math.sin(t+1.5)*2, x, y+fh);
  ctx.closePath(); ctx.fill();
}

function barrel(ctx, x, y, s) {
  ctx.fillStyle = '#7a4a18';
  ctx.beginPath(); ctx.ellipse(x, y-s*1.5, s*.7, s*.35, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#8b5a22';
  ctx.fillRect(x-s*.65, y-s*1.5, s*1.3, s*1.5);
  ctx.fillStyle = '#7a4a18';
  ctx.beginPath(); ctx.ellipse(x, y, s*.7, s*.35, 0, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#4a2808'; ctx.lineWidth = 1.5;
  for (let i = 0; i <= 3; i++) {
    ctx.beginPath(); ctx.ellipse(x, y - s*.5*i, s*.7 - i*.3, s*.3, 0, 0, Math.PI*2); ctx.stroke();
  }
}

// ── Individual building renderers ─────────────────────────────────────────────
const DRAW_FN = {
  headquarters: drawHQ,
  timberCamp:   drawTimber,
  clayPit:      drawClay,
  ironMine:     drawMine,
  farm:         drawFarm,
  warehouse:    drawWarehouse,
  barracks:     drawBarracks,
  smithy:       drawSmithy,
  market:       drawMarket,
};

// HQ — Stone castle keep with two flanking towers ──────────────────────────────
function drawHQ(ctx, cx, cy, lv, sel, ts) {
  const s = scl(lv);
  const STO = '#8a7a62', STO_D = '#6a5a42', STO_T = '#a89870';
  const STO2 = '#7a6a52', STO2_D = '#5a4a32', STO2_T = '#988870';

  // Left tower
  box3D(ctx, cx - 30*s, cy, 22*s, 50*s, 10*s, STO2, STO2_D, STO2_T);
  battlement(ctx, cx - 30*s, cy - 50*s, 22*s, 10*s, 3, STO2, STO2_D);
  litWindow(ctx, cx - 37*s, cy - 36*s, 7*s, 9*s);

  // Right tower
  box3D(ctx, cx + 30*s, cy, 22*s, 50*s, 10*s, STO2, STO2_D, STO2_T);
  battlement(ctx, cx + 30*s, cy - 50*s, 22*s, 10*s, 3, STO2, STO2_D);
  litWindow(ctx, cx + 23*s, cy - 36*s, 7*s, 9*s);

  // Central keep (taller)
  box3D(ctx, cx + 2*s, cy, 40*s, 65*s, 14*s, STO, STO_D, STO_T);
  battlement(ctx, cx + 2*s, cy - 65*s, 40*s, 14*s, 5, STO, STO_D);
  litWindow(ctx, cx - 14*s, cy - 50*s, 8*s, 10*s);
  litWindow(ctx, cx + 8*s,  cy - 50*s, 8*s, 10*s);

  // Arched door
  archDoor(ctx, cx + 2*s, cy, 14*s, 20*s);

  // Flag on central keep
  if (lv > 0) drawFlag(ctx, cx + 16*s + 14*s, cy - 65*s - 14*s*.5 - 16*s, ts);

  // Stone texture lines on front
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = .6;
  for (let ry = cy-60*s; ry < cy; ry += 8*s) {
    ctx.beginPath(); ctx.moveTo(cx-20*s, ry); ctx.lineTo(cx+22*s, ry); ctx.stroke();
  }
}

// Timber Camp — Wooden cabin with log pile ────────────────────────────────────
function drawTimber(ctx, cx, cy, lv, sel, ts) {
  const s = scl(lv);
  const W1 = '#9a5a22', W1_D = '#6a3a12', W1_T = '#b06a2c';
  const W2 = '#7a4418', W2_D = '#5a2a10', W2_T = '#9a5422';

  // Log pile (left)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2 - (row%2); col++) {
      const lx = cx - 36*s + col*14*s + (row%2)*7*s;
      const ly = cy - 5*s - row*8*s;
      ctx.fillStyle = row%2===0 ? '#7a3a10' : '#5a2808';
      ctx.beginPath(); ctx.ellipse(lx, ly, 6*s, 3*s, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#9a4a18';
      ctx.fillRect(lx - 6*s, ly - 3*s, 12*s, 3*s);
      ctx.strokeStyle = '#4a2008'; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.ellipse(lx, ly, 6*s, 3*s, 0, 0, Math.PI*2); ctx.stroke();
    }
  }

  // Main cabin
  box3D(ctx, cx + 6*s, cy, 50*s, 40*s, 12*s, W1, W1_D, W1_T);
  // Wood plank lines
  ctx.strokeStyle = 'rgba(0,0,0,0.14)'; ctx.lineWidth = .7;
  for (let ry = cy - 37*s; ry < cy; ry += 7*s) {
    ctx.beginPath(); ctx.moveTo(cx-19*s, ry); ctx.lineTo(cx+31*s, ry); ctx.stroke();
  }

  // Steep thatched roof
  gableRoof(ctx, cx + 6*s, cy - 40*s, 52*s, 12*s, 32*s, '#8a6224', '#6a4414');
  // Roof shingles
  ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = .6;
  for (let i = 0; i < 5; i++) {
    const ry = cy - 40*s - i * 6*s;
    ctx.beginPath(); ctx.moveTo(cx - 19*s + i*3*s, ry); ctx.lineTo(cx + 7*s, ry - 32*s + i*6*s); ctx.stroke();
  }

  // Chimney
  box3D(ctx, cx + 12*s, cy - 60*s, 8*s, 12*s, 5*s, '#6a5840', '#4a3820', '#8a7858');

  // Door
  archDoor(ctx, cx + 6*s, cy, 12*s, 18*s, '#2a1608');

  // Tree stump (right)
  ctx.fillStyle = '#5a2a0a';
  ctx.beginPath(); ctx.ellipse(cx + 38*s, cy - 3*s, 8*s, 4*s, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#7a3a14'; ctx.fillRect(cx + 30*s, cy - 7*s, 16*s, 4*s);
  ctx.fillStyle = '#4a2008';
  ctx.beginPath(); ctx.ellipse(cx + 38*s, cy - 7*s, 8*s, 4*s, 0, 0, Math.PI*2); ctx.fill();
  // Axe in stump
  ctx.strokeStyle = '#8a5a20'; ctx.lineWidth = 2*s;
  ctx.beginPath(); ctx.moveTo(cx+38*s, cy-7*s); ctx.lineTo(cx+42*s, cy-18*s); ctx.stroke();
  ctx.fillStyle = '#888'; ctx.beginPath();
  ctx.moveTo(cx+44*s, cy-20*s); ctx.lineTo(cx+36*s, cy-22*s); ctx.lineTo(cx+40*s, cy-14*s); ctx.closePath(); ctx.fill();
}

// Clay Pit — Excavation with wooden frame ─────────────────────────────────────
function drawClay(ctx, cx, cy, lv, sel, ts) {
  const s = scl(lv);

  // Pit depression
  const patchG = ctx.createRadialGradient(cx, cy-4*s, 2, cx, cy-4*s, 28*s);
  patchG.addColorStop(0, '#5a3010'); patchG.addColorStop(.5, '#7a4a20'); patchG.addColorStop(1, 'rgba(120,80,40,0)');
  ctx.fillStyle = patchG;
  ctx.beginPath(); ctx.ellipse(cx, cy - 4*s, 30*s, 14*s, 0, 0, Math.PI*2); ctx.fill();

  // Clay mounds
  [[cx-22*s, cy-10*s, '#b87040', '#d09060'], [cx+18*s, cy-8*s, '#c07848', '#e09870'], [cx-10*s, cy-18*s, '#aa6838', '#c88050']].forEach(([mx,my,c1,c2]) => {
    ctx.fillStyle = c1; ctx.beginPath(); ctx.ellipse(mx, my, 10*s, 5*s, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(mx-2*s, my-2*s, 6*s, 3*s, -.3, 0, Math.PI*2); ctx.fill();
  });

  // Wooden frame structure
  const POST = '#7a4a18', BEAM = '#8a5a22';
  const posts = [[cx-18*s, cy-30*s], [cx+14*s, cy-30*s]];
  for (const [px, py] of posts) {
    ctx.fillStyle = POST;
    ctx.fillRect(px - 3*s, py, 6*s, 30*s);
    ctx.fillStyle = '#5a3008'; ctx.fillRect(px - 3*s, py, 3*s, 30*s);
  }
  // Horizontal beam
  ctx.fillStyle = BEAM;
  ctx.fillRect(cx - 18*s, cy - 34*s, 32*s, 6*s);
  ctx.fillStyle = '#6a3a12'; ctx.fillRect(cx - 18*s, cy - 34*s, 32*s, 3*s);
  // Rope hanging
  ctx.strokeStyle = '#a07030'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx - 2*s, cy - 28*s);
  ctx.bezierCurveTo(cx - 4*s, cy - 18*s, cx + 4*s, cy - 14*s, cx + 2*s, cy - 8*s); ctx.stroke();

  // Bucket at bottom
  box3D(ctx, cx, cy - 8*s, 10*s, 8*s, 4*s, '#8a6020', '#6a4010', '#a07030');

  // Barrel on side
  barrel(ctx, cx + 32*s, cy - 6*s, 5*s);

  // Label zone
}

// Iron Mine — Rocky shaft entrance ────────────────────────────────────────────
function drawMine(ctx, cx, cy, lv, sel, ts) {
  const s = scl(lv);
  const RK = '#4a4840', RK_D = '#2a2820', RK_T = '#6a6458';

  // Rocky ground / ore field
  [[cx-18*s,cy-2*s,8], [cx+14*s,cy-4*s,6], [cx-8*s,cy-6*s,5], [cx+22*s,cy-2*s,7]].forEach(([rx,ry,r]) => {
    ctx.fillStyle = '#3a3830'; ctx.beginPath(); ctx.ellipse(rx, ry, r*s, r*.4*s, -.3, 0, Math.PI*2); ctx.fill();
    // Iron ore glint
    ctx.fillStyle = '#6a7888'; ctx.beginPath(); ctx.ellipse(rx-1*s, ry-1*s, r*.4*s, r*.2*s, -.3, 0, Math.PI*2); ctx.fill();
  });

  // Main stone building with arch entrance
  box3D(ctx, cx, cy, 58*s, 50*s, 14*s, RK, RK_D, RK_T);

  // Stone block texture on front
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = .6;
  for (let ry = cy - 48*s; ry < cy; ry += 9*s) {
    ctx.beginPath(); ctx.moveTo(cx - 29*s, ry); ctx.lineTo(cx + 29*s, ry); ctx.stroke();
  }
  for (let ry = cy - 48*s, alt=0; ry < cy; ry += 9*s, alt++) {
    const step = alt%2===0 ? 0 : 12*s;
    for (let rx = cx - 29*s + step; rx < cx + 29*s; rx += 22*s) {
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx, ry + 9*s); ctx.stroke();
    }
  }

  // Mine shaft arch (dark interior)
  ctx.fillStyle = '#0e0e0e';
  ctx.beginPath(); ctx.arc(cx, cy - 14*s, 15*s, Math.PI, 0);
  ctx.lineTo(cx + 15*s, cy); ctx.lineTo(cx - 15*s, cy); ctx.closePath(); ctx.fill();
  // Arch frame stones
  ctx.strokeStyle = RK_D; ctx.lineWidth = 5*s;
  ctx.beginPath(); ctx.arc(cx, cy - 14*s, 16*s, Math.PI*1.05, Math.PI*-.05); ctx.stroke();
  ctx.strokeStyle = RK; ctx.lineWidth = 2*s;
  ctx.beginPath(); ctx.arc(cx, cy - 14*s, 16*s, Math.PI*1.05, Math.PI*-.05); ctx.stroke();

  // Cart tracks
  ctx.strokeStyle = '#3a2a10'; ctx.lineWidth = 2*s;
  ctx.beginPath(); ctx.moveTo(cx - 8*s, cy); ctx.lineTo(cx - 14*s, cy + 14*s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 8*s, cy); ctx.lineTo(cx + 14*s, cy + 14*s); ctx.stroke();
  // Track ties
  for (let i = 0; i < 3; i++) {
    const ty = cy + 4*s + i*4*s;
    ctx.beginPath(); ctx.moveTo(cx - 8*s - i*2*s, ty); ctx.lineTo(cx + 8*s + i*2*s, ty); ctx.stroke();
  }

  // Chimney on top
  box3D(ctx, cx + 16*s, cy - 50*s, 9*s, 14*s, 5*s, '#3a3830', '#1a1818', '#5a5648');
}

// Farm — Farmhouse + barn + haystack ──────────────────────────────────────────
function drawFarm(ctx, cx, cy, lv, sel, ts) {
  const s = scl(lv);
  const HO = '#c88a3a', HO_D = '#9a6020', HO_T = '#e0a050';
  const BA = '#8a5420', BA_D = '#5a2a10', BA_T = '#aa6430';

  // Haystack (right)
  ctx.fillStyle = '#c8a030';
  ctx.beginPath(); ctx.ellipse(cx + 38*s, cy - 8*s, 12*s, 7*s, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#e0b838';
  ctx.beginPath(); ctx.ellipse(cx + 36*s, cy - 10*s, 10*s, 6*s, -.2, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#f0c840';
  ctx.beginPath(); ctx.arc(cx + 38*s, cy - 14*s, 9*s, Math.PI, 0); ctx.fill();
  // hay wisps
  ctx.strokeStyle = '#d4a828'; ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath(); ctx.moveTo(cx+34*s+i*2*s, cy-14*s); ctx.lineTo(cx+33*s+i*2*s, cy-8*s); ctx.stroke();
  }

  // Barn (right side)
  box3D(ctx, cx + 14*s, cy, 28*s, 35*s, 10*s, BA, BA_D, BA_T);
  gableRoof(ctx, cx + 14*s, cy - 35*s, 30*s, 10*s, 22*s, '#6a3a10', '#4a2008');
  // Barn doors
  ctx.fillStyle = '#3a1808';
  ctx.fillRect(cx + 3*s, cy - 20*s, 9*s, 20*s);
  ctx.fillRect(cx + 14*s, cy - 20*s, 9*s, 20*s);
  ctx.strokeStyle = '#5a2808'; ctx.lineWidth = 1;
  ctx.strokeRect(cx + 3*s, cy - 20*s, 9*s, 20*s);
  ctx.strokeRect(cx + 14*s, cy - 20*s, 9*s, 20*s);

  // Main farmhouse
  box3D(ctx, cx - 14*s, cy, 32*s, 42*s, 12*s, HO, HO_D, HO_T);
  gableRoof(ctx, cx - 14*s, cy - 42*s, 34*s, 12*s, 26*s, '#a03828', '#7a2018');
  litWindow(ctx, cx - 24*s, cy - 32*s, 9*s, 11*s);
  litWindow(ctx, cx - 4*s,  cy - 32*s, 9*s, 11*s);
  archDoor(ctx, cx - 14*s, cy, 11*s, 16*s);

  // Fence posts (front)
  ctx.strokeStyle = '#8a5a20'; ctx.lineWidth = 2.5*s;
  for (let i = -3; i <= 3; i++) {
    const fx = cx - 14*s + i * 10*s;
    ctx.beginPath(); ctx.moveTo(fx, cy); ctx.lineTo(fx, cy + 12*s); ctx.stroke();
    if (i < 3) {
      ctx.lineWidth = 1.5*s;
      ctx.beginPath(); ctx.moveTo(fx, cy + 4*s); ctx.lineTo(fx + 10*s, cy + 4*s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(fx, cy + 9*s); ctx.lineTo(fx + 10*s, cy + 9*s); ctx.stroke();
      ctx.lineWidth = 2.5*s;
    }
  }
}

// Warehouse — Large granary barn ──────────────────────────────────────────────
function drawWarehouse(ctx, cx, cy, lv, sel, ts) {
  const s = scl(lv);
  const STO = '#7a6a50', STO_D = '#5a4a30', STO_T = '#9a8a68';
  const WD  = '#8a5820', WD_D  = '#5a3210', WD_T  = '#a86a28';

  // Stone foundation
  box3D(ctx, cx, cy, 72*s, 8*s, 14*s, STO, STO_D, STO_T);

  // Main warehouse body
  box3D(ctx, cx, cy - 8*s, 68*s, 52*s, 14*s, WD, WD_D, WD_T);

  // Wood plank lines
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = .7;
  for (let ry = cy - 54*s; ry < cy - 8*s; ry += 8*s) {
    ctx.beginPath(); ctx.moveTo(cx - 34*s, ry); ctx.lineTo(cx + 34*s, ry); ctx.stroke();
  }

  // Rounded barn roof (arched)
  ctx.fillStyle = '#3a2010';
  ctx.beginPath();
  ctx.moveTo(cx - 36*s, cy - 60*s);
  ctx.bezierCurveTo(cx - 36*s, cy - 92*s, cx + 36*s + 14*s, cy - 92*s, cx + 36*s + 14*s, cy - 60*s - 8*s*.5);
  ctx.lineTo(cx + 36*s, cy - 60*s); ctx.lineTo(cx - 36*s, cy - 60*s); ctx.closePath(); ctx.fill();

  ctx.fillStyle = '#5a3018';
  ctx.beginPath();
  ctx.moveTo(cx - 34*s, cy - 60*s);
  ctx.bezierCurveTo(cx - 34*s, cy - 90*s, cx + 34*s, cy - 90*s, cx + 34*s, cy - 60*s);
  ctx.closePath(); ctx.fill();
  // Roof planks
  ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = .8;
  for (let i = -4; i <= 4; i++) {
    const rx = cx + i * 8*s;
    ctx.beginPath(); ctx.moveTo(rx, cy - 60*s); ctx.lineTo(rx + i*.5*s, cy - 84*s); ctx.stroke();
  }

  // Large double doors
  ctx.fillStyle = '#3a1c08';
  ctx.fillRect(cx - 18*s, cy - 8*s - 34*s, 16*s, 34*s);
  ctx.fillRect(cx + 2*s,  cy - 8*s - 34*s, 16*s, 34*s);
  ctx.strokeStyle = '#5a2c10'; ctx.lineWidth = 1;
  ctx.strokeRect(cx - 18*s, cy - 42*s, 16*s, 34*s);
  ctx.strokeRect(cx + 2*s,  cy - 42*s, 16*s, 34*s);
  // Door handles
  ctx.fillStyle = '#c8a030';
  ctx.beginPath(); ctx.arc(cx - 3*s, cy - 25*s, 2*s, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 3*s, cy - 25*s, 2*s, 0, Math.PI*2); ctx.fill();

  // Windows
  litWindow(ctx, cx - 30*s, cy - 50*s, 9*s, 10*s);
  litWindow(ctx, cx + 22*s, cy - 50*s, 9*s, 10*s);
}

// Barracks — Military stone fortress ──────────────────────────────────────────
function drawBarracks(ctx, cx, cy, lv, sel, ts) {
  const s = scl(lv);
  const MS = '#5a5048', MS_D = '#3a3028', MS_T = '#7a6a60';
  const MD = '#4a3030', MD_D = '#2a1818', MD_T = '#6a4a40';

  // Spear rack (front left)
  ctx.strokeStyle = '#7a6030'; ctx.lineWidth = 2*s;
  for (let i = 0; i < 3; i++) {
    const sx = cx - 40*s + i * 6*s;
    ctx.beginPath(); ctx.moveTo(sx, cy); ctx.lineTo(sx, cy - 30*s); ctx.stroke();
    // Spearhead
    ctx.fillStyle = '#9a9898';
    ctx.beginPath(); ctx.moveTo(sx, cy-30*s); ctx.lineTo(sx-3*s, cy-22*s); ctx.lineTo(sx+3*s, cy-22*s); ctx.closePath(); ctx.fill();
  }
  // Rack crossbar
  ctx.strokeStyle = '#5a3a10'; ctx.lineWidth = 3*s;
  ctx.beginPath(); ctx.moveTo(cx-42*s, cy-18*s); ctx.lineTo(cx-26*s, cy-18*s); ctx.stroke();

  // Main structure
  box3D(ctx, cx, cy, 58*s, 55*s, 14*s, MS, MS_D, MS_T);

  // Stone block texture
  ctx.strokeStyle = 'rgba(0,0,0,0.14)'; ctx.lineWidth = .6;
  for (let ry = cy - 53*s; ry < cy; ry += 10*s) {
    ctx.beginPath(); ctx.moveTo(cx - 29*s, ry); ctx.lineTo(cx + 29*s, ry); ctx.stroke();
  }
  for (let ry = cy - 53*s, alt=0; ry < cy; ry += 10*s, alt++) {
    const step = alt%2===0 ? 0 : 14*s;
    for (let rx = cx-29*s+step; rx < cx+29*s; rx += 28*s) {
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx, ry+10*s); ctx.stroke();
    }
  }

  // Battlements
  battlement(ctx, cx, cy - 55*s, 58*s, 14*s, 6, MS, MS_D);

  // Heavy door
  ctx.fillStyle = '#1a0e06';
  ctx.fillRect(cx - 10*s, cy - 24*s, 20*s, 24*s);
  // Metal studs on door
  ctx.fillStyle = '#888';
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    ctx.beginPath(); ctx.arc(cx - 7*s + j*14*s, cy - 20*s + i*7*s, 1.5*s, 0, Math.PI*2); ctx.fill();
  }

  // Windows - arrow slits
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(cx - 18*s, cy - 45*s, 5*s, 12*s);
  ctx.fillRect(cx + 14*s, cy - 45*s, 5*s, 12*s);

  // Flag
  if (lv > 0) drawFlag(ctx, cx + 29*s + 14*s, cy - 55*s - 14*s*.5 - 14*s, ts);
}

// Smithy — Dark forge with glowing fire ────────────────────────────────────────
function drawSmithy(ctx, cx, cy, lv, sel, ts) {
  const s = scl(lv);
  const DK = '#3a3230', DK_D = '#1e1a18', DK_T = '#5a5250';

  // Anvil (left)
  ctx.fillStyle = '#4a4848';
  ctx.fillRect(cx - 42*s, cy - 14*s, 14*s, 3*s);   // top face
  ctx.fillStyle = '#3a3838';
  ctx.fillRect(cx - 40*s, cy - 11*s, 10*s, 7*s);   // body
  ctx.fillRect(cx - 38*s, cy - 4*s, 6*s, 4*s);    // base
  ctx.fillStyle = '#6a6868';
  ctx.fillRect(cx - 42*s, cy - 14*s, 14*s, 2*s);   // top highlight
  // Hammer on anvil
  ctx.strokeStyle = '#a07030'; ctx.lineWidth = 2*s;
  ctx.beginPath(); ctx.moveTo(cx-36*s, cy-14*s); ctx.lineTo(cx-34*s, cy-22*s); ctx.stroke();
  ctx.fillStyle = '#888';
  ctx.fillRect(cx-37*s, cy-25*s, 6*s, 4*s);

  // Main dark forge building
  box3D(ctx, cx + 2*s, cy, 54*s, 50*s, 13*s, DK, DK_D, DK_T);

  // Stone texture
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = .5;
  for (let ry = cy - 48*s; ry < cy; ry += 9*s) {
    ctx.beginPath(); ctx.moveTo(cx - 25*s, ry); ctx.lineTo(cx + 29*s, ry); ctx.stroke();
  }

  // Glowing forge window (animated pulse)
  const glow = 0.55 + 0.35 * Math.sin(ts / 260);
  const grd = ctx.createRadialGradient(cx - 5*s, cy - 28*s, 0, cx - 5*s, cy - 28*s, 16*s);
  grd.addColorStop(0, `rgba(255,130,0,${glow})`);
  grd.addColorStop(.5, `rgba(200,60,0,${glow*.6})`);
  grd.addColorStop(1, 'rgba(100,20,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.ellipse(cx - 5*s, cy - 28*s, 18*s, 14*s, 0, 0, Math.PI*2); ctx.fill();

  // Window opening (forge fire)
  ctx.fillStyle = `rgba(255,120,20,${0.7 + 0.2*Math.sin(ts/180)})`;
  ctx.fillRect(cx - 14*s, cy - 36*s, 18*s, 14*s);
  ctx.fillStyle = `rgba(255,60,0,${0.5 + 0.3*Math.sin(ts/120)})`;
  ctx.fillRect(cx - 12*s, cy - 34*s, 14*s, 10*s);
  // Window bars
  ctx.strokeStyle = '#1a1010'; ctx.lineWidth = 1.5*s;
  ctx.beginPath(); ctx.moveTo(cx - 5*s, cy - 36*s); ctx.lineTo(cx - 5*s, cy - 22*s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 14*s, cy - 30*s); ctx.lineTo(cx + 4*s, cy - 30*s); ctx.stroke();

  // Chimney
  box3D(ctx, cx + 10*s, cy - 50*s, 10*s, 16*s, 6*s, '#2a2220', '#181210', '#3a3228');
  // Smoke from chimney (register emitter)
  const ex = cx + 13*s + 3*s, ey = cy - 66*s - 3*s;
  registerSmokeEmitter(ex, ey);

  // Heavy door
  ctx.fillStyle = '#100c08';
  ctx.fillRect(cx - 4*s, cy - 22*s, 14*s, 22*s);
  ctx.strokeStyle = '#3a2810'; ctx.lineWidth = 1; ctx.strokeRect(cx - 4*s, cy - 22*s, 14*s, 22*s);
}

// Market — Open pavilion with awning ──────────────────────────────────────────
function drawMarket(ctx, cx, cy, lv, sel, ts) {
  const s = scl(lv);

  // Barrels and crates (sides)
  barrel(ctx, cx - 38*s, cy - 8*s, 5*s);
  barrel(ctx, cx - 28*s, cy - 6*s, 4.5*s);
  barrel(ctx, cx + 28*s, cy - 8*s, 5*s);
  // Crate
  box3D(ctx, cx + 36*s, cy, 12*s, 10*s, 5*s, '#8a6a30', '#6a4a20', '#a07a40');
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = .7;
  ctx.beginPath(); ctx.moveTo(cx+30*s, cy-10*s); ctx.lineTo(cx+42*s, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+42*s, cy-10*s); ctx.lineTo(cx+30*s, cy); ctx.stroke();

  // Columns (4)
  const cols = [cx-28*s, cx-8*s, cx+12*s, cx+32*s];
  for (const colx of cols) {
    box3D(ctx, colx, cy, 8*s, 52*s, 6*s, '#a89870', '#887850', '#c0b090');
    // Capital
    box3D(ctx, colx, cy - 52*s, 12*s, 6*s, 6*s, '#b0a880', '#908860', '#c8c098');
  }

  // Striped awning
  const stripeW = 8*s;
  const awW = 78*s, awH = 18*s;
  const awX = cx - 34*s, awY = cy - 58*s;
  const awD = 8*s;
  // Top face of awning
  ctx.beginPath();
  ctx.moveTo(awX, awY); ctx.lineTo(awX+awW, awY);
  ctx.lineTo(awX+awW+awD, awY-awD*.5); ctx.lineTo(awX+awD, awY-awD*.5);
  ctx.closePath(); ctx.fillStyle = '#3a60a0'; ctx.fill();
  // Front awning with stripes
  for (let i = 0; i < Math.floor(awW/stripeW)+1; i++) {
    const sx = awX + i*stripeW;
    ctx.fillStyle = i%2===0 ? '#3a60a0' : '#e8d8a0';
    ctx.fillRect(Math.max(awX, sx), awY, Math.min(stripeW, awX+awW-sx), awH);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(awX, awY, awW, awH);

  // Hanging banners
  ['#cc2020','#d4af37','#3a60a0'].forEach((color, i) => {
    const bx = cx - 20*s + i*18*s, by = cy - 56*s;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx+8*s, by); ctx.lineTo(bx+4*s, by+14*s); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = .5; ctx.stroke();
  });

  // Floor/base
  ctx.fillStyle = '#9a8868';
  ctx.fillRect(cx - 32*s, cy - 6*s, 72*s, 6*s);
  // Goods on floor
  ctx.fillStyle = '#c8a030';
  ctx.beginPath(); ctx.ellipse(cx, cy - 3*s, 10*s, 4*s, 0, 0, Math.PI*2); ctx.fill();
}

// ── Smoke emitters (registered each frame in drawSmithy/drawMine) ─────────────
let _smokeEmitters = [];
function registerSmokeEmitter(x, y) { _smokeEmitters.push({x, y}); }

// ── Particles ─────────────────────────────────────────────────────────────────
function drawParticles(ctx) {
  for (const p of particles) {
    const gray = Math.floor(150 + (1 - p.life) * 80);
    ctx.globalAlpha = p.life * 0.38;
    ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ── Animation loop ────────────────────────────────────────────────────────────
function startAnimLoop() {
  function loop(ts) {
    const dt = Math.min(ts - lastTs, 80);
    lastTs = ts;

    // Collect smoke emitters this frame
    _smokeEmitters = [];

    // Draw map (this populates _smokeEmitters for smithy/mine)
    drawMap();

    // Spawn particles from emitters
    if (_smokeEmitters.length && ts - lastSpawnTs > 220) {
      lastSpawnTs = ts;
      for (const em of _smokeEmitters) {
        if (Math.random() < 0.85) {
          particles.push({
            x: em.x + (Math.random()-.5)*5, y: em.y,
            vx: (Math.random()-.5)*.35, vy: -(0.5 + Math.random()*.5),
            life: 1, size: 2.5 + Math.random()*2,
          });
        }
      }
    }

    // Update particles
    for (const p of particles) {
      p.x += p.vx * (dt/16); p.y += p.vy * (dt/16);
      p.life -= .011*(dt/16); p.size += .07*(dt/16); p.vx *= .997;
    }
    particles = particles.filter(p => p.life > 0).slice(-200);

    animFrame = requestAnimationFrame(loop);
  }
  animFrame = requestAnimationFrame(loop);
}

// ── Buildings grid view ───────────────────────────────────────────────────────
function renderBuildingsGrid() {
  const grid = document.getElementById('buildingsGrid');
  if (!grid || !villageData) return;
  grid.innerHTML = '';
  const queueIds  = new Set((villageData.queue||[]).map(q=>q.building_id));
  const res       = villageData.resources;
  const catLabel  = {main:'Principal',resource:'Recurso',support:'Suporte',military:'Militar'};
  const resIcon   = {wood:'🪵',clay:'🧱',iron:'⛓️'};

  for (const [id, d] of Object.entries(villageData.buildings)) {
    const lv=d.currentLevel, isMax=lv>=d.maxLevel, inQueue=queueIds.has(id);
    const canBuild=!isMax&&!inQueue&&d.canAfford&&d.requirementsMet;
    const cat=config.BUILDINGS[id]?.category||'main';
    const cost=d.nextCost||{};
    const pills=['wood','clay','iron'].map(r=>{
      const c=cost[r]||0, ok=(res[r]||0)>=c;
      return `<span class="cost-pill ${ok?'can-afford':'cant-afford'}">${resIcon[r]} ${c.toLocaleString('pt-BR')}</span>`;
    }).join('');
    let stats=`<div class="card-stat">Nível <strong>${lv}</strong>/${d.maxLevel}</div>`;
    if(d.production!=null) stats+=`<div class="card-stat">Prod. <strong>${Math.floor(d.production||0)}/h</strong></div>`;
    if(d.storageCapacity!=null) stats+=`<div class="card-stat">Cap. <strong>${(d.storageCapacity||0).toLocaleString('pt-BR')}</strong></div>`;
    if(d.defenseBonus!=null) stats+=`<div class="card-stat">Def. +<strong>${d.defenseBonus}%</strong></div>`;
    if(d.buildReduction!=null) stats+=`<div class="card-stat">Const. -<strong>${d.buildReduction}%</strong></div>`;
    let action;
    if(isMax)            action=`<span class="status-tag status-max">Máximo</span>`;
    else if(inQueue)     action=`<span class="status-tag status-queue">Em construção</span>`;
    else if(!d.requirementsMet) action=`<span class="status-tag status-req">Pré-req</span>`;
    else action=`<button class="btn-upgrade" ${canBuild?'':'disabled'} onclick="openModal('${id}')">Melhorar N${d.nextLevel}</button>`;
    const card=document.createElement('div');
    card.className=`building-card${inQueue?' in-queue':''}${isMax?' max-level':''}`;
    card.innerHTML=`<div class="card-icon">${d.icon}<div class="card-level-badge">${lv}</div></div>
      <div class="card-body">
        <div class="card-title"><span class="card-name">${d.name}</span><span class="card-category cat-${cat}">${catLabel[cat]}</span></div>
        <div class="card-desc">${d.description}</div>
        <div class="card-stats">${stats}</div>
        <div class="card-footer"><div class="cost-pills">${isMax?'':pills}</div>${action}</div>
      </div>`;
    grid.appendChild(card);
  }
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(id) {
  const d=villageData?.buildings?.[id]; if(!d) return;
  const isMax=d.currentLevel>=d.maxLevel;
  const inQueue=(villageData.queue||[]).some(q=>q.building_id===id);
  const canBuild=!isMax&&!inQueue&&d.canAfford&&d.requirementsMet;
  const res=villageData.resources, cost=d.nextCost||{};
  const resIcon={wood:'🪵',clay:'🧱',iron:'⛓️'};
  const resLabel={wood:'Madeira',clay:'Argila',iron:'Ferro'};
  const costItems=['wood','clay','iron'].map(r=>{
    const c=cost[r]||0,ok=(res[r]||0)>=c;
    return `<div class="cost-item ${ok?'affordable':'expensive'}">
      <span class="cost-item-icon">${resIcon[r]}</span>
      <div><div class="cost-item-label">${resLabel[r]}</div><div class="cost-item-value">${c.toLocaleString('pt-BR')}</div></div>
    </div>`;
  }).join('');
  let statsHtml='';
  if(d.production!=null&&d.nextProduction!=null) statsHtml+=`<div class="modal-stat"><div class="modal-stat-label">Produção/h</div><div class="modal-stat-value">${Math.floor(d.production||0)} <span class="arrow">→</span> <span class="next">${Math.floor(d.nextProduction||0)}</span></div></div>`;
  if(d.storageCapacity!=null&&d.nextStorageCapacity!=null) statsHtml+=`<div class="modal-stat"><div class="modal-stat-label">Capacidade</div><div class="modal-stat-value">${(d.storageCapacity||0).toLocaleString('pt-BR')} <span class="arrow">→</span> <span class="next">${(d.nextStorageCapacity||0).toLocaleString('pt-BR')}</span></div></div>`;
  if(d.defenseBonus!=null) statsHtml+=`<div class="modal-stat"><div class="modal-stat-label">Bônus defesa</div><div class="modal-stat-value">${d.defenseBonus}%</div></div>`;
  if(d.buildReduction!=null) statsHtml+=`<div class="modal-stat"><div class="modal-stat-label">Redução construção</div><div class="modal-stat-value">${d.buildReduction}%</div></div>`;
  let reqHtml='';
  if(!d.requirementsMet&&d.missingRequirements?.length){
    const items=d.missingRequirements.map(r=>{const rb=config.BUILDINGS[r.building];return`<span class="req-item unmet">${rb?.icon||'?'} ${rb?.name} N${r.required}</span>`;}).join('');
    reqHtml=`<div class="requirements-row"><div class="req-label">⚠️ Pré-requisitos necessários</div><div class="req-items">${items}</div></div>`;
  }
  let actionHtml;
  if(isMax)       actionHtml=`<div class="status-tag status-max" style="display:block;text-align:center;padding:14px;font-size:1rem;">Nível Máximo atingido</div>`;
  else if(inQueue) actionHtml=`<div class="status-tag status-queue" style="display:block;text-align:center;padding:14px;font-size:1rem;">Em construção...</div>`;
  else actionHtml=`${reqHtml}<div class="modal-section"><div class="modal-section-title">Custo — Nível ${d.nextLevel}</div><div class="cost-row">${costItems}</div></div>
    <div class="time-row"><span class="time-icon">⏱️</span><div><div class="time-label">Tempo</div><div class="time-value">${formatTime(d.nextTime||0)}</div></div></div>
    <div class="modal-actions"><button class="btn-modal-upgrade" ${canBuild?'':'disabled'} onclick="build('${id}')">
      ${canBuild?`⚒️ Construir Nível ${d.nextLevel}`:(!d.requirementsMet?'Pré-requisitos pendentes':'Recursos insuficientes')}
    </button></div>`;
  document.getElementById('modalBody').innerHTML=`
    <div class="modal-header">
      <div class="modal-icon">${d.icon}</div>
      <div class="modal-title-block"><h2>${d.name}</h2><div class="level-info">Nível ${d.currentLevel}${isMax?` <span class="max-label">— MÁXIMO</span>`:` / ${d.maxLevel}`}</div></div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="modal-desc">${d.description}</div>
      ${statsHtml?`<div class="modal-section"><div class="modal-section-title">Estatísticas</div><div class="modal-stat-grid">${statsHtml}</div></div>`:''}
      ${actionHtml}
    </div>`;
  document.getElementById('buildingModal').classList.remove('hidden');
}
function closeModal() { document.getElementById('buildingModal').classList.add('hidden'); }

// ── Build action ──────────────────────────────────────────────────────────────
async function build(id) {
  const d=villageData.buildings[id]; closeModal();
  try {
    const res=await fetch(`${API}/village/${villageId}/build`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({buildingId:id})});
    const data=await res.json();
    if(!res.ok){notify(data.error||'Erro','error');return;}
    notify(`${d.icon} ${d.name} nível ${d.nextLevel} em construção!`,'success');
    await loadVillage();
  } catch(e){notify('Erro de conexão','error');}
}

// ── Notifications ─────────────────────────────────────────────────────────────
function notify(msg,type='info'){
  const icons={success:'✅',error:'❌',info:'ℹ️'};
  const el=document.createElement('div');
  el.className=`notification ${type}`;
  el.innerHTML=`<span class="notif-icon">${icons[type]}</span><span>${msg}</span>`;
  document.getElementById('notifications').appendChild(el);
  setTimeout(()=>el.remove(),4500);
}

// ── Navigation ────────────────────────────────────────────────────────────────
function showView(name){
  document.querySelectorAll('.game-view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById(`view-${name}`)?.classList.add('active');
  document.querySelector(`.nav-btn[data-view="${name}"]`)?.classList.add('active');
  if(name==='map') loadWorldMap();
}

// ── World map ─────────────────────────────────────────────────────────────────
async function loadWorldMap(){
  try{const data=await(await fetch(`${API}/map`)).json();renderWorldMap(data);}catch(e){console.error(e);}
}
function renderWorldMap(mapData){
  const grid=document.getElementById('worldGrid');if(!grid)return;
  grid.innerHTML='';
  for(let y=0;y<20;y++) for(let x=0;x<20;x++){
    const entry=mapData.find(m=>m.x===x&&m.y===y);
    const cell=document.createElement('div');
    cell.className='map-cell';
    if(entry){
      cell.classList.add('has-village');
      if(String(entry.village_id)===String(villageId)) cell.classList.add('is-my-village');
      cell.innerHTML=`<div class="map-cell-dot"></div>
        <div class="map-tooltip"><div class="tooltip-name">${entry.village_name}</div>
        <div class="tooltip-player">${entry.player_name}</div>
        <div class="tooltip-pos">(${x}|${y})</div></div>`;
    }
    grid.appendChild(cell);
  }
}

// ── Queue timers ──────────────────────────────────────────────────────────────
function startQueueTimers(){
  setInterval(()=>{
    document.querySelectorAll('.queue-item-timer[data-finish]').forEach(el=>{
      const rem=Math.max(0,parseInt(el.dataset.finish)-Date.now());
      if(rem===0){el.textContent='Concluindo...';el.closest('.queue-item')?.classList.add('completing');}
      else{const s=Math.floor(rem/1000),m=Math.floor(s/60),h=Math.floor(m/60);
        el.textContent=h>0?`${h}h ${m%60}m ${s%60}s`:m>0?`${m}:${(s%60).toString().padStart(2,'0')}`:`${s}s`;}
    });
  },1000);
}

// ── Map controls (zoom / pan / click) ────────────────────────────────────────
function setupMapControls(){
  const canvas=document.getElementById('villageCanvas');
  if(!canvas) return;
  canvas.addEventListener('wheel',e=>{
    e.preventDefault();
    const f=e.deltaY<0?1.15:1/1.15;
    const ns=Math.max(.35,Math.min(5,mapState.scale*f));
    const r=canvas.getBoundingClientRect();
    const mx=e.clientX-r.left,my=e.clientY-r.top;
    mapState.x=mx-(mx-mapState.x)*(ns/mapState.scale);
    mapState.y=my-(my-mapState.y)*(ns/mapState.scale);
    mapState.scale=ns;
  },{passive:false});
  canvas.addEventListener('mousedown',e=>{
    if(e.button!==0)return;
    mapState.dragging=true; mapState.sx=e.clientX-mapState.x; mapState.sy=e.clientY-mapState.y;
  });
  window.addEventListener('mousemove',e=>{
    if(!mapState.dragging)return;
    mapState.x=e.clientX-mapState.sx; mapState.y=e.clientY-mapState.sy;
  });
  window.addEventListener('mouseup',()=>{mapState.dragging=false;});
  canvas.addEventListener('click',e=>{
    if(mapState.dragging)return;
    const r=canvas.getBoundingClientRect();
    const wx=(e.clientX-r.left-mapState.x)/mapState.scale;
    const wy=(e.clientY-r.top-mapState.y)/mapState.scale;
    let hit=null;
    for(const a of buildingHitAreas){
      if(Math.abs(wx-a.cx)<a.hw&&Math.abs(wy-a.cy)<a.hh){hit=a.id;break;}
    }
    if(hit){selectedBuilding=hit; openModal(hit);}
    else   {selectedBuilding=null;}
  });
}
function zoomIn(){const r=document.getElementById('villageCanvas').getBoundingClientRect();const cx=r.width/2,cy=r.height/2,ns=Math.min(5,mapState.scale*1.3);mapState.x=cx-(cx-mapState.x)*(ns/mapState.scale);mapState.y=cy-(cy-mapState.y)*(ns/mapState.scale);mapState.scale=ns;}
function zoomOut(){const r=document.getElementById('villageCanvas').getBoundingClientRect();const cx=r.width/2,cy=r.height/2,ns=Math.max(.35,mapState.scale/1.3);mapState.x=cx-(cx-mapState.x)*(ns/mapState.scale);mapState.y=cy-(cy-mapState.y)*(ns/mapState.scale);mapState.scale=ns;}
function resetZoom(){mapState.scale=1;mapState.x=0;mapState.y=0;}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(s){if(s<60)return`${s}s`;const m=Math.floor(s/60);if(m<60)return`${m}m ${s%60}s`;return`${Math.floor(m/60)}h ${m%60}m`;}
function logout(){['playerId','villageId','playerName'].forEach(k=>localStorage.removeItem(k));window.location.href='/';}

window.onload = initGame;
