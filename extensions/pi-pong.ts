/**
 * pi-pong — terminal Pong vs AI. /pong [easy|hard]
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { visibleWidth } from "@mariozechner/pi-tui";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const SAVE_DIR = join(homedir(), ".pi", "pong");
const SAVE_FILE = join(SAVE_DIR, "save.json");

interface SaveData { pongBestRally: number; breakoutHighScore: number }

function loadSave(): SaveData {
  try { if (existsSync(SAVE_FILE)) return JSON.parse(readFileSync(SAVE_FILE, "utf-8")); } catch {}
  return { pongBestRally: 0, breakoutHighScore: 0 };
}

function saveSave(d: SaveData) {
  try { mkdirSync(SAVE_DIR, { recursive: true }); writeFileSync(SAVE_FILE, JSON.stringify(d)); } catch {}
}

const PADDLE_H = 5;
const BALL_SPEED = 1.2;
const WIN_SCORE = 7;

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const RST = "\x1b[0m";

interface Ball { x: number; y: number; vx: number; vy: number }
interface Trail { x: number; y: number; age: number }

interface PongState {
  w: number; h: number;
  p1y: number; p2y: number; // paddle center Y
  ball: Ball;
  trails: Trail[];
  score1: number; score2: number;
  serving: boolean; serveTimer: number;
  gameOver: boolean;
  difficulty: number; // AI reaction (0-1, higher = harder)
  rallies: number;
  maxRally: number;
  theme: number;
}

const THEMES = [
  { name: "Neon",   ball: "38;2;255;255;0",  p1: "38;2;0;200;255",  p2: "38;2;255;80;80",  trail: "38;2;100;100;0",  net: "38;2;40;40;60" },
  { name: "Matrix", ball: "38;2;0;255;80",    p1: "38;2;0;255;0",    p2: "38;2;0;200;0",    trail: "38;2;0;80;30",    net: "38;2;0;30;0" },
  { name: "Vapor",  ball: "38;2;255;100;200", p1: "38;2;100;200;255",p2: "38;2;255;150;100", trail: "38;2;120;50;90",  net: "38;2;40;30;50" },
  { name: "Fire",   ball: "38;2;255;200;50",  p1: "38;2;255;100;0",  p2: "38;2;200;60;0",   trail: "38;2;100;40;0",   net: "38;2;50;20;0" },
];

function createPong(w: number, h: number, difficulty: number): PongState {
  return {
    w, h, p1y: h / 2, p2y: h / 2,
    ball: { x: w / 2, y: h / 2, vx: BALL_SPEED * (Math.random() > 0.5 ? 1 : -1), vy: (Math.random() - 0.5) * 1.5 },
    trails: [], score1: 0, score2: 0, serving: true, serveTimer: 30,
    gameOver: false, difficulty, rallies: 0, maxRally: 0, theme: 0,
  };
}

function serveBall(s: PongState) {
  s.ball.x = s.w / 2; s.ball.y = s.h / 2;
  const angle = (Math.random() - 0.5) * 1.2;
  const dir = s.score1 > s.score2 ? -1 : 1; // serve toward winner
  s.ball.vx = BALL_SPEED * dir * Math.cos(angle);
  s.ball.vy = BALL_SPEED * Math.sin(angle);
  s.serving = true; s.serveTimer = 20;
  s.rallies = 0;
}

function tickPong(s: PongState) {
  if (s.gameOver) return;
  if (s.serving) { s.serveTimer--; if (s.serveTimer > 0) return; s.serving = false; }

  // Trail
  s.trails.push({ x: s.ball.x, y: s.ball.y, age: 0 });
  if (s.trails.length > 12) s.trails.shift();
  for (const t of s.trails) t.age++;

  // Move ball
  s.ball.x += s.ball.vx;
  s.ball.y += s.ball.vy;

  // Top/bottom bounce
  if (s.ball.y <= 0) { s.ball.y = 0; s.ball.vy = Math.abs(s.ball.vy); }
  if (s.ball.y >= s.h - 1) { s.ball.y = s.h - 1; s.ball.vy = -Math.abs(s.ball.vy); }

  // Paddle collision — player (left, x=2)
  if (s.ball.x <= 3 && s.ball.vx < 0) {
    if (Math.abs(s.ball.y - s.p1y) < PADDLE_H / 2 + 0.5) {
      s.ball.vx = Math.abs(s.ball.vx) * 1.05; // speed up slightly
      s.ball.vy += (s.ball.y - s.p1y) * 0.3; // angle based on paddle hit
      s.rallies++;
      s.maxRally = Math.max(s.maxRally, s.rallies);
    }
  }
  // Paddle collision — AI (right, x=w-3)
  if (s.ball.x >= s.w - 4 && s.ball.vx > 0) {
    if (Math.abs(s.ball.y - s.p2y) < PADDLE_H / 2 + 0.5) {
      s.ball.vx = -Math.abs(s.ball.vx) * 1.05;
      s.ball.vy += (s.ball.y - s.p2y) * 0.3;
      s.rallies++;
      s.maxRally = Math.max(s.maxRally, s.rallies);
    }
  }

  // Cap ball speed
  const speed = Math.sqrt(s.ball.vx * s.ball.vx + s.ball.vy * s.ball.vy);
  if (speed > 3) { s.ball.vx *= 3 / speed; s.ball.vy *= 3 / speed; }

  // Score
  if (s.ball.x < 0) { s.score2++; if (s.score2 >= WIN_SCORE) s.gameOver = true; else serveBall(s); }
  if (s.ball.x > s.w) { s.score1++; if (s.score1 >= WIN_SCORE) s.gameOver = true; else serveBall(s); }

  // AI movement
  const target = s.ball.y + s.ball.vy * 3; // predict
  const diff = target - s.p2y;
  const aiSpeed = 0.3 + s.difficulty * 0.7;
  // Add imperfection
  const noise = (Math.random() - 0.5) * (1 - s.difficulty) * 3;
  s.p2y += Math.sign(diff + noise) * Math.min(Math.abs(diff), aiSpeed);
  s.p2y = Math.max(PADDLE_H / 2, Math.min(s.h - PADDLE_H / 2, s.p2y));
}

class PongComponent {
  private s: PongState;
  private timer: ReturnType<typeof setInterval> | null = null;
  private paused = false;
  private version = 0;
  private save: SaveData;

  constructor(private tui: any, private done: (v: undefined) => void, difficulty: number) {
    this.save = loadSave();
    this.s = createPong(60, 20, difficulty);
    this.timer = setInterval(() => {
      if (!this.paused) {
        tickPong(this.s);
        if (this.s.maxRally > this.save.pongBestRally) {
          this.save.pongBestRally = this.s.maxRally; saveSave(this.save);
        }
        this.version++; this.tui.requestRender();
      }
    }, 33);
  }

  handleInput(data: string) {
    if (data === "q" || data === "Q" || data === "\x03") { this.dispose(); this.done(undefined); return; }
    if (data === "\x1b" || data === "p" || data === "P") { this.paused = !this.paused; this.version++; this.tui.requestRender(); return; }
    if (this.paused) { this.paused = false; this.version++; this.tui.requestRender(); return; }
    if (this.s.gameOver && (data === "r" || data === "R")) {
      const d = this.s.difficulty, th = this.s.theme;
      this.s = createPong(60, 20, d); this.s.theme = th; this.version++;
      this.tui.requestRender(); return;
    }
    if (data === "t" || data === "T") { this.s.theme = (this.s.theme + 1) % THEMES.length; this.version++; this.tui.requestRender(); }
    // Move paddle
    if (data === "w" || data === "W" || data === "\x1b[A") { this.s.p1y = Math.max(PADDLE_H / 2, this.s.p1y - 1.5); this.version++; this.tui.requestRender(); }
    if (data === "s" || data === "S" || data === "\x1b[B") { this.s.p1y = Math.min(this.s.h - PADDLE_H / 2, this.s.p1y + 1.5); this.version++; this.tui.requestRender(); }
  }

  invalidate() {}

  render(width: number): string[] {
    const th = THEMES[this.s.theme];
    const lines: string[] = [];
    const bw = this.s.w, bh = this.s.h;
    const totalW = bw * 2 + 2;

    // Score header
    lines.push(dim(` ╭${"─".repeat(totalW)}╮`));
    const allTimeBest = Math.max(this.s.maxRally, this.save.pongBestRally);
    const scoreStr = ` ${bold(cyan("PONG"))} │ ${green(String(this.s.score1))} : ${red(String(this.s.score2))} │ Rally: ${yellow(String(this.s.rallies))} │ Best: ${yellow(String(allTimeBest))} │ ${dim(THEMES[this.s.theme].name)}`;
    const sVis = visibleWidth(scoreStr);
    lines.push(dim(" │") + scoreStr + " ".repeat(Math.max(0, totalW - sVis)) + dim("│"));
    lines.push(dim(` ├${"─".repeat(totalW)}┤`));

    // Build grid
    const grid: string[][] = Array.from({ length: bh }, () => Array(bw).fill("  "));

    // Net (center dashed line)
    const cx = Math.floor(bw / 2);
    for (let y = 0; y < bh; y++) {
      if (y % 2 === 0) grid[y][cx] = `\x1b[${th.net}m│ ${RST}`;
    }

    // Trails
    for (const t of this.s.trails) {
      const tx = Math.round(t.x), ty = Math.round(t.y);
      if (tx >= 0 && tx < bw && ty >= 0 && ty < bh) {
        const fade = Math.max(0, 1 - t.age / 12);
        if (fade > 0.1) grid[ty][tx] = `\x1b[${th.trail}m░░${RST}`;
      }
    }

    // Paddles
    for (let dy = -Math.floor(PADDLE_H / 2); dy <= Math.floor(PADDLE_H / 2); dy++) {
      const y1 = Math.round(this.s.p1y) + dy, y2 = Math.round(this.s.p2y) + dy;
      if (y1 >= 0 && y1 < bh) grid[y1][1] = `\x1b[${th.p1}m██${RST}`;
      if (y2 >= 0 && y2 < bh) grid[y2][bw - 2] = `\x1b[${th.p2}m██${RST}`;
    }

    // Ball
    const bx = Math.round(this.s.ball.x), by = Math.round(this.s.ball.y);
    if (bx >= 0 && bx < bw && by >= 0 && by < bh) grid[by][bx] = `\x1b[${th.ball};1m██${RST}`;

    // Serving overlay
    if (this.s.serving) {
      const msg = "  SERVE  ";
      const mx = Math.floor(bw / 2 - msg.length / 2);
      const my = Math.floor(bh / 2);
      for (let i = 0; i < msg.length && mx + i < bw; i++) {
        if (mx + i >= 0) grid[my][mx + i] = `\x1b[${th.ball};1m${msg[i]} ${RST}`;
      }
    }

    // Game over overlay
    if (this.s.gameOver) {
      const winner = this.s.score1 >= WIN_SCORE ? "YOU WIN!" : "AI WINS!";
      const color = this.s.score1 >= WIN_SCORE ? "32;1" : "31;1";
      const my = Math.floor(bh / 2), mx = Math.floor(bw / 2 - winner.length / 2);
      for (let i = 0; i < winner.length && mx + i < bw; i++) {
        if (mx + i >= 0) grid[my][mx + i] = `\x1b[${color}m${winner[i]} ${RST}`;
      }
    }

    // Render grid
    for (let y = 0; y < bh; y++) {
      lines.push(dim(" │") + grid[y].join("") + dim(" │"));
    }

    // Footer
    lines.push(dim(` ├${"─".repeat(totalW)}┤`));
    let footer: string;
    if (this.paused) footer = `${yellow(bold("PAUSED"))} — any key to resume`;
    else if (this.s.gameOver) footer = `${this.s.score1 >= WIN_SCORE ? green(bold("YOU WIN!")) : red(bold("AI WINS!"))} — ${bold("R")} restart  ${bold("Q")} quit`;
    else footer = `↑↓/WS move  T=theme  P=pause  Q=quit`;
    const fVis = visibleWidth(footer);
    lines.push(dim(" │") + ` ${footer}` + " ".repeat(Math.max(0, totalW - fVis - 1)) + dim("│"));
    lines.push(dim(` ╰${"─".repeat(totalW)}╯`));

    return lines.map(l => l + " ".repeat(Math.max(0, width - visibleWidth(l))));
  }

  dispose() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
}

// ═══════════════════════════════════════════════════════════════════════════
// BREAKOUT — brick breaker with powerups
// ═══════════════════════════════════════════════════════════════════════════

const BK_W = 40, BK_H = 24, BK_COLS = 10, BK_ROWS = 6, BK_BRICK_W = 4;
const BRICK_COLORS = ["31", "33", "32", "36", "34", "35"]; // row colors

interface Brick { alive: boolean; color: string; hits: number }
interface BreakoutState {
  bricks: Brick[][];
  ballX: number; ballY: number; bvx: number; bvy: number;
  padX: number; padW: number;
  score: number; lives: number; level: number;
  gameOver: boolean; won: boolean;
  theme: number;
  trails: { x: number; y: number; age: number }[];
  // powerups
  powers: { x: number; y: number; type: string; vy: number }[];
  sticky: number; // ticks ball sticks to paddle
  wide: number;   // ticks paddle is wide
  multi: { x: number; y: number; vx: number; vy: number }[]; // extra balls
}

function createBricks(level: number): Brick[][] {
  const rows = Math.min(BK_ROWS + Math.floor(level / 2), 10);
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: BK_COLS }, () => ({
      alive: true, color: BRICK_COLORS[r % BRICK_COLORS.length],
      hits: level > 3 && r < 2 ? 2 : 1, // top rows take 2 hits at higher levels
    }))
  );
}

function createBreakout(level = 1): BreakoutState {
  return {
    bricks: createBricks(level),
    ballX: BK_W / 2, ballY: BK_H - 3, bvx: 0.8, bvy: -0.8,
    padX: BK_W / 2, padW: 6,
    score: 0, lives: 3, level, gameOver: false, won: false,
    theme: 0, trails: [], powers: [], sticky: 30, wide: 0, multi: [],
  };
}

function tickBreakout(s: BreakoutState) {
  if (s.gameOver) return;
  if (s.sticky > 0) { s.sticky--; s.ballX = s.padX; s.ballY = BK_H - 3; return; }

  // Powerup effects
  if (s.wide > 0) { s.wide--; s.padW = 10; } else { s.padW = 6; }

  // Trail
  s.trails.push({ x: s.ballX, y: s.ballY, age: 0 });
  if (s.trails.length > 8) s.trails.shift();
  for (const t of s.trails) t.age++;

  // Move ball
  const balls = [{ x: s.ballX, y: s.ballY, vx: s.bvx, vy: s.bvy, main: true }, ...s.multi.map(m => ({ ...m, main: false }))];

  for (const b of balls) {
    b.x += b.vx; b.y += b.vy;

    // Wall bounce
    if (b.x <= 0) { b.x = 0; b.vx = Math.abs(b.vx); }
    if (b.x >= BK_W - 1) { b.x = BK_W - 1; b.vx = -Math.abs(b.vx); }
    if (b.y <= 0) { b.y = 0; b.vy = Math.abs(b.vy); }

    // Paddle bounce
    if (b.y >= BK_H - 2 && b.vy > 0) {
      if (Math.abs(b.x - s.padX) < s.padW / 2 + 0.5) {
        b.vy = -Math.abs(b.vy);
        b.vx += (b.x - s.padX) * 0.15; // angle control
        b.y = BK_H - 3;
      }
    }

    // Brick collision
    const brickH = 1;
    for (let r = 0; r < s.bricks.length; r++) {
      for (let c = 0; c < BK_COLS; c++) {
        const br = s.bricks[r][c];
        if (!br.alive) continue;
        const bx = c * BK_BRICK_W, by = r * brickH + 2;
        if (b.x >= bx && b.x < bx + BK_BRICK_W && b.y >= by && b.y < by + brickH) {
          br.hits--;
          if (br.hits <= 0) {
            br.alive = false;
            s.score += 10 * s.level;
            // Random powerup (15% chance)
            if (Math.random() < 0.15) {
              const types = ["wide", "life", "multi", "slow"];
              s.powers.push({ x: bx + BK_BRICK_W / 2, y: by, type: types[Math.floor(Math.random() * types.length)], vy: 0.5 });
            }
          }
          b.vy = -b.vy;
        }
      }
    }

    // Ball lost
    if (b.y > BK_H && b.main) {
      s.lives--;
      if (s.lives <= 0) { s.gameOver = true; return; }
      s.sticky = 30;
      s.multi = [];
    }

    // Write back
    if (b.main) { s.ballX = b.x; s.ballY = b.y; s.bvx = b.vx; s.bvy = b.vy; }
    else {
      const mi = balls.indexOf(b) - 1; // offset by main ball
      if (mi >= 0 && mi < s.multi.length) { s.multi[mi].x = b.x; s.multi[mi].y = b.y; s.multi[mi].vx = b.vx; s.multi[mi].vy = b.vy; }
    }
  }

  // Update multi balls
  s.multi = s.multi.filter(m => m.y <= BK_H);

  // Powerup fall + collect
  for (let i = s.powers.length - 1; i >= 0; i--) {
    const p = s.powers[i]; p.y += p.vy;
    if (p.y > BK_H) { s.powers.splice(i, 1); continue; }
    if (p.y >= BK_H - 2 && Math.abs(p.x - s.padX) < s.padW / 2 + 1) {
      s.powers.splice(i, 1);
      if (p.type === "wide") s.wide = 120;
      else if (p.type === "life") s.lives = Math.min(5, s.lives + 1);
      else if (p.type === "multi") {
        s.multi.push({ x: s.ballX, y: s.ballY, vx: s.bvx + 0.3, vy: s.bvy });
        s.multi.push({ x: s.ballX, y: s.ballY, vx: s.bvx - 0.3, vy: s.bvy });
      } else if (p.type === "slow") { s.bvx *= 0.7; s.bvy *= 0.7; }
      s.score += 25;
    }
  }

  // Check win
  if (s.bricks.every(row => row.every(b => !b.alive))) {
    s.level++;
    s.bricks = createBricks(s.level);
    s.sticky = 30;
    s.multi = [];
    const speed = Math.min(1.5, 0.8 + s.level * 0.08);
    s.bvx = speed * Math.sign(s.bvx || 1);
    s.bvy = -speed;
  }
}

class BreakoutComponent {
  private s: BreakoutState;
  private timer: ReturnType<typeof setInterval> | null = null;
  private paused = false;
  private version = 0;
  private save: SaveData;

  constructor(private tui: any, private done: (v: undefined) => void) {
    this.save = loadSave();
    this.s = createBreakout();
    this.timer = setInterval(() => {
      if (!this.paused) {
        tickBreakout(this.s);
        if (this.s.score > this.save.breakoutHighScore) {
          this.save.breakoutHighScore = this.s.score; saveSave(this.save);
        }
        this.version++; this.tui.requestRender();
      }
    }, 33);
  }

  handleInput(data: string) {
    if (data === "q" || data === "Q" || data === "\x03") { this.dispose(); this.done(undefined); return; }
    if (data === "\x1b" || data === "p" || data === "P") { this.paused = !this.paused; this.version++; this.tui.requestRender(); return; }
    if (this.paused) { this.paused = false; return; }
    if (this.s.gameOver && (data === "r" || data === "R")) { this.s = createBreakout(); this.version++; this.tui.requestRender(); return; }
    if (data === "t" || data === "T") { this.s.theme = (this.s.theme + 1) % THEMES.length; this.version++; this.tui.requestRender(); }
    if (data === "\x1b[D" || data === "a" || data === "A") { this.s.padX = Math.max(this.s.padW / 2, this.s.padX - 2); this.version++; this.tui.requestRender(); }
    if (data === "\x1b[C" || data === "d" || data === "D") { this.s.padX = Math.min(BK_W - this.s.padW / 2, this.s.padX + 2); this.version++; this.tui.requestRender(); }
    if (data === " " && this.s.sticky > 0) { this.s.sticky = 0; } // launch ball
  }

  invalidate() {}

  render(width: number): string[] {
    const th = THEMES[this.s.theme];
    const lines: string[] = [];
    const totalW = BK_W * 2;

    // Build grid
    const grid: string[][] = Array.from({ length: BK_H }, () => Array(BK_W).fill("  "));

    // Bricks
    for (let r = 0; r < this.s.bricks.length; r++) {
      for (let c = 0; c < BK_COLS; c++) {
        const br = this.s.bricks[r][c];
        if (!br.alive) continue;
        const ch = br.hits > 1 ? "▓▓" : "██";
        for (let dx = 0; dx < BK_BRICK_W; dx++) {
          const x = c * BK_BRICK_W + dx, y = r + 2;
          if (x < BK_W && y < BK_H) grid[y][x] = `\x1b[${br.color}m${ch}${RST}`;
        }
      }
    }

    // Powerups falling
    const pwChar: Record<string, string> = { wide: `\x1b[33m◆ ${RST}`, life: `\x1b[31m♥ ${RST}`, multi: `\x1b[36m✦ ${RST}`, slow: `\x1b[32m▼ ${RST}` };
    for (const p of this.s.powers) {
      const px = Math.round(p.x), py = Math.round(p.y);
      if (px >= 0 && px < BK_W && py >= 0 && py < BK_H) grid[py][px] = pwChar[p.type] || "? ";
    }

    // Trails
    for (const t of this.s.trails) {
      const tx = Math.round(t.x), ty = Math.round(t.y);
      if (tx >= 0 && tx < BK_W && ty >= 0 && ty < BK_H && t.age < 6)
        grid[ty][tx] = `\x1b[${th.trail}m░░${RST}`;
    }

    // Paddle
    const padLeft = Math.max(0, Math.round(this.s.padX - this.s.padW / 2));
    for (let dx = 0; dx < this.s.padW && padLeft + dx < BK_W; dx++) {
      grid[BK_H - 1][padLeft + dx] = `\x1b[${th.p1};1m▀▀${RST}`;
    }

    // Ball
    const bx = Math.round(this.s.ballX), by = Math.round(this.s.ballY);
    if (bx >= 0 && bx < BK_W && by >= 0 && by < BK_H) grid[by][bx] = `\x1b[${th.ball};1m██${RST}`;
    // Multi balls
    for (const m of this.s.multi) {
      const mx = Math.round(m.x), my = Math.round(m.y);
      if (mx >= 0 && mx < BK_W && my >= 0 && my < BK_H) grid[my][mx] = `\x1b[${th.ball}m▪▪${RST}`;
    }

    // Header
    lines.push(dim(` ╭${"─".repeat(totalW + 2)}╮`));
    const best = Math.max(this.s.score, this.save.breakoutHighScore);
    const hdr = ` ${bold(yellow("BREAKOUT"))} │ Score ${yellow(String(this.s.score))} │ Hi ${yellow(String(best))} │ Lv ${cyan(String(this.s.level))} │ ${"♥".repeat(this.s.lives)}${dim("♡".repeat(5 - this.s.lives))} │ ${dim(THEMES[this.s.theme].name)}`;
    const hVis = visibleWidth(hdr);
    lines.push(dim(" │") + hdr + " ".repeat(Math.max(0, totalW + 2 - hVis)) + dim("│"));
    lines.push(dim(` ├${"─".repeat(totalW + 2)}┤`));

    for (let y = 0; y < BK_H; y++) {
      lines.push(dim(" │ ") + grid[y].join("") + dim(" │"));
    }

    lines.push(dim(` ├${"─".repeat(totalW + 2)}┤`));
    let footer: string;
    if (this.paused) footer = `${yellow(bold("PAUSED"))}`;
    else if (this.s.gameOver) footer = `${red(bold("GAME OVER"))} Score: ${this.s.score} — ${bold("R")} restart  ${bold("Q")} quit`;
    else if (this.s.sticky > 0) footer = `${bold("SPACE")} to launch — ←→/AD move`;
    else footer = `←→/AD move  T=theme  P=pause  Q=quit`;
    const fVis = visibleWidth(footer);
    lines.push(dim(" │") + ` ${footer}` + " ".repeat(Math.max(0, totalW + 1 - fVis)) + dim("│"));
    lines.push(dim(` ╰${"─".repeat(totalW + 2)}╯`));

    return lines.map(l => l + " ".repeat(Math.max(0, width - visibleWidth(l))));
  }

  dispose() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("pong", {
    description: "Play Pong vs AI. /pong [easy|hard]. ↑↓/WS=move, T=theme, P=pause.",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) { ctx.ui.notify("Pong requires interactive mode", "error"); return; }
      const arg = (args || "").trim().toLowerCase();
      const diff = arg === "easy" ? 0.3 : arg === "hard" ? 0.9 : 0.6;
      await ctx.ui.custom((tui: any, _t: any, _k: any, done: (v: undefined) => void) => new PongComponent(tui, done, diff));
    },
  });

  pi.registerCommand("breakout", {
    description: "Play Breakout! Brick breaker with powerups. ←→/AD=move, SPACE=launch, T=theme.",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) { ctx.ui.notify("Breakout requires interactive mode", "error"); return; }
      await ctx.ui.custom((tui: any, _t: any, _k: any, done: (v: undefined) => void) => new BreakoutComponent(tui, done));
    },
  });
}
