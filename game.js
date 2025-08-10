// Lightweight Bubble Shooter in Vanilla ES Module
// Game constants & asset handling
const CONFIG = {
    bubbleRadius: 16,
    rowCount: 8,
    colors: ['#60a5fa', '#f472b6', '#facc15', '#34d399', '#a78bfa', '#f87171'],
    launchSpeed: 680, // px/sec initial speed along direction
    friction: 0.985, // slow-down per frame for subtle easing at end
    columnOffset: 0.5, // staggered hex grid offset
    minCluster: 3,
    spawnRowInterval: 15000, // ms before pushing new row
    aimGuideLength: 120,
    maxBounce: 6
};

// Remote image asset (public domain style placeholder). Replace with your own if desired.
const ASSET_URLS = {
    bubbleBase: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/White_Glossy_Button.svg/64px-White_Glossy_Button.svg.png'
};

const assets = { baseBubbleImg: null, tinted: new Map(), loaded: false };

function loadAssets() {
    return new Promise(res => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { assets.baseBubbleImg = img; assets.loaded = true; res(); };
        img.onerror = () => { console.warn('Bubble base image failed to load, using canvas fallback'); res(); };
        img.src = ASSET_URLS.bubbleBase;
    });
}

function getTinted(color) {
    if (!assets.baseBubbleImg) return null;
    if (assets.tinted.has(color)) return assets.tinted.get(color);
    const base = assets.baseBubbleImg;
    const off = document.createElement('canvas');
    const size = CONFIG.bubbleRadius * 2;
    off.width = size; off.height = size;
    const octx = off.getContext('2d');
    // Draw scaled base bubble
    const scale = size / Math.max(base.width, base.height);
    const bw = base.width * scale;
    const bh = base.height * scale;
    octx.drawImage(base, (size - bw) / 2, (size - bh) / 2, bw, bh);
    // Tint
    octx.globalCompositeOperation = 'source-atop';
    octx.fillStyle = color;
    octx.fillRect(0, 0, size, size);
    // Gloss highlight overlay
    const g = octx.createRadialGradient(size * 0.35, size * 0.35, size * 0.1, size * 0.4, size * 0.4, size * 0.9);
    g.addColorStop(0, '#ffffffaa');
    g.addColorStop(0.5, '#ffffff22');
    g.addColorStop(1, '#ffffff00');
    octx.globalCompositeOperation = 'lighter';
    octx.fillStyle = g; octx.beginPath(); octx.arc(size * 0.45, size * 0.45, size * 0.45, 0, Math.PI * 2); octx.fill();
    assets.tinted.set(color, off);
    return off;
}

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const shotsEl = document.getElementById('shots');
const rowsEl = document.getElementById('rows');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');

let state = {
    grid: [],
    projectiles: [],
    shooter: { x: canvas.width / 2, y: canvas.height - 40, angle: -Math.PI / 2 },
    nextColor: null,
    score: 0,
    shots: 0,
    lastRowPush: 0,
    gameOver: false,
    lastTime: 0,
    spawnTimer: 0
};

function initGrid() {
    state.grid = [];
    const r = CONFIG.bubbleRadius;
    const perRow = Math.floor(canvas.width / (r * 2));
    const rowHeight = r * 1.65; // cleaner vertical spacing
    for (let row = 0; row < CONFIG.rowCount; row++) {
        const offset = (row % 2) * r;
        const arr = [];
        const count = perRow - (row % 2 ? 1 : 0);
        for (let c = 0; c < count; c++) {
            arr.push({ row, c, x: r + c * r * 2 + offset, y: r + row * rowHeight, color: pickColor(), removing: false });
        }
        state.grid.push(arr);
    }
    rowsEl.textContent = state.grid.length;
}

function pickColor() {
    return CONFIG.colors[Math.floor(Math.random() * CONFIG.colors.length)];
}

