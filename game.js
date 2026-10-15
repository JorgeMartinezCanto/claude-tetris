'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
  '#ff5722', // Bomba
  '#78909c', // Bloque fijo (desafío)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8]],                                       // Bomba (power-up)
];

const BOMB = 8;
const BOMB_EVERY = 7; // líneas por bomba
const FIXED = 9;

// Desafío: filas inferiores del tablero inicial ('#' = bloque pre-colocado)
const CHALLENGE_LAYOUT = [
  '#.#.#.#.#.',
  '.#.#.#.#.#',
  '##.##.##.#',
  '#.####.###',
  '###.##.#.#',
  '#.##.####.',
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const skinSelect = document.getElementById('skin-select');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const normalBtn = document.getElementById('mode-normal');
const challengeBtn = document.getElementById('mode-challenge');
const fixedSection = document.getElementById('fixed-section');
const fixedEl = document.getElementById('fixed-left');
const modeButtons = document.getElementById('mode-buttons');
const pauseMenu = document.getElementById('pause-menu');
const pauseControlsList = document.getElementById('pause-controls-list');
const startLevelEl = document.getElementById('start-level');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, bombsGiven, bombPending, mode = 'normal', startLevel = 1, baseLevel = 1;

function intervalFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function loadChallenge() {
  const top = ROWS - CHALLENGE_LAYOUT.length;
  CHALLENGE_LAYOUT.forEach((row, i) => {
    for (let c = 0; c < COLS; c++)
      if (row[c] === '#') board[top + i][c] = FIXED;
  });
}

function countFixed() {
  return board.reduce((n, row) => n + row.filter(v => v === FIXED).length, 0);
}

function randomPiece() {
  let type = Math.floor(Math.random() * 7) + 1;
  if (bombPending) {
    type = BOMB;
    bombPending = false;
  }
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = baseLevel + Math.floor(lines / 10);
    const earned = Math.floor(lines / BOMB_EVERY);
    if (earned > bombsGiven) {
      bombsGiven = earned;
      bombPending = true;
    }
    dropInterval = intervalFor(level);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function explode(cx, cy) {
  let destroyed = 0;
  for (let r = cy - 1; r <= cy + 1; r++)
    for (let c = cx - 1; c <= cx + 1; c++)
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c]) {
        board[r][c] = 0;
        destroyed++;
      }
  score += destroyed * 10 * level;
  updateHUD();
}

function lockPiece() {
  if (current.type === BOMB) explode(current.x, current.y);
  else merge();
  clearLines();
  if (mode === 'challenge' && countFixed() === 0) {
    winGame();
    return;
  }
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  fixedSection.classList.toggle('hidden', mode !== 'challenge');
  if (board) fixedEl.textContent = countFixed();
}

// ---- Skins ----
function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawRetroBlock(context, x, y, color, size) {
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
}

function drawNeonBlock(context, x, y, color, size) {
  context.shadowColor = color;
  context.shadowBlur = 12;
  context.fillStyle = 'rgba(0,0,0,0.85)';
  context.fillRect(x * size + 3, y * size + 3, size - 6, size - 6);
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(x * size + 3, y * size + 3, size - 6, size - 6);
  context.fillStyle = color;
  context.globalAlpha *= 0.35;
  context.fillRect(x * size + 6, y * size + 6, size - 12, size - 12);
  context.shadowBlur = 0;
}

function drawPastelBlock(context, x, y, color, size) {
  context.fillStyle = color;
  roundRectPath(context, x * size + 2, y * size + 2, size - 4, size - 4, 8);
  context.fill();
  context.fillStyle = 'rgba(255,255,255,0.45)';
  roundRectPath(context, x * size + 6, y * size + 5, size - 12, 4, 2);
  context.fill();
}

function drawPixelBlock(context, x, y, color, size) {
  const px = x * size, py = y * size, u = (size - 2) / 6;
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  // textura: tablero de ajedrez de píxeles claros/oscuros
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 6; j++) {
      if ((i + j) % 2) continue;
      context.fillStyle = (i < 3 && j < 3) ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.18)';
      context.fillRect(px + 1 + i * u, py + 1 + j * u, u, u);
    }
  context.strokeStyle = '#000';
  context.lineWidth = 2;
  context.strokeRect(px + 1, py + 1, size - 2, size - 2);
}

