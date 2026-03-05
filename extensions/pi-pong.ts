/**
 * pi-pong — terminal Pong vs AI. /pong [easy|hard]
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { visibleWidth } from "@mariozechner/pi-tui";

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

  constructor(private tui: any, private done: (v: undefined) => void, difficulty: number) {
    this.s = createPong(60, 20, difficulty);
    this.timer = setInterval(() => {
      if (!this.paused) { tickPong(this.s); this.version++; this.tui.requestRender(); }
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
    const scoreStr = ` ${bold(cyan("PONG"))} │ ${green(String(this.s.score1))} : ${red(String(this.s.score2))} │ Rally: ${yellow(String(this.s.rallies))} │ Best: ${yellow(String(this.s.maxRally))} │ ${dim(THEMES[this.s.theme].name)}`;
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
}