function newProjectile() {
    state.nextColor = state.nextColor || pickColor();
    const p = {
        x: state.shooter.x,
        y: state.shooter.y,
        vx: Math.cos(state.shooter.angle) * CONFIG.launchSpeed,
        vy: Math.sin(state.shooter.angle) * CONFIG.launchSpeed,
        color: state.nextColor,
        active: true,
        bounces: 0
    };
    state.nextColor = pickColor();
    state.projectiles.push(p);
    state.shots++;
    shotsEl.textContent = state.shots;
}

function worldToGrid(y) {
    const r = CONFIG.bubbleRadius;
    const rowHeight = r * 1.732; // approximate hex vertical distance
    return Math.round((y - r) / rowHeight);
}

function addBubbleAt(projectile, targetX, targetY) {
    // Snap to nearest grid slot
    const r = CONFIG.bubbleRadius;
    const rowHeight = r * 1.732;
    const row = worldToGrid(targetY);
    const offset = (row % 2) * r;
    const perRow = Math.floor(canvas.width / (r * 2));
    const col = Math.max(0, Math.min(perRow - 1, Math.round((targetX - offset - r) / (r * 2))));

    while (state.grid.length <= row) {
        state.grid.push([]);
    }

    const rowArr = state.grid[row];
    // Ensure slot uniqueness
    if (!rowArr.find(b => b.c === col)) {
        const bubble = { row, c: col, x: r + col * r * 2 + offset, y: r + row * rowHeight, color: projectile.color, removing: false };
        rowArr.push(bubble);
        clusterCheck(bubble);
        floatingCheck();
    }
    rowsEl.textContent = state.grid.length;
}

function clusterCheck(origin) {
    const visited = new Set();
    const cluster = [];
    const targetColor = origin.color;
    function dfs(b) {
        const key = b.row + ':' + b.c;
        if (visited.has(key)) return;
        visited.add(key);
        if (b.color !== targetColor) return;
        cluster.push(b);
        neighbors(b).forEach(dfs);
    }
    dfs(origin);
    if (cluster.length >= CONFIG.minCluster) {
        cluster.forEach(b => b.removing = true);
        state.score += cluster.length * 10;
        scoreEl.textContent = state.score;
    }
}

function floatingCheck() {
    // Remove bubbles not connected to top row
    const connected = new Set();
    function dfs(b) {
        const key = b.row + ':' + b.c;
        if (connected.has(key)) return;
        connected.add(key);
        neighbors(b).forEach(dfs);
    }
    // Start from top row
    state.grid[0]?.forEach(dfs);
    for (let r = 0; r < state.grid.length; r++) {
        const rowArr = state.grid[r];
        for (let i = rowArr.length - 1; i >= 0; i--) {
            const b = rowArr[i];
            if (!connected.has(b.row + ':' + b.c) && !b.removing) {
                b.removing = true;
                state.score += 20; // bonus for dropping
            }
        }
    }
    scoreEl.textContent = state.score;
}

function neighbors(b) {
    const r = CONFIG.bubbleRadius;
    const res = [];
    const rowArr = state.grid[b.row];
    if (!rowArr) return res;
    const even = b.row % 2 === 0;
    const deltas = even ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]] : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
    for (const [dr, dc] of deltas) {
        const nr = b.row + dr;
        const nc = b.c + dc;
        if (nr < 0 || nr >= state.grid.length) continue;
        const arr = state.grid[nr];
        const found = arr.find(x => x.c === nc);
        if (found) res.push(found);
    }
    return res;
}

