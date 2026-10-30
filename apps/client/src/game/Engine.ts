import * as THREE from 'three';
import { CONFIG, COVER, MODES, spawn, move } from '@trace/shared';
import { Practice, BOT_MODEL } from '@trace/shared/practice';
import type { PlayerInput, Snapshot, QueueState } from '@trace/shared/protocol';
import { createBotModel } from './BotModel';
import { Network } from '../net/Network';
import { TargetHealth } from './TargetHealth';
import { FrameGate, FrameMetrics, type FrameStats } from './Performance';

import type { Settings } from '../ui/settings';
export type { Settings } from '../ui/settings';
export type Hud = { hp: number; ownHp: number; hit: boolean; headshot: boolean; locked: boolean; seconds: number; damage: number; fps: number; ping: number; wave: number; kills: number; speed: number; size: number; circle: boolean; diagnostics?: FrameStats & { skippedTicks:number; serverSkippedTicks:number; serverTickMs:number; drawCalls:number; snapshotAge:number; connection:string } };
export class Engine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(85, 1, 0.05, 110);
  private body = spawn();
  private target: THREE.Mesh;
  private practice = new Practice();
  private sphereGeometry = new THREE.SphereGeometry(0.5, 24, 16);
  private bot = createBotModel();
  private trainingModel = this.bot.group;
  private trainingMaterial = this.bot.bodyMaterial;
  private healthBar = new TargetHealth();
  readonly network: Network;
  private pending: PlayerInput[] = [];
  private seq = 0;
  private match = -1;
  private roundSerial = -1;
  private modeRevision = -1;
  private lastPhase: Snapshot['phase'] = 'lobby';
  private roomCode = '';
  private ownHp: number = CONFIG.hp;
  private firing = false;
  private keys = new Set<string>();
  private yaw = 0;
  private pitch = 0;
  private jump = false;
  private hp: number = CONFIG.hp;
  private tracked = 0;
  private totalDamage = 0;
  private hit = false;
  private accumulator = 0;
  private previous = 0;
  private lastHud = 0;
  private metrics = new FrameMetrics();
  private gate = new FrameGate();
  private stats = this.metrics.stats();
  private lastStats = 0;
  private lastRender = 0;
  private cpuWork = 0;
  private skippedTicks = 0;
  private graphicsKey = '';
  private decoration = new THREE.Group();
  private frame = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver;
  settings: Settings;
  constructor(private host: HTMLElement, settings: Settings, private onHud: (hud: Hud) => void, private onError: (message: string) => void, onRoom: (snapshot: Snapshot | null) => void, onQueue: (state: QueueState) => void = () => {}) {
    this.settings = settings;
    this.network = new Network(state => { if (!state) { this.reset(); this.roomCode = ''; this.match = -1; this.pending = []; this.blur(); } onRoom(state); }, onError, this.acceptSnapshot, onQueue);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#0a1722');
    this.scene.fog = new THREE.Fog('#0a1722', 25, 65);
    this.scene.add(this.decoration);
    this.scene.add(new THREE.HemisphereLight(0xd6f5ff, 0x283242, 2.7));
    const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(5, 15, 7); this.scene.add(sun);
    const block = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
      mesh.position.set(x, y, z); this.scene.add(mesh); return mesh;
    };
    block(28, 0.3, 28, 0, -0.15, 0, '#172c38');
    const grid = new THREE.GridHelper(28, 28, '#3b6471', '#25424e'); grid.position.y = 0.003; this.decoration.add(grid);
    for (const sign of [-1, 1]) {
      block(29, 4, 0.5, 0, 2, sign * 14.25, '#233d4a');
      block(0.5, 4, 28, sign * 14.25, 2, 0, '#233d4a');
      block(28, 0.06, 0.07, 0, 0.08, sign * 13.95, '#6df5df');
      block(0.07, 0.06, 28, sign * 13.95, 0.08, 0, '#6df5df');
      for (const x of [-10, -5, 0, 5, 10]) this.decoration.add(block(0.14, 2.6, 0.08, x, 2, sign * 13.97, '#427586'));
    }
    block(3.6, 2.6, 1, 0, 1.3, -0.5, '#425b69');
    block(3.6, 0.05, 1, 0, 2.63, -0.5, '#6df5df');
    this.target = new THREE.Mesh(this.sphereGeometry,new THREE.MeshStandardMaterial({color:'#ff657e',roughness:0.8}));this.scene.add(this.target);
    this.scene.add(this.trainingModel);
    this.scene.add(this.healthBar.sprite);
    this.camera.rotation.order = 'YXZ';
    this.resizeObserver = new ResizeObserver(this.resize); this.resizeObserver.observe(host); this.resize();
    document.addEventListener('keydown', this.keydown); document.addEventListener('keyup', this.keyup);
    document.addEventListener('mousemove', this.mouse); document.addEventListener('pointerlockchange', this.lockChange);
    document.addEventListener('mousedown', this.mouseDown); document.addEventListener('mouseup', this.mouseUp);
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
    window.addEventListener('blur', this.blur); document.addEventListener('visibilitychange', this.visibility);
    this.frame = requestAnimationFrame(this.loop);
  }
  get locked() { return document.pointerLockElement === this.renderer.domElement; }
  exportDiagnostics() {
    const report={at:new Date().toISOString(),userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,viewport:{width:this.host.clientWidth,height:this.host.clientHeight,dpr:devicePixelRatio},settings:this.settings,frames:this.metrics.stats(),clientSkippedTicks:this.skippedTicks,server:this.network.snapshot?.serverMetrics,notes:'Rendered-frame intervals and JS work only; CPU work excludes asynchronous GPU work. Not an input-latency measurement.'};
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='trace-performance.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  private acceptSnapshot = (state: Snapshot) => {
    const me = state.players.find(p => p.id === this.network.id); if (!me) return;
    if (state.match !== this.match || state.code !== this.roomCode || state.roundSerial !== this.roundSerial || state.modeRevision !== this.modeRevision) {
      if (this.modeRevision >= 0 && state.modeRevision !== this.modeRevision && this.locked) this.blur();
      this.roundSerial = state.roundSerial; this.modeRevision = state.modeRevision;
      this.match = state.match; this.roomCode = state.code; this.pending = []; this.yaw = me.yaw; this.pitch = me.pitch; this.keys.clear(); this.firing = false; this.jump = false;
    }
    this.body = { ...me.body };
    this.pending = this.pending.filter(input => input.seq > me.ack);
    if (!state.paused && (state.phase === 'live' || state.phase === 'suddenDeath')) for (const input of this.pending) move(this.body, input, CONFIG.tick, [COVER], this.network.snapshot?.mode ?? 'standard');
    else { this.pending = []; if (this.locked && state.phase === 'finished' && this.lastPhase !== 'finished') this.blur(); }
    this.lastPhase = state.phase;
    this.ownHp = me.hp; this.hp = state.players.find(p => p.id !== me.id)?.hp ?? CONFIG.hp;
    this.hit = (state.phase === 'live' || state.phase === 'suddenDeath') && me.hit; this.tracked = me.trackingSeconds; this.totalDamage = me.damage;
  };
  async engage() {
    if (!this.renderer.domElement.requestPointerLock) { this.onError('This browser does not support pointer lock. Use a desktop browser with a mouse.'); return; }
    try { await this.renderer.domElement.requestPointerLock({ unadjustedMovement: true }); }
    catch { try { await this.renderer.domElement.requestPointerLock(); } catch { this.onError('Mouse capture was denied. Click Enter arena to retry.'); } }
  }
  reset() { if (this.network.snapshot) return; this.practice = new Practice(); this.hp = CONFIG.hp; this.ownHp = CONFIG.hp; this.tracked = 0; this.totalDamage = 0; this.body = spawn(); this.yaw = 0; this.pitch = 0; this.hit = false; this.firing = false; this.keys.clear(); this.jump = false; }
  private resize = () => { const w = this.host.clientWidth, h = this.host.clientHeight; this.renderer.setSize(w, h); this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix(); };
  private keydown = (e: KeyboardEvent) => { if (!this.locked) return; if (['KeyW','KeyA','KeyS','KeyD','Space'].includes(e.code)) e.preventDefault(); this.keys.add(e.code); if (e.code === 'Space' && !e.repeat) this.jump = true; };
  private keyup = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private mouse = (e: MouseEvent) => { if (!this.locked) return; this.yaw -= e.movementX * this.settings.sensitivity; this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * this.settings.sensitivity * (this.settings.invert ? -1 : 1), -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01); };
  private mouseDown = (e: MouseEvent) => { if (e.button === 0 && this.locked) this.firing = true; };
  private mouseUp = (e: MouseEvent) => { if (e.button === 0) { this.firing = false; this.hit = false; } };
  private lockChange = () => { this.keys.clear(); this.jump = false; this.firing = false; this.hit = false; this.accumulator = 0; if (!this.locked) { this.pending = []; this.network.send(this.input(false)); } };
  private blur = () => { if (this.locked) document.exitPointerLock(); this.lockChange(); };
  private visibility = () => { if (document.hidden) this.blur(); };
  private contextLost = (event: Event) => { event.preventDefault();this.blur();this.onError('Graphics context lost. Reload the page to restore the arena.'); };
  private direction = new THREE.Vector3();
  private input(active: boolean): PlayerInput {
    return { seq: ++this.seq, forward: active ? Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS')) : 0, strafe: active ? Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')) : 0, jump: active && this.jump, yaw: Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw)), pitch: this.pitch, firing: active && this.firing, active };
  }
  private loop = (now: number) => {
    if (this.disposed) return;
    const cpuStart=performance.now();
    const graphicsKey=`${this.settings.graphics}:${this.settings.renderScale}:${this.settings.frameCap}:${window.devicePixelRatio}`;
    if(graphicsKey!==this.graphicsKey){this.graphicsKey=graphicsKey;const limit={competitive:1,balanced:1.5,quality:2}[this.settings.graphics];this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,limit)*this.settings.renderScale);this.decoration.visible=this.settings.graphics!=='competitive';this.resize();this.metrics.reset();this.lastRender=0;}
    const elapsedFrame = this.previous ? (now - this.previous) / 1000 : 0; this.previous = now;
    if(document.hidden){this.lastRender=0;this.frame=requestAnimationFrame(this.loop);return;}
    this.skippedTicks+=Math.floor(Math.max(0,elapsedFrame-0.1)/CONFIG.tick);
    this.accumulator += Math.min(elapsedFrame, 0.1);
    while (this.accumulator >= CONFIG.tick) {
      this.accumulator -= CONFIG.tick;
      if (this.network.snapshot) {
        if(this.network.snapshotAge>=1000)this.hit=false;
        if (!this.network.snapshot.paused && (this.network.snapshot.phase === 'live' || this.network.snapshot.phase === 'suddenDeath')) {
          const input = this.input(this.locked && this.network.snapshotAge < 1000); this.jump = false;
          move(this.body, input, CONFIG.tick, [COVER], this.network.snapshot?.mode ?? 'standard');
          this.pending.push(input); if (this.pending.length > 120) this.pending.shift();
          this.network.send(input);
        }
        continue;
      }
      if (this.locked) {
        move(this.body, { forward: Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS')), strafe: Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')), jump: this.jump, yaw: this.yaw }, CONFIG.tick); this.jump = false;
      }
      this.camera.position.set(this.body.x, this.body.y + CONFIG.eyeHeight, this.body.z);
      this.camera.rotation.set(this.pitch, this.yaw, 0); this.camera.getWorldDirection(this.direction);
      this.practice.step(CONFIG.tick, this.locked, this.firing, this.camera.position, this.direction);
      this.hp = this.practice.hp; this.hit = this.practice.hit; this.totalDamage = this.practice.damage; this.tracked = this.practice.tracked;
    }
    this.camera.position.set(this.body.x, this.body.y + CONFIG.eyeHeight * MODES[this.network.snapshot?.mode ?? 'standard'].scale, this.body.z); this.camera.rotation.set(this.pitch, this.yaw, 0);
    const remote = this.network.remote(now);
    const profile = this.practice.profile;
    const online = !!this.network.snapshot;
    const mode = MODES[this.network.snapshot?.mode ?? 'standard'];
    const circle = !online && profile.circle;
    this.target.scale.setScalar(profile.width);
    if (remote) this.target.position.set(remote.body.x, remote.body.y + CONFIG.targetHeight * mode.scale / 2, remote.body.z);
    else if (!online) { const p = this.practice.position; this.target.position.set(p.x, p.y, p.z); }
    (this.target.material as THREE.MeshStandardMaterial).color.set('#ff657e');
    (this.target.material as THREE.MeshStandardMaterial).emissive.set(this.hit ? '#8c243d' : '#000000');
    const visible = this.hp > 0 && (!online || !!remote);
    this.target.visible = visible && circle;
    this.trainingModel.visible = visible && !circle;
    this.trainingModel.position.copy(this.target.position);
    if (online) this.trainingModel.scale.setScalar(mode.scale);
    else this.trainingModel.scale.set(profile.width / BOT_MODEL.width, profile.height / BOT_MODEL.height, profile.width / BOT_MODEL.width);
    this.trainingMaterial.emissive.set(this.hit ? '#690012' : '#000000');
    this.healthBar.sprite.visible = visible;
    this.healthBar.sprite.position.set(this.target.position.x, this.target.position.y + (online ? CONFIG.targetHeight * mode.scale : profile.height) / 2 + 0.5, this.target.position.z);
    this.healthBar.update(this.hp);
    const render=this.gate.due(now,this.settings.frameCap);
    if(render)this.renderer.render(this.scene,this.camera);
    this.cpuWork+=performance.now()-cpuStart;
    if(render){if(this.lastRender)this.metrics.record(now-this.lastRender,this.cpuWork);this.lastRender=now;this.cpuWork=0;}
    if(now-this.lastStats>=1000){this.stats=this.metrics.stats();this.lastStats=now;}
    if (now - this.lastHud >= 100) { this.onHud({ hp: this.hp, ownHp: this.ownHp, hit: this.hit, headshot: this.hit && (online ? !!this.network.snapshot?.players.find(p => p.id === this.network.id)?.headshot : this.practice.headshot), locked: this.locked, seconds: this.tracked, damage: this.totalDamage, fps: this.stats.averageMs ? 1000/this.stats.averageMs : 0, ping: this.network.ping, wave: this.practice.wave, kills: this.practice.kills, speed: profile.speed, size: profile.width / BOT_MODEL.width, circle: profile.circle, diagnostics:{...this.stats,skippedTicks:this.skippedTicks,serverSkippedTicks:this.network.snapshot?.serverMetrics?.skippedTicks??0,serverTickMs:this.network.snapshot?.serverMetrics?.tickMs??0,drawCalls:this.renderer.info.render.calls,snapshotAge:online?this.network.snapshotAge:0,connection:online?(this.network.snapshotAge>1000?'STALE — INPUT PAUSED':'CONNECTED'):'OFFLINE PRACTICE'} }); this.lastHud = now; }
    this.frame = requestAnimationFrame(this.loop);
  };
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame); if (this.locked) document.exitPointerLock(); this.resizeObserver.disconnect();
    document.removeEventListener('keydown', this.keydown); document.removeEventListener('keyup', this.keyup); document.removeEventListener('mousemove', this.mouse); document.removeEventListener('pointerlockchange', this.lockChange); window.removeEventListener('blur', this.blur); document.removeEventListener('visibilitychange', this.visibility);
    document.removeEventListener('mousedown', this.mouseDown); document.removeEventListener('mouseup', this.mouseUp);
    this.network.dispose(); this.healthBar.dispose();
    this.renderer.domElement.removeEventListener('webglcontextlost',this.contextLost);
    this.scene.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(m => m.dispose()); } });
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
