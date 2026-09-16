/* =========================================================
   霓虹贪吃蛇 —— 游戏逻辑
   ---------------------------------------------------------
   读代码的顺序建议：
     1. 配置区       —— 改这里就能调难度、改尺寸
     2. 状态变量     —— 游戏的"记忆"都在这
     3. step()       —— 每一帧世界怎么变化（游戏的心脏）
     4. draw()       —— 把状态画到屏幕上
     5. 主循环       —— 把 step 和 draw 串起来
     6. 输入         —— 键盘和触摸
   ========================================================= */

/* ========== 1. 配置 ========== */
const COLS = 50;          // 横向多少格
const ROWS = 50;          // 纵向多少格
const CELL = 24;          // 每格多少像素
const BASE_SPEED = 8;     // 初始速度：每秒走几格
const SPEED_STEP = 0.25;  // 每吃一个食物增加的速度
const MAX_SPEED = 16;     // 速度上限，再快就不是人玩的了

/* ========== 2. 拿 DOM ========== */
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const elScore = document.getElementById('score');
const elBest = document.getElementById('best');
const elSpeed = document.getElementById('speed');
const overlay = document.getElementById('overlay');
const ovTitle = document.getElementById('ov-title');
const ovText = document.getElementById('ov-text');
const ovBtn = document.getElementById('ov-btn');
const chkWall = document.getElementById('chk-wall');
const chkSound = document.getElementById('chk-sound');

// 高分屏适配：让 canvas 在实际像素上更清晰，显示尺寸仍由 CSS 控制
const dpr = window.devicePixelRatio || 1;
canvas.width = COLS * CELL * dpr;
canvas.height = ROWS * CELL * dpr;
ctx.scale(dpr, dpr);
const W = COLS * CELL;
const H = ROWS * CELL;

/* ========== 3. 状态变量 ========== */
// 游戏四个状态：ready 准备 / running 进行中 / paused 暂停 / over 结束
let state = 'ready';

let snake = [];        // 蛇身，数组第 0 项是头，例如 [{x:10,y:10},{x:9,y:10}]
let dir = { x: 1, y: 0 };      // 当前生效的方向
let inputQueue = [];           // 玩家按键缓冲，防止一帧内连按出错
let food = { x: 0, y: 0 };
let score = 0;
let best = Number(localStorage.getItem('snake-best') || 0);
let lastTick = 0;              // 上一次移动的时间戳

/* ========== 4. 工具 ========== */
function currentSpeed() {
  return Math.min(BASE_SPEED + score * SPEED_STEP, MAX_SPEED);
}