function update(dt) {
    // Move projectiles
    for (const p of state.projectiles) {
        if (!p.active) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= CONFIG.friction;
        p.vy *= CONFIG.friction;

        // Wall bounce
        if (p.x < CONFIG.bubbleRadius) {
            p.x = CONFIG.bubbleRadius;
            p.vx = Math.abs(p.vx);
            p.bounces++;
        } else if (p.x > canvas.width - CONFIG.bubbleRadius) {
            p.x = canvas.width - CONFIG.bubbleRadius;
            p.vx = -Math.abs(p.vx);
            p.bounces++;
        }
        if (p.bounces > CONFIG.maxBounce) p.active = false;

        // Collision with top
        if (p.y < CONFIG.bubbleRadius) {
            p.active = false;
            addBubbleAt(p, p.x, CONFIG.bubbleRadius);
            continue;
        }

        // Collision with existing bubbles
        outer: for (let r = 0; r < state.grid.length; r++) {
            for (const b of state.grid[r]) {
                const dx = p.x - b.x;
                const dy = p.y - b.y;
                const dist = Math.hypot(dx, dy);
                if (dist < CONFIG.bubbleRadius * 2 - 1) {
                    p.active = false;
                    // place bubble just outside collision
                    const angle = Math.atan2(dy, dx);
                    const tx = b.x + Math.cos(angle) * CONFIG.bubbleRadius * 2;
                    const ty = b.y + Math.sin(angle) * CONFIG.bubbleRadius * 2;
                    addBubbleAt(p, tx, ty);
                    break outer;
                }
            }
        }

        // Game over if reached bottom
        if (p.y > canvas.height - 10) {
            p.active = false;
            // ignore, projectile lost
        }
    }

    // Remove resolved projectiles
    state.projectiles = state.projectiles.filter(p => p.active);

    // Animate removals
    for (let r = 0; r < state.grid.length; r++) {
        const rowArr = state.grid[r];
        for (let i = rowArr.length - 1; i >= 0; i--) {
            const b = rowArr[i];
            if (b.removing) {
                rowArr.splice(i, 1);
            }
        }
        if (rowArr.length === 0 && r === state.grid.length - 1) {
            state.grid.pop();
            r--;
        }
    }

    // Periodic row push
    state.spawnTimer += dt * 1000;
    if (state.spawnTimer >= CONFIG.spawnRowInterval) {
        pushRow();
        state.spawnTimer = 0;
    }

    // Win check (no bubbles)
    if (!state.gameOver && state.grid.every(r => r.length === 0)) {
        state.gameOver = true;
        endGame(true);
    }

    // Lose check (bubbles reach shooter y - some margin)
    const dangerY = canvas.height - 100;
    for (const rowArr of state.grid) {
        for (const b of rowArr) {
            if (b.y > dangerY) {
                state.gameOver = true;
                endGame(false);
                break;
            }
        }
        if (state.gameOver) break;
    }
}

function pushRow() {
    // Move existing down
    const r = CONFIG.bubbleRadius;
    const rowHeight = r * 1.732;
    for (const rowArr of state.grid) {
        for (const b of rowArr) b.y += rowHeight;
    }
    // New row at top
    const perRow = Math.floor(canvas.width / (r * 2));
    const newRow = [];
    for (let c = 0; c < perRow; c++) {
        newRow.push({ row: 0, c, x: r + c * r * 2, y: r, color: pickColor(), removing: false });
    }
    // Adjust row indices
    state.grid.unshift(newRow);
    for (let row = 0; row < state.grid.length; row++) {
        for (const b of state.grid[row]) b.row = row;
    }
    rowsEl.textContent = state.grid.length;
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Aim guide
    if (!state.gameOver) drawAimGuide();

    // Draw bubbles
    for (const rowArr of state.grid) {
        for (const b of rowArr) drawBubble(b.x, b.y, b.color);
    }

    // Draw projectile(s)
    for (const p of state.projectiles) {
        drawBubble(p.x, p.y, p.color, true);
    }

    // Shooter base
    ctx.save();
    ctx.translate(state.shooter.x, state.shooter.y);
    ctx.rotate(state.shooter.angle);
    ctx.fillStyle = '#222a37';
    ctx.beginPath();
    ctx.roundRect(-18, -10, 36, 20, 6);
    ctx.fill();
    ctx.restore();

    // Next bubble preview
    if (state.nextColor) {
        drawBubble(state.shooter.x, state.shooter.y + 32, state.nextColor, false, 12);
    }
}

