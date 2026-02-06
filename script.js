const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold');
const holdCtx = holdCanvas.getContext('2d');

const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const statusEl = document.getElementById('status');

const startBtn = document.getElementById('start');
const pauseBtn = document.getElementById('pause');
const restartBtn = document.getElementById('restart');

const COLS = 10;
const ROWS = 20;
const BLOCK = 32;
const PREVIEW_BLOCK = 24;

canvas.width = COLS * BLOCK;
canvas.height = ROWS * BLOCK;

const COLORS = {
  I: '#4fd1ff',
  J: '#6b7bff',
  L: '#ffb347',
  O: '#ffd93b',
  S: '#79f067',
  T: '#c47bff',
  Z: '#ff6b6b',
  X: '#101010'
};

const SHAPES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0]
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0]
  ],
  O: [
    [1, 1],
    [1, 1]
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0]
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0]
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0]
  ]
};

const KICK_TESTS = {
  normal: [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, -1],
    [1, -1],
    [-1, -1]
  ],
  I: [
    [0, 0],
    [2, 0],
    [-2, 0],
    [1, 0],
    [-1, 0]
  ]
};

let grid = createMatrix(COLS, ROWS);
let bag = [];
let current = null;
let next = null;
let hold = null;
let canHold = true;
let dropCounter = 0;
let dropInterval = 800;
let lastTime = 0;
let running = false;
let paused = false;
let score = 0;
let level = 1;
let lines = 0;

function createMatrix(w, h) {
  const matrix = [];
  for (let y = 0; y < h; y++) {
    matrix.push(new Array(w).fill(''));
  }
  return matrix;
}

function createPiece(type) {
  return {
    type,
    shape: SHAPES[type].map(row => row.slice()),
    x: Math.floor(COLS / 2) - Math.ceil(SHAPES[type][0].length / 2),
    y: -1
  };
}

function refillBag() {
  const types = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  bag.push(...types);
}

function nextPiece() {
  if (bag.length === 0) {
    refillBag();
  }
  return createPiece(bag.shift());
}

function resetGame() {
  grid = createMatrix(COLS, ROWS);
  bag = [];
  current = nextPiece();
  next = nextPiece();
  hold = null;
  canHold = true;
  score = 0;
  level = 1;
  lines = 0;
  dropInterval = 800;
  updateStats();
  statusEl.textContent = 'Good luck!';
}

function updateStats() {
  scoreEl.textContent = score;
  levelEl.textContent = level;
  linesEl.textContent = lines;
}

function rotate(matrix) {
  const result = matrix.map((_, i) => matrix.map(row => row[i]).reverse());
  return result;
}

function collide(board, piece) {
  const { shape, x: offsetX, y: offsetY } = piece;
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (shape[y][x]) {
        const newX = x + offsetX;
        const newY = y + offsetY;
        if (newX < 0 || newX >= COLS || newY >= ROWS) {
          return true;
        }
        if (newY >= 0 && board[newY][newX]) {
          return true;
        }
      }
    }
  }
  return false;
}

function merge(board, piece) {
  piece.shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value && piece.y + y >= 0) {
        board[piece.y + y][piece.x + x] = piece.type;
      }
    });
  });
}

function sweep() {
  let rowCount = 0;
  outer: for (let y = ROWS - 1; y >= 0; y--) {
    for (let x = 0; x < COLS; x++) {
      if (!grid[y][x]) {
        continue outer;
      }
    }
    const row = grid.splice(y, 1)[0].fill('');
    grid.unshift(row);
    rowCount++;
    y++;
  }

  if (rowCount > 0) {
    const lineScores = [0, 100, 300, 500, 800];
    score += lineScores[rowCount] * level;
    lines += rowCount;
    const newLevel = 1 + Math.floor(lines / 10);
    if (newLevel !== level) {
      level = newLevel;
      dropInterval = Math.max(100, 800 - (level - 1) * 60);
      statusEl.textContent = `Level up! You reached level ${level}.`;
    }
    updateStats();
  }
}

function hardDrop() {
  let drop = 0;
  while (!collide(grid, { ...current, y: current.y + 1 })) {
    current.y += 1;
    drop += 2;
  }
  score += drop;
  lockPiece();
}

function lockPiece() {
  merge(grid, current);
  sweep();
  current = next;
  next = nextPiece();
  canHold = true;
  if (collide(grid, current)) {
    running = false;
    statusEl.textContent = 'Game Over. Press Restart.';
  }
}

function move(dir) {
  current.x += dir;
  if (collide(grid, current)) {
    current.x -= dir;
  }
}

function drop() {
  current.y += 1;
  if (collide(grid, current)) {
    current.y -= 1;
    lockPiece();
  }
  dropCounter = 0;
}

