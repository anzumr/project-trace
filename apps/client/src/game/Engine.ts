import { CombatAudio } from './CombatAudio';
import { emptyCombat, type CombatStats } from '@trace/shared/combat';
import * as THREE from 'three';
import { AIR, CONFIG, ARENA_SOLIDS, MODES, spawn, move, eyeHeight, stance } from '@trace/shared';
import { Practice, BOT_MODEL } from '@trace/shared/practice';
import { partAt, poseOf, skeleton } from '@trace/shared/bow';
import type { PlayerInput, Snapshot, QueueState } from '@trace/shared/protocol';
import { createBotModel } from './BotModel';
import { ArcherModel, ARCHER_BODY } from './ArcherModel';
import { BowView, type Anchor } from './BowView';
import { StepTracker } from '../ui/footsteps';
import { createArena } from './Arena';
import { Network } from '../net/Network';
import { TargetHealth } from './TargetHealth';
import { FrameGate, FrameMetrics, type FrameStats } from './Performance';

import { normalizeKey, type Settings } from '../ui/settings';
export type { Settings } from '../ui/settings';
export type PracticeSummary = { duration:number; stats:CombatStats; waves:number; average:number|null; best:number|null; worst:number|null };
/** `air` is the Bow 1v1 air jump: `ready` fills 0→1 over the cooldown, `seconds` is what is left of it. */
export type Hud = { air?: { ready: number; seconds: number }; combat?:CombatStats; lastWave?:{wave:number;stats:CombatStats}|null;  hp: number; ownHp: number; hit: boolean; headshot: boolean; locked: boolean; seconds: number; damage: number; fps: number; ping: number; wave: number; kills: number; speed: number; size: number; circle: boolean; diagnostics?: FrameStats & { skippedTicks:number; serverSkippedTicks:number; serverTickMs:number; drawCalls:number; snapshotAge:number; connection:string } };
export class Engine {
  private audio = new CombatAudio(()=>this.settings,message=>this.onError(message));
  private practiceSession = 0;
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
  private archer = new ArcherModel();
  private bowView: BowView;
  /** Bow input edges: a click shorter than a tick still sends one held tick, and right-click cancels until the button is released. */
  private tap = false;
  private cancel = false;
  private cancelHeld = false;
  private bowHits = 0;
  private bowHeads = 0;
  private hitUntil = 0;
  private bowHead = false;
  private deadAt: number | null = null;
  private wasBow = false;
  /** Footsteps: yours (quiet, centred) and the opponent's (placed in 3D so you can hear where they are). */
  private ownSteps = new StepTracker();
  private enemySteps = new StepTracker();
  private up = new THREE.Vector3();
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
  private publishedHud: Hud | undefined;
  private publish(hud:Hud) { this.publishedHud=hud; this.onHud(hud); }
  private feedback() {
    const headshot=this.hit && (this.network.snapshot?.game === 'bow' ? this.bowHead : this.network.snapshot ? !!this.network.snapshot.players.find(p=>p.id===this.network.id)?.headshot : this.practice.headshot);
    if(this.publishedHud && (this.publishedHud.hit!==this.hit || this.publishedHud.headshot!==headshot || this.publishedHud.locked!==this.locked)) this.publish({...this.publishedHud,hit:this.hit,headshot,locked:this.locked});
  }
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
    this.network = new Network(state => { if (!state) { this.reset(); this.roomCode = ''; this.match = -1; this.pending = []; this.blur(); this.bowView?.clear(); } onRoom(state); }, onError, this.acceptSnapshot, onQueue);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#0b0d10');
    this.scene.fog = new THREE.Fog('#0b0d10', 25, 65);
    this.scene.add(this.decoration);
    this.scene.add(new THREE.HemisphereLight(0xe8edf5, 0x262a31, 2.7));
    const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(5, 15, 7); this.scene.add(sun);
    createArena(this.scene,this.decoration);
    this.target = new THREE.Mesh(this.sphereGeometry,new THREE.MeshStandardMaterial({color:'#ff657e',roughness:0.8}));this.scene.add(this.target);
    this.scene.add(this.trainingModel);
    this.scene.add(this.healthBar.sprite);
    this.scene.add(this.camera, this.archer.group); this.archer.group.visible = false;
    this.bowView = new BowView(this.scene, this.camera, ARCHER_BODY);
    this.renderer.domElement.addEventListener('contextmenu', this.noMenu);
    this.camera.rotation.order = 'YXZ';
    this.resizeObserver = new ResizeObserver(this.resize); this.resizeObserver.observe(host); this.resize();
    document.addEventListener('keydown', this.keydown); document.addEventListener('keyup', this.keyup);
    document.addEventListener('mousemove', this.mouse); document.addEventListener('pointerlockchange', this.lockChange);
    document.addEventListener('mousedown', this.mouseDown); document.addEventListener('mouseup', this.mouseUp);
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
    window.addEventListener('blur', this.blur); document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('beforeunload', this.beforeUnload);
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
      this.bowView.reset(); this.bowHits = me.bow?.hits ?? 0; this.bowHeads = me.bow?.heads ?? 0;
    }
    const bow = state.game === 'bow';
    if (bow && (me.bow?.hits ?? 0) > this.bowHits) { this.hitUntil = performance.now() + 250; this.bowHead = (me.bow?.heads ?? 0) > this.bowHeads; }
    this.bowHits = me.bow?.hits ?? 0; this.bowHeads = me.bow?.heads ?? 0;
    this.body = { ...me.body };
    this.pending = this.pending.filter(input => input.seq > me.ack);
    if (!state.paused && (state.phase === 'live' || state.phase === 'suddenDeath')) for (const input of this.pending) move(this.body, input, CONFIG.tick, ARENA_SOLIDS, this.network.snapshot?.mode ?? 'standard', bow);
    else { this.pending = []; if (this.locked && state.phase === 'finished' && this.lastPhase !== 'finished') this.blur(); }
    this.lastPhase = state.phase;
    this.audio.observe({allowInitialSpawn:state.phase==='countdown',key:state.matchId ?? `${state.code}:${state.match}`,spawn:state.roundSerial,kills:me.kills??0,damage:me.damage,headDamage:me.matchStats?.headDamage??0});
    this.ownHp = me.hp; this.hp = state.players.find(p => p.id !== me.id)?.hp ?? CONFIG.hp;
    this.hit = bow ? performance.now() < this.hitUntil : (state.phase === 'live' || state.phase === 'suddenDeath') && me.hit; this.tracked = me.trackingSeconds; this.totalDamage = me.damage;
  };
  async engage() {
    void this.audio.unlock();
    if (!this.renderer.domElement.requestPointerLock) { this.onError('This browser does not support pointer lock. Use a desktop browser with a mouse.'); return; }
    try { await this.renderer.domElement.requestPointerLock({ unadjustedMovement: true }); }
    catch { try { await this.renderer.domElement.requestPointerLock(); } catch { this.onError('Mouse capture was denied. Click Enter arena to retry.'); } }
  }
  endPractice(): PracticeSummary {
    this.blur();
    const summary={duration:this.practice.elapsed,stats:{...this.practice.stats},waves:this.practice.kills,average:this.practice.kills?this.practice.completedDuration/this.practice.kills:null,best:this.practice.best,worst:this.practice.worst};
    this.reset();return summary;
  }
  reset() { if (this.network.snapshot) return; this.practice = new Practice(); this.practiceSession++; this.hp = CONFIG.hp; this.ownHp = CONFIG.hp; this.tracked = 0; this.totalDamage = 0; this.body = spawn(); this.yaw = 0; this.pitch = 0; this.hit = false; this.firing = false; this.keys.clear(); this.jump = false; }
  private resize = () => { const w = this.host.clientWidth, h = this.host.clientHeight; this.renderer.setSize(w, h); this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix(); };
  private keydown = (e: KeyboardEvent) => {
    if (!this.locked) return;
    const code = normalizeKey(e.code), k = this.settings.keys;
    // Bound keys never trigger page shortcuts (Ctrl+S, Ctrl+D, Space scroll); Ctrl+W can only be kept in fullscreen.
    if (Object.values(k).includes(code)) e.preventDefault();
    this.keys.add(code); if (code === k.jump && !e.repeat) this.jump = true;
  };
  private keyup = (e: KeyboardEvent) => { this.keys.delete(normalizeKey(e.code)); };
  private get crouching() { return this.keys.has(this.settings.keys.crouch); }
  private axis(positive: string, negative: string) { return Number(this.keys.has(positive)) - Number(this.keys.has(negative)); }
  /** Ctrl crouches, and outside fullscreen Ctrl+W would close the tab: ask before leaving mid-game. */
  private beforeUnload = (e: BeforeUnloadEvent) => { const phase = this.network.snapshot?.phase; if (this.locked || (phase && !['lobby', 'finished'].includes(phase))) { e.preventDefault(); e.returnValue = ''; } };
  private mouse = (e: MouseEvent) => { if (!this.locked) return; this.yaw -= e.movementX * this.settings.sensitivity; this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * this.settings.sensitivity * (this.settings.invert ? -1 : 1), -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01); };
  private mouseDown = (e: MouseEvent) => {
    if (!this.locked) return;
    const bow = this.network.snapshot?.game === 'bow';
    if (e.button === 0) { this.firing = true; this.tap = bow; } else if (e.button === 2 && bow) { this.cancel = true; this.cancelHeld = this.firing; }
  };
  private mouseUp = (e: MouseEvent) => { if (e.button === 0) { this.firing = false; this.cancelHeld = false; this.hit = false; this.feedback(); } };
  private noMenu = (e: Event) => e.preventDefault();
  private lockChange = () => { this.keys.clear(); this.jump = false; this.firing = false; this.hit = false; this.accumulator = 0; this.feedback(); if (!this.locked) { this.pending = []; this.network.send(this.input(false)); } };
  private blur = () => { if (this.locked) document.exitPointerLock(); this.lockChange(); };
  private visibility = () => { if (document.hidden) this.blur(); };
  private contextLost = (event: Event) => { event.preventDefault();this.blur();this.onError('Graphics context lost. Reload the page to restore the arena.'); };
  private direction = new THREE.Vector3();
  private input(active: boolean): PlayerInput {
    const input: PlayerInput = { seq: ++this.seq, forward: active ? this.axis(this.settings.keys.forward, this.settings.keys.back) : 0, strafe: active ? this.axis(this.settings.keys.right, this.settings.keys.left) : 0, jump: active && this.jump, crouch: active && this.crouching, yaw: Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw)), pitch: this.pitch, firing: active && (this.firing || this.tap) && !this.cancelHeld, active, view: this.network.viewTick, cancel: active && this.cancel };
    this.tap = false; this.cancel = false;
    return input;
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
        const bow = this.network.snapshot.game === 'bow', mode = this.network.snapshot.mode;
        if(!bow && (this.network.snapshotAge>=200 || this.network.snapshot.paused || !this.firing))this.hit=false;
        if (!this.network.snapshot.paused && (this.network.snapshot.phase === 'live' || this.network.snapshot.phase === 'suddenDeath')) {
          const input = this.input(this.locked && this.network.snapshotAge < 1000); this.jump = false;
          move(this.body, input, CONFIG.tick, ARENA_SOLIDS, mode, bow);
          const drawing = this.bowView.charge, shot = bow ? this.bowView.step(input.firing, !!input.cancel, input.active) : null;
          if (shot !== null) this.audio.bow('release');
          else if (bow && drawing === 0 && this.bowView.charge > 0) this.audio.bow('draw');
          else if (bow && drawing > 0 && this.bowView.charge === 0) this.audio.stopBow();
          if (shot !== null) this.bowView.shoot({ x: this.body.x, y: this.body.y + eyeHeight(this.body, mode), z: this.body.z }, input.yaw, input.pitch, shot);
          this.footstep(this.ownSteps.update(this.body, CONFIG.tick), null);
          this.pending.push(input); if (this.pending.length > 120) this.pending.shift();
          this.network.send(input);
        }
        continue;
      }
      if (this.locked) {
        move(this.body, { forward: this.axis(this.settings.keys.forward, this.settings.keys.back), strafe: this.axis(this.settings.keys.right, this.settings.keys.left), jump: this.jump, crouch: this.crouching, yaw: this.yaw }, CONFIG.tick); this.jump = false;
        this.footstep(this.ownSteps.update(this.body, CONFIG.tick), null);
      }
      this.camera.position.set(this.body.x, this.body.y + eyeHeight(this.body), this.body.z);
      this.camera.rotation.set(this.pitch, this.yaw, 0); this.camera.getWorldDirection(this.direction);
      this.practice.step(CONFIG.tick, this.locked, this.firing, this.camera.position, this.direction);
      if(this.locked)this.audio.observe({key:`practice:${this.practiceSession}`,spawn:this.practice.spawnSerial,kills:this.practice.kills,damage:this.practice.damage,headDamage:this.practice.stats.headDamage});
      this.hp = this.practice.hp; this.hit = this.practice.hit; this.totalDamage = this.practice.damage; this.tracked = this.practice.tracked;
    }
    this.camera.position.set(this.body.x, this.body.y + eyeHeight(this.body, this.network.snapshot?.mode ?? 'standard'), this.body.z); this.camera.rotation.set(this.pitch, this.yaw, 0);
    const remote = this.network.remote(now);
    // Footsteps in every mode: the opponent online, or the roaming target in offline practice (always on the floor).
    const target = this.practice.position, foe = remote ? (remote.hp > 0 ? remote.body : null) : !this.network.snapshot && this.practice.hp > 0 ? { x: target.x, y: 0, z: target.z, grounded: true } : null;
    if (foe) this.footstep(this.enemySteps.update(foe, elapsedFrame), { x: foe.x, y: foe.y + 0.05, z: foe.z });
    else this.enemySteps.reset();
    this.camera.getWorldDirection(this.direction); this.audio.listen(this.camera.position, this.direction, this.up.set(0, 1, 0).applyQuaternion(this.camera.quaternion));
    const profile = this.practice.profile;
    const online = !!this.network.snapshot;
    const mode = MODES[this.network.snapshot?.mode ?? 'standard'];
    const circle = !online && profile.circle, crouched = stance(remote?.body ?? {});
    this.target.scale.setScalar(profile.width);
    if (remote) this.target.position.set(remote.body.x, remote.body.y + CONFIG.targetHeight * mode.scale * crouched / 2, remote.body.z);
    else if (!online) { const p = this.practice.position; this.target.position.set(p.x, p.y, p.z); }
    (this.target.material as THREE.MeshStandardMaterial).color.set('#ff657e');
    (this.target.material as THREE.MeshStandardMaterial).emissive.set(this.hit ? '#8c243d' : '#000000');
    const visible = this.hp > 0 && (!online || !!remote);
    this.target.visible = visible && circle;
    this.trainingModel.visible = visible && !circle;
    this.trainingModel.position.copy(this.target.position);
    if (online) this.trainingModel.scale.set(mode.scale, mode.scale * crouched, mode.scale);
    else this.trainingModel.scale.set(profile.width / BOT_MODEL.width, profile.height / BOT_MODEL.height, profile.width / BOT_MODEL.width);
    this.trainingMaterial.emissive.set(this.hit ? '#690012' : '#000000');
    this.healthBar.sprite.visible = visible;
    this.healthBar.sprite.position.set(this.target.position.x, this.target.position.y + (online ? CONFIG.targetHeight * mode.scale * crouched : profile.height) / 2 + 0.5, this.target.position.z);
    this.healthBar.update(this.hp);
    const bow = this.network.snapshot?.game === 'bow';
    if (bow) this.bowFrame(now, elapsedFrame, remote);
    else if (this.wasBow) { this.bowView.clear(); this.archer.group.visible = false; this.setFov(85); }
    this.wasBow = bow;
    if (bow) this.hit = now < this.hitUntil;
    this.feedback();
    this.audio.update();
    const render=this.gate.due(now,this.settings.frameCap);
    if(render)this.renderer.render(this.scene,this.camera);
    this.cpuWork+=performance.now()-cpuStart;
    if(render){if(this.lastRender)this.metrics.record(now-this.lastRender,this.cpuWork);this.lastRender=now;this.cpuWork=0;}
    if(now-this.lastStats>=1000){this.stats=this.metrics.stats();this.lastStats=now;}
    if (now - this.lastHud >= 100) { this.publish({ air: bow ? { ready: 1 - (this.body.airCooldown ?? 0) / AIR.cooldown, seconds: this.body.airCooldown ?? 0 } : undefined, combat:{...(online ? this.network.snapshot?.players.find(p=>p.id===this.network.id)?.roundStats ?? emptyCombat() : this.practice.waveStats)}, lastWave:this.practice.lastWave, hp: this.hp, ownHp: this.ownHp, hit: this.hit, headshot: this.hit && (bow ? this.bowHead : online ? !!this.network.snapshot?.players.find(p => p.id === this.network.id)?.headshot : this.practice.headshot), locked: this.locked, seconds: this.tracked, damage: this.totalDamage, fps: this.stats.averageMs ? 1000/this.stats.averageMs : 0, ping: this.network.ping, wave: this.practice.wave, kills: this.practice.kills, speed: profile.speed, size: profile.width / BOT_MODEL.width, circle: profile.circle, diagnostics:{...this.stats,skippedTicks:this.skippedTicks,serverSkippedTicks:this.network.snapshot?.serverMetrics?.skippedTicks??0,serverTickMs:this.network.snapshot?.serverMetrics?.tickMs??0,drawCalls:this.renderer.info.render.calls,snapshotAge:online?this.network.snapshotAge:0,connection:online?(this.network.snapshotAge>1000?'STALE — INPUT PAUSED':'CONNECTED'):'OFFLINE PRACTICE'} }); this.lastHud = now; }
    this.frame = requestAnimationFrame(this.loop);
  };
  private footstep(event: ReturnType<StepTracker['update']>, at: { x: number; y: number; z: number } | null) { if (event) this.audio.step(event.kind, at, event.loudness); }
  private setFov(fov: number) { if (Math.abs(this.camera.fov - fov) > 1e-3) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); } }
  /** Bow 1v1 frame: the opponent archer from the shared skeleton, your bow and arrows, and everyone else's arrows. */
  private bowFrame(now: number, elapsed: number, remote: ReturnType<Network['remote']>) {
    const snap = this.network.snapshot!, mine = snap.players.findIndex(p => p.id === this.network.id), me = snap.players[mine];
    this.target.visible = false; this.trainingModel.visible = false;
    const anchors = new Map<string, Anchor>();
    let hit: ((p: { x: number; y: number; z: number }) => ReturnType<typeof partAt>) | undefined;
    if (remote) {
      const pose = poseOf(remote), body = skeleton(pose);
      this.deadAt = remote.hp > 0 ? null : this.deadAt ?? now;
      this.archer.group.visible = true; this.archer.update(body, pose, this.deadAt === null ? null : (now - this.deadAt) / 1000);
      // Arrows in a falling archer would float where the body stood, so they go with it.
      if (remote.hp > 0) { anchors.set(remote.id, pose); hit = p => partAt(body, p); }
      this.healthBar.sprite.visible = remote.hp > 0; this.healthBar.sprite.position.set(body.head.x, body.head.y + 0.45, body.head.z);
    } else this.archer.group.visible = false;
    this.bowView.frame(elapsed, !!me && me.hp > 0 && snap.phase !== 'lobby', hit);
    this.bowView.sync(snap.arrows, this.network.id ?? '', this.network.viewTick ?? snap.tick, anchors);
    const e = Math.max(0, Math.min(1, this.bowView.charge)); this.setFov(85 - 5 * e * e * (3 - 2 * e));
  }
  dispose() {
    this.audio.dispose(); this.disposed = true; cancelAnimationFrame(this.frame); if (this.locked) document.exitPointerLock(); this.resizeObserver.disconnect();
    document.removeEventListener('keydown', this.keydown); document.removeEventListener('keyup', this.keyup); document.removeEventListener('mousemove', this.mouse); document.removeEventListener('pointerlockchange', this.lockChange); window.removeEventListener('blur', this.blur); document.removeEventListener('visibilitychange', this.visibility); window.removeEventListener('beforeunload', this.beforeUnload);
    document.removeEventListener('mousedown', this.mouseDown); document.removeEventListener('mouseup', this.mouseUp); this.renderer.domElement.removeEventListener('contextmenu', this.noMenu);
    this.network.dispose(); this.healthBar.dispose();
    this.renderer.domElement.removeEventListener('webglcontextlost',this.contextLost);
    this.scene.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(m => m.dispose()); } });
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