function drawBubble(x, y, color, highlight = false, radiusOverride = null) {
    const r = radiusOverride || CONFIG.bubbleRadius;
    const tinted = getTinted(color);
    if (tinted) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(tinted, x - r, y - r, r * 2, r * 2);
        ctx.restore();
    } else {
        // fallback gradient bubble
        const g = ctx.createRadialGradient(x - r / 3, y - r / 3, r * 0.2, x, y, r);
        g.addColorStop(0, '#fff');
        g.addColorStop(0.1, color);
        g.addColorStop(1, shade(color, -35));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    if (highlight) {
        ctx.strokeStyle = '#ffffff55';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function drawAimGuide() {
    ctx.save();
    ctx.strokeStyle = '#ffffff22';
    ctx.lineWidth = 2;
    const angle = state.shooter.angle;
    let x = state.shooter.x;
    let y = state.shooter.y;
    let vx = Math.cos(angle);
    let vy = Math.sin(angle);
    let len = CONFIG.aimGuideLength;
    while (len > 0) {
        const step = Math.min(12, len);
        const nx = x + vx * step;
        const ny = y + vy * step;
        // bounce preview
        if (nx < CONFIG.bubbleRadius || nx > canvas.width - CONFIG.bubbleRadius) {
            vx = -vx;
        }
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        x = nx; y = ny; len -= step;
    }
    ctx.restore();
}

function shade(col, amt) {
    // hex lighten/darken
    let c = col.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    let r = (num >> 16) + amt; let g = ((num >> 8) & 0xff) + amt; let b = (num & 0xff) + amt;
    r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
    return '#' + (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
}

function gameLoop(ts) {
    if (!state.lastTime) state.lastTime = ts;
    const dt = (ts - state.lastTime) / 1000;
    state.lastTime = ts;
    if (!state.gameOver) update(dt);
    draw();
    requestAnimationFrame(gameLoop);
}

function endGame(win) {
    overlay.innerHTML = `<div class="panel"><h2>${win ? 'You Win!' : 'Game Over'}</h2><p>Score: ${state.score}</p><button id="restart" class="primary">Play Again</button></div>`;
    overlay.classList.add('show');
    document.getElementById('restart').addEventListener('click', () => startGame());
}

function startGame() {
    // fresh state preserving shooter reference
    state.grid = [];
    state.projectiles = [];
    state.score = 0;
    state.shots = 0;
    state.gameOver = false;
    state.lastTime = 0;
    state.spawnTimer = 0;
    initGrid();
    scoreEl.textContent = '0';
    shotsEl.textContent = '0';
    overlay.classList.remove('show');
    state.nextColor = pickColor();
}

canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    state.shooter.angle = Math.atan2(y - state.shooter.y, x - state.shooter.x);
    // clamp upward only
    if (state.shooter.angle > -0.2) state.shooter.angle = -0.2;
    if (state.shooter.angle < -Math.PI + 0.2) state.shooter.angle = -Math.PI + 0.2;
});

canvas.addEventListener('click', () => {
    if (state.gameOver || overlay.classList.contains('show')) return;
    newProjectile();
});

canvas.addEventListener('touchstart', e => {
    const touch = e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    state.shooter.angle = Math.atan2(y - state.shooter.y, x - state.shooter.x);
    if (!state.gameOver && !overlay.classList.contains('show')) newProjectile();
});

// Polyfill roundRect if missing
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        const rr = Array.isArray(r) ? r : [r, r, r, r];
        this.beginPath();
        this.moveTo(x + rr[0], y);
        this.lineTo(x + w - rr[1], y);
        this.quadraticCurveTo(x + w, y, x + w, y + rr[1]);
        this.lineTo(x + w, y + h - rr[2]);
        this.quadraticCurveTo(x + w, y + h, x + w - rr[2], y + h);
        this.lineTo(x + rr[3], y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - rr[3]);
        this.lineTo(x, y + rr[0]);
        this.quadraticCurveTo(x, y, x + rr[0], y);
        return this;
    }
}

// Initialize everything when DOM is ready
function init() {
    // Attach event listeners
    if (startBtn) {
        startBtn.addEventListener('click', startGame);
        console.log('Start button listener attached');
    } else {
        console.error('Start button not found!');
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('Restart game?')) startGame();
        });
    }

    // Start game loop
    requestAnimationFrame(gameLoop);

    // Load assets
    loadAssets().then(() => {
        console.log('Assets loaded successfully');
        // Remove auto-start fallback since button should work now
    }).catch(err => {
        console.warn('Asset loading failed:', err);
    });
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