function softDrop() {
  current.y += 1;
  if (collide(grid, current)) {
    current.y -= 1;
    lockPiece();
  } else {
    score += 1;
    updateStats();
  }
  dropCounter = 0;
}

function rotateCurrent(direction) {
  const original = current.shape;
  current.shape = rotate(current.shape);
  if (direction < 0) {
    current.shape = rotate(rotate(current.shape));
  }
  const kicks = current.type === 'I' ? KICK_TESTS.I : KICK_TESTS.normal;
  for (const [x, y] of kicks) {
    current.x += x;
    current.y += y;
    if (!collide(grid, current)) {
      return;
    }
    current.x -= x;
    current.y -= y;
  }
  current.shape = original;
}

function holdPiece() {
  if (!canHold) return;
  if (!hold) {
    hold = { type: current.type };
    current = next;
    next = nextPiece();
  } else {
    const temp = hold.type;
    hold.type = current.type;
    current = createPiece(temp);
  }
  canHold = false;
}

function drawBlock(context, x, y, size, type, alpha = 1) {
  context.globalAlpha = alpha;
  context.fillStyle = COLORS[type];
  context.fillRect(x, y, size, size);
  context.strokeStyle = '#1b1b1b';
  context.lineWidth = 2;
  context.strokeRect(x, y, size, size);
  context.globalAlpha = 1;
}

function drawMatrix(context, matrix, offset, size) {
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) {
        drawBlock(context, (x + offset.x) * size, (y + offset.y) * size, size, value);
      }
    });
  });
}

function ghostPosition(piece) {
  const ghost = { ...piece, y: piece.y };
  while (!collide(grid, { ...ghost, y: ghost.y + 1 })) {
    ghost.y += 1;
  }
  return ghost;
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#121212';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawMatrix(ctx, grid, { x: 0, y: 0 }, BLOCK);

  if (current) {
    const ghost = ghostPosition(current);
    ghost.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) {
          drawBlock(ctx, (ghost.x + x) * BLOCK, (ghost.y + y) * BLOCK, BLOCK, current.type, 0.2);
        }
      });
    });

    current.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) {
          drawBlock(ctx, (current.x + x) * BLOCK, (current.y + y) * BLOCK, BLOCK, current.type);
        }
      });
    });
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * BLOCK, 0);
    ctx.lineTo(x * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * BLOCK);
    ctx.lineTo(COLS * BLOCK, y * BLOCK);
    ctx.stroke();
  }
}

function drawPreview() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);

  if (next) {
    const shape = SHAPES[next.type];
    drawMini(nextCtx, shape, next.type);
  }
  if (hold) {
    const shape = SHAPES[hold.type];
    drawMini(holdCtx, shape, hold.type);
  }
}

function drawMini(context, shape, type) {
  const size = PREVIEW_BLOCK;
  const width = shape[0].length * size;
  const height = shape.length * size;
  const offsetX = Math.floor((context.canvas.width - width) / 2);
  const offsetY = Math.floor((context.canvas.height - height) / 2);
  shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) {
        drawBlock(context, offsetX + x * size, offsetY + y * size, size, type);
      }
    });
  });
}

function update(time = 0) {
  if (!running || paused) return;
  const delta = time - lastTime;
  lastTime = time;
  dropCounter += delta;
  if (dropCounter > dropInterval) {
    drop();
  }
  drawBoard();
  drawPreview();
  requestAnimationFrame(update);
}

function startGame() {
  if (!running) {
    resetGame();
    running = true;
  }
  paused = false;
  lastTime = 0;
  statusEl.textContent = 'Game on!';
  requestAnimationFrame(update);
}

function togglePause() {
  if (!running) return;
  paused = !paused;
  statusEl.textContent = paused ? 'Paused.' : 'Back in the groove.';
  if (!paused) {
    lastTime = 0;
    requestAnimationFrame(update);
  }
}

function restartGame() {
  resetGame();
  running = true;
  paused = false;
  lastTime = 0;
  requestAnimationFrame(update);
}

function handleKey(event) {
  if (!running || paused) return;
  switch (event.code) {
    case 'ArrowLeft':
      move(-1);
      break;
    case 'ArrowRight':
      move(1);
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'Space':
      event.preventDefault();
      hardDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      rotateCurrent(1);
      break;
    case 'KeyZ':
      rotateCurrent(-1);
      break;
    case 'KeyC':
      holdPiece();
      break;
    case 'KeyP':
      togglePause();
      break;
    default:
      break;
  }
}

startBtn.addEventListener('click', startGame);
pauseBtn.addEventListener('click', togglePause);
restartBtn.addEventListener('click', restartGame);

window.addEventListener('keydown', handleKey);

resetGame();
drawBoard();
drawPreview();