function showOverlay(title, text, btn) {
  ovTitle.textContent = title;
  ovText.innerHTML = text;
  ovBtn.textContent = btn;
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

/* ========== 5. 声音（用代码合成，不需要音频文件）========== */
let audioCtx = null;

function beep(freq, duration, type = 'square') {
  if (!chkSound.checked) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {
    // 浏览器不允许自动播放时静默失败，不影响游戏
  }
}

/* ========== 6. 初始化 / 重置 ========== */
function reset() {
  // 蛇初始长度 3，放在中间，头朝右
  const cy = Math.floor(ROWS / 2);
  snake = [
    { x: 5, y: cy },
    { x: 4, y: cy },
    { x: 3, y: cy },
  ];
  dir = { x: 1, y: 0 };
  inputQueue = [];
  score = 0;
  placeFood();
  updateHUD();
}

function placeFood() {
  // 策略：随机找空位。蛇越长空位越少，但网格才 400 格，够用。
  // （更好的做法是维护一个空格列表，你可以试着改成那样）
  let spot;
  do {
    spot = {
      x: Math.floor(Math.random() * COLS),
      y: Math.floor(Math.random() * ROWS),
    };
  } while (snake.some(s => s.x === spot.x && s.y === spot.y));
  food = spot;
}

function updateHUD() {
  elScore.textContent = score;
  elBest.textContent = best;
  elSpeed.textContent = (currentSpeed() / BASE_SPEED).toFixed(1) + 'x';
}

/* ========== 7. 状态切换 ========== */
function start() {
  if (state === 'running') return;
  if (state === 'over') reset();
  state = 'running';
  lastTick = performance.now();
  hideOverlay();
}

function pause() {
  if (state !== 'running') return;
  state = 'paused';
  showOverlay('已暂停', '按空格继续', '继续');
}

function resume() {
  if (state !== 'paused') return;
  state = 'running';
  lastTick = performance.now();
  hideOverlay();
}

function gameOver() {
  state = 'over';
  beep(160, 0.35, 'sawtooth');
  if (score > best) {
    best = score;
    localStorage.setItem('snake-best', String(best));
  }
  updateHUD();
  showOverlay(
    '游戏结束',
    `本局得分 <b>${score}</b>　历史最高 <b>${best}</b><br>按 R 或点下面按钮重来`,
    '再来一局'
  );
}

/* ========== 8. step：世界前进一格 ========== */
function step() {
  // 8.1 从按键缓冲里取一个方向（没有就保持原方向）
  if (inputQueue.length) dir = inputQueue.shift();

  // 8.2 算出新的头在哪
  let head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

  // 8.3 处理边界：穿墙 或 撞墙
  if (chkWall.checked) {
    if (head.x < 0) head.x = COLS - 1;
    if (head.x >= COLS) head.x = 0;
    if (head.y < 0) head.y = ROWS - 1;
    if (head.y >= ROWS) head.y = 0;
  } else {
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
      gameOver();
      return;
    }
  }

  // 8.4 先看这一格是不是食物，决定蛇会不会变长
  const willGrow = head.x === food.x && head.y === food.y;

  // 8.5 撞到自己？
  //     注意：如果这一格没吃到食物，尾巴这一帧会让开，所以撞到"最后一节"不算死。
  const body = willGrow ? snake : snake.slice(0, -1);
  if (body.some(s => s.x === head.x && s.y === head.y)) {
    gameOver();
    return;
  }

  // 8.6 把新头插到最前面（unshift = 数组头部插入）
  snake.unshift(head);

  if (willGrow) {
    // 吃到食物：尾巴不删，蛇就变长了
    score++;
    beep(660, 0.08);
    placeFood();
    updateHUD();
  } else {
    // 没吃到：删掉尾巴，长度不变，看起来就是在"前进"
    snake.pop();
  }
}

/* ========== 9. draw：把状态画出来 ========== */
function draw() {
  // 背景
  ctx.fillStyle = '#111820';
  ctx.fillRect(0, 0, W, H);

  // 网格线
  ctx.strokeStyle = '#1a2430';
  ctx.lineWidth = 1;
  for (let i = 1; i < COLS; i++) {
    ctx.beginPath();
    ctx.moveTo(i * CELL, 0);
    ctx.lineTo(i * CELL, H);
    ctx.stroke();
  }
  for (let j = 1; j < ROWS; j++) {
    ctx.beginPath();
    ctx.moveTo(0, j * CELL);
    ctx.lineTo(W, j * CELL);
    ctx.stroke();
  }

  drawFood();
  drawSnake();
}