const SKINS = {
  retro: {
    colors: COLORS,
    bg: '#1a1a25',
    grid: '#22222e',
    draw: drawRetroBlock,
  },
  neon: {
    colors: [null, '#00f0ff', '#ffee00', '#d500f9', '#39ff14', '#ff1744', '#4d6bff', '#ff9100', '#ff3d00', '#90a4ae'],
    bg: '#000000',
    grid: '#14142a',
    draw: drawNeonBlock,
  },
  pastel: {
    colors: [null, '#a8e6ef', '#fff1a8', '#d9b8f0', '#b8e8c0', '#f5b5b5', '#b8c4f0', '#fcd5a5', '#ff9e80', '#c5d0d6'],
    bg: '#fdf6f0',
    grid: '#eadfd6',
    draw: drawPastelBlock,
  },
  pixel: {
    colors: [null, '#29b6f6', '#fbc02d', '#8e24aa', '#43a047', '#e53935', '#3949ab', '#fb8c00', '#ff5722', '#757575'],
    bg: '#2b2b2b',
    grid: '#383838',
    draw: drawPixelBlock,
  },
};

let skinName = 'retro';
try {
  const saved = localStorage.getItem('tetris-skin');
  if (saved && SKINS[saved]) skinName = saved;
} catch (e) {}

function applySkin(name) {
  if (!SKINS[name]) return;
  skinName = name;
  canvas.style.background = SKINS[name].bg;
  nextCanvas.style.background = SKINS[name].bg;
  skinSelect.value = name;
}

function setSkin(name) {
  applySkin(name);
  try { localStorage.setItem('tetris-skin', name); } catch (e) {}
  if (board && current) draw();
  if (next) drawNext();
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = SKINS[skinName];
  const color = skin.colors[colorIndex];
  context.globalAlpha = alpha ?? 1;
  if (colorIndex === BOMB) {
    context.fillStyle = color;
    context.beginPath();
    context.arc((x + 0.5) * size, (y + 0.5) * size, size / 2 - 2, 0, Math.PI * 2);
    context.fill();
    context.font = `${size - 8}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('💣', (x + 0.5) * size, (y + 0.5) * size + 1);
    context.globalAlpha = 1;
    return;
  }
  skin.draw(context, x, y, color, size);
  context.shadowBlur = 0;
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = SKINS[skinName].grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function winGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = '¡DESAFÍO SUPERADO!';
  overlayTitle.classList.add('win');
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function showMenu() {
  gameOver = true;
  overlayTitle.textContent = 'TETRIS';
  overlayTitle.classList.remove('win');
  overlayScore.textContent = 'Elige modo';
  overlay.classList.remove('hidden');
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.classList.remove('win');
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver || !current) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    modeButtons.classList.add('hidden');
    pauseMenu.classList.remove('hidden');
    pauseControlsList.classList.add('hidden');
    overlay.classList.remove('hidden');
  }
  if (!paused) {
    overlay.classList.add('hidden');
    pauseMenu.classList.add('hidden');
    modeButtons.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init(newMode) {
  mode = newMode ?? mode;
  board = createBoard();
  if (mode === 'challenge') loadChallenge();
  overlayTitle.classList.remove('win');
  score = 0;
  lines = 0;
  bombsGiven = 0;
  bombPending = false;
  baseLevel = startLevel;
  level = baseLevel;
  paused = false;
  gameOver = false;
  dropInterval = intervalFor(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  modeButtons.classList.remove('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (document.activeElement === skinSelect) skinSelect.blur();
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

document.getElementById('pause-resume').addEventListener('click', e => { e.currentTarget.blur(); togglePause(); });
document.getElementById('pause-restart').addEventListener('click', () => init());
document.getElementById('pause-controls').addEventListener('click', () => pauseControlsList.classList.toggle('hidden'));
startLevelEl.addEventListener('change', () => { startLevel = Number(startLevelEl.value); startLevelEl.blur(); });
skinSelect.addEventListener('change', () => {
  setSkin(skinSelect.value);
  skinSelect.blur();
});

normalBtn.addEventListener('click', () => init('normal'));
challengeBtn.addEventListener('click', () => init('challenge'));

applySkin(skinName);
showMenu();
