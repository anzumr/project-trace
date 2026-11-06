// Two real Chrome guests play Bow 1v1 in a private room against the real client and Socket.IO server:
// pick the mode, ready up, walk out from cover, a full-draw body shot, a headshot kill, the respawn swap and the air jump.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium, type Page } from 'playwright-core';
import { createServer as createViteServer } from 'vite';
import { createGameServer } from '../apps/server/src/server';
import { BOW, arrowDrop } from '../packages/shared/src/bow';

const port = 4188, errors: string[] = [], directory = await mkdtemp(join(tmpdir(), 'bow-browser-')), shots = resolve('test-results');
process.env.ALLOWED_ORIGINS = `http://127.0.0.1:${port}`;
const until = async (check: () => boolean | Promise<boolean>, what: string, timeout = 30000) => { const start = Date.now(); while (!await check()) { if (Date.now() - start > timeout) throw new Error('Timed out: ' + what); await new Promise(r => setTimeout(r, 50)); } };
const server = createGameServer({ outboxDirectory: directory, resultSink: async () => {}, rankLookup: null });
await new Promise<void>(r => server.http.listen(0, '127.0.0.1', r));
const vite = await createViteServer({ configFile: false, root: resolve('apps/client'), envDir: false, logLevel: 'error',
  define: { 'import.meta.env.VITE_SUPABASE_URL': 'undefined', 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': 'undefined' },
  server: { host: '127.0.0.1', port, strictPort: true, proxy: { '/socket.io': { target: `http://127.0.0.1:${(server.http.address() as AddressInfo).port}`, ws: true } } },
  plugins: [{ name: 'test-only-engine-access', enforce: 'pre', transform(code, id) { if (id.replaceAll('\\', '/').endsWith('/src/game/Engine.ts')) return code.replace('this.settings = settings;', 'this.settings = settings; (window as any).__traceEngine = this;'); } }] });
await vite.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
try {
  await mkdir(shots, { recursive: true });
  const pages: Page[] = [];
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext({ viewport: { width: 1100, height: 680 } });
    await context.addInitScript(() => { if (!localStorage.getItem('trace.settings')) localStorage.setItem('trace.settings', JSON.stringify({ graphics: 'competitive', frameCap: 60, renderScale: 0.6 })); });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${port}`); pages.push(page);
  }
  const [a, b] = pages;
  const engine = <T>(p: Page, body: string) => p.evaluate(`(e => (${body}))(window.__traceEngine)`) as Promise<T>;
  await a.getByRole('button', { name: /^Private room/ }).click(); await a.getByRole('button', { name: 'Create room', exact: true }).click();
  const code = (await a.locator('.room-code strong').textContent())!.trim();
  await b.getByRole('button', { name: /^Private room/ }).click(); await b.getByLabel('Room code').fill(code); await b.getByRole('button', { name: 'Join', exact: true }).click();
  await a.getByRole('button', { name: /^Bow 1v1/ }).click();
  await until(async () => (await b.getByRole('button', { name: /^Bow 1v1/ }).getAttribute('aria-pressed')) === 'true', 'the guest sees Bow 1v1');
  for (const p of pages) await p.getByRole('button', { name: 'APPROVE MODE & READY', exact: true }).click();
  await until(async () => await engine<boolean>(a, "e.network.snapshot?.phase === 'live' && e.locked") && await engine<boolean>(b, 'e.locked'), 'live with the mouse captured');
  // Headless pointer lock can forward desktop mouse motion; steer by setting the view directly.
  for (const p of pages) await engine(p, "(document.removeEventListener('mousemove', e.mouse), true)");
  const walk = async (p: Page, key: string, axis: 'x' | 'z', value: number, up: boolean, yaw: number) => {
    await engine(p, `(e.yaw = ${yaw}, e.pitch = 0, true)`); await p.keyboard.down(key);
    try { await until(async () => { const v = await engine<number>(p, `e.body.${axis}`); return up ? v >= value : v <= value; }, `walk ${key}`, 12000); } finally { await p.keyboard.up(key); }
  };
  // Out from behind the spawn walls to the open side of the pillar, about 12 m apart.
  await Promise.all([(async () => { await walk(a, 'd', 'x', 5, true, 0); await walk(a, 'w', 'z', 6.5, false, 0); })(), (async () => { await walk(b, 'a', 'x', 5, true, -Math.PI); await walk(b, 'w', 'z', -6.5, true, -Math.PI); })()]);
  await a.waitForTimeout(500);
  // Full-draw aim at height `y` on the opponent, lifted for the arrow's drop over the distance.
  const aim = async (y: number) => {
    const { me, them } = await engine<{ me: { x: number; y: number; z: number }; them: { x: number; y: number; z: number } }>(a, '({ me: e.body, them: e.network.snapshot.players.find(p => p.id !== e.network.id).body })');
    const dx = them.x - me.x, dz = them.z - me.z, d = Math.hypot(dx, dz), pitch = Math.atan2(y + them.y - (me.y + 1.6) + arrowDrop(1, d / BOW.maxSpeed).drop, d);
    await engine(a, `(e.yaw = ${Math.atan2(-dx, -dz)}, e.pitch = ${pitch}, true)`);
  };
  const opponentHp = () => engine<number>(a, 'e.network.snapshot.players.find(p => p.id !== e.network.id).hp');
  await aim(1.15); await a.mouse.down(); await a.waitForTimeout(950);
  assert.equal(await engine<number>(a, 'e.bowView.charge'), 1, 'the predicted draw is full after 0.75 s');
  await a.screenshot({ path: join(shots, 'bow-first-person-draw.png') }); await b.screenshot({ path: join(shots, 'bow-opponent-drawing.png') });
  await a.mouse.up();
  await until(async () => await opponentHp() < 100, 'the body shot lands', 5000);
  assert.equal(await opponentHp(), 25, 'a full draw to the torso does 75');
  await a.waitForTimeout(500); await aim(1.62); await a.mouse.down(); await a.waitForTimeout(900); await a.mouse.up();
  await until(() => engine<boolean>(a, "e.network.snapshot.phase === 'roundEnd'"), 'the headshot kills', 5000);
  assert.deepEqual(await engine<number[]>(a, 'e.network.snapshot.players.map(p => p.wins)'), [1, 0]);
  await a.waitForTimeout(400); await a.screenshot({ path: join(shots, 'bow-kill.png') });
  await until(() => engine<boolean>(a, "e.network.snapshot.phase === 'live'"), 'respawn 2 s later', 5000);
  assert.ok(await engine<number>(a, 'e.body.z') < 0, 'sides swap after a kill');
  assert.deepEqual(await engine<number[]>(a, 'e.network.snapshot.players.map(p => p.hp)'), [100, 100]);
  await engine(a, '(e.yaw = Math.PI, e.pitch = 0, true)'); await a.keyboard.press('Space'); await a.waitForTimeout(250);
  await a.keyboard.down('d'); await a.keyboard.press('Space'); await a.waitForTimeout(200); await a.keyboard.up('d');
  const dash = await engine<{ x: number; ready: boolean }>(a, '({ x: e.body.x, ready: e.body.airReady })');
  assert.ok(dash.x < -1 && dash.ready === false, 'the air jump dashed sideways');
  await a.waitForTimeout(600); await a.screenshot({ path: join(shots, 'bow-air-cooldown.png') });
  assert.ok(await a.locator('.air-bar b').textContent() !== 'READY', 'the air-jump bar shows the cooldown');
  console.log('PASS: Bow 1v1 in two browsers — mode pick, full-draw body shot (75), headshot kill, respawn with swapped sides, air-jump dash.');
  // Bow practice: leave, pick Hard from the Play screen, and the archer bot comes out of cover and shoots.
  await a.evaluate(() => document.exitPointerLock()); await a.getByRole('button', { name: 'Leave room', exact: true }).click();
  await a.getByRole('button', { name: /^Bow practice/ }).click(); await a.getByRole('button', { name: 'Hard', exact: true }).click();
  await a.getByRole('heading', { name: 'Bow practice' }).waitFor();
  await a.getByRole('button', { name: 'START PRACTICE', exact: true }).click();
  await until(() => engine<boolean>(a, "e.network.snapshot?.phase === 'live' && e.locked"), 'practice is live');
  await engine(a, "(document.removeEventListener('mousemove', e.mouse), true)");
  const bot = () => engine<{ name: string; shots: number; hits: number }>(a, '(b => ({ name: b.name, shots: b.bow.shots, hits: b.bow.hits }))(e.network.snapshot.players.find(p => p.bot))');
  assert.equal((await bot()).name, 'Hard archer [BOT]');
  await until(async () => (await bot()).shots > 0, 'the bot shoots', 30000);
  await a.screenshot({ path: join(shots, 'bow-practice.png') });
  assert.deepEqual(errors, []);
  console.log(`PASS: Bow practice against the Hard archer bot (${(await bot()).shots} shots in), no page errors.`);
} finally { await browser.close(); await vite.close(); await server.close(); await rm(directory, { recursive: true, force: true }); }