function drawFood() {
  const cx = food.x * CELL + CELL / 2;
  const cy = food.y * CELL + CELL / 2;
  ctx.save();
  ctx.shadowColor = '#fbbf24';
  ctx.shadowBlur = 16;
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(cx, cy, CELL * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSnake() {
  for (let i = snake.length - 1; i >= 0; i--) {
    const seg = snake[i];
    // 从头到尾颜色逐渐变暗
    const t = i / Math.max(snake.length - 1, 1);
    const light = 60 - t * 22;              // HSL 的亮度
    ctx.fillStyle = `hsl(142, 70%, ${light}%)`;

    ctx.save();
    if (i === 0) {
      ctx.shadowColor = '#4ade80';
      ctx.shadowBlur = 14;
    }
    const pad = 2;
    ctx.beginPath();
    ctx.roundRect(
      seg.x * CELL + pad,
      seg.y * CELL + pad,
      CELL - pad * 2,
      CELL - pad * 2,
      5
    );
    ctx.fill();
    ctx.restore();
  }

  // 给蛇头画两只眼睛，朝当前方向
  const head = snake[0];
  const hx = head.x * CELL + CELL / 2;
  const hy = head.y * CELL + CELL / 2;
  const off = CELL * 0.18;
  const px = -dir.y * off;   // 方向的垂直方向，用来把两只眼睛分开
  const py = dir.x * off;
  ctx.fillStyle = '#0b0f14';
  for (const s of [1, -1]) {
    ctx.beginPath();
    ctx.arc(hx + dir.x * off + px * s, hy + dir.y * off + py * s, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ========== 10. 主循环 ==========
   requestAnimationFrame 大约每秒回调 60 次。
   但我们不需要每秒走 60 格，所以用 lastTick 控制：
   累计时间够了才走一格，剩下的时间只负责画。
   ================================= */
function loop(timestamp) {
  if (state === 'running') {
    const interval = 1000 / currentSpeed();   // 走一格需要多少毫秒
    if (timestamp - lastTick >= interval) {
      lastTick = timestamp;
      step();
    }
  }
  draw();
  requestAnimationFrame(loop);
}

/* ========== 11. 输入 ========== */
// 把"想往哪走"放进队列，而不是直接改 dir。
// 这样即使一帧内连按两个键（比如先上再左），蛇也会先走上、下一格再走左，
// 不会出现"明明向右走，按了上和左之后直接掉头撞死"的 bug。
function queueDir(nx, ny) {
  const last = inputQueue.length ? inputQueue[inputQueue.length - 1] : dir;
  if (nx === -last.x && ny === -last.y) return;   // 不能 180 度掉头
  if (nx === last.x && ny === last.y) return;     // 和当前方向一样，忽略
  if (inputQueue.length >= 2) return;             // 最多缓存两个，避免囤积
  inputQueue.push({ x: nx, y: ny });
  if (state === 'ready') start();
}

const KEYMAP = {
  ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
  ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
  ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
  ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
};

window.addEventListener('keydown', e => {
  if (KEYMAP[e.key]) {
    e.preventDefault();                       // 防止方向键滚动页面
    const [x, y] = KEYMAP[e.key];
    queueDir(x, y);
    return;
  }
  if (e.key === ' ') {
    e.preventDefault();
    if (state === 'running') pause();
    else if (state === 'paused') resume();
    else if (state === 'ready' || state === 'over') start();
    return;
  }
  if (e.key === 'r' || e.key === 'R') {
    reset();
    start();
  }
});

// 手机滑动
let touchStart = null;
canvas.addEventListener('touchstart', e => {
  touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });

canvas.addEventListener('touchend', e => {
  if (!touchStart) return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;  // 只是点了一下
  if (Math.abs(dx) > Math.abs(dy)) queueDir(dx > 0 ? 1 : -1, 0);
  else queueDir(0, dy > 0 ? 1 : -1);
  touchStart = null;
}, { passive: true });

/* ========== 12. 按钮 ========== */
ovBtn.addEventListener('click', () => {
  if (state === 'paused') resume();
  else start();
});

document.getElementById('btn-restart').addEventListener('click', () => {
  reset();
  start();
});

document.getElementById('btn-pause').addEventListener('click', () => {
  if (state === 'running') pause();
  else if (state === 'paused') resume();
});

// 切换穿墙模式时不重开，下次撞边界才生效
chkWall.addEventListener('change', () => {});

/* ========== 13. 启动 ========== */
reset();
showOverlay('准备开始', '方向键 / WASD 控制<br>空格暂停，R 重开', '开始游戏');
requestAnimationFrame(loop);
