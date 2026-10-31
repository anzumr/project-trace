import * as THREE from 'three';
import { CONFIG } from '@trace/shared';

/** One texture prevents opaque plane sorting from painting over the fill. */
export class TargetHealth {
  private canvas = document.createElement('canvas');
  private context: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  readonly sprite: THREE.Sprite;
  private lastHp = -1;
  constructor() {
    this.canvas.width = 256; this.canvas.height = 64;
    this.context = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, depthTest: true, depthWrite: false, toneMapped: false }));
    this.sprite.scale.set(1.8, 0.45, 1);
    this.update(CONFIG.hp);
  }
  update(hp: number) {
    const display = Math.max(0, Math.min(CONFIG.hp, Math.ceil(hp)));
    if (display === this.lastHp) return;
    this.lastHp = display;
    const c = this.context;
    c.clearRect(0, 0, 256, 64);
    c.fillStyle = '#07090d'; c.fillRect(0, 0, 256, 64);
    c.fillStyle = '#eef2f6'; c.font = 'bold 24px Arial'; c.textAlign = 'center'; c.fillText(`${display} / ${CONFIG.hp}`, 128, 28);
    c.fillStyle = '#2a3442'; c.fillRect(8, 39, 240, 17);
    c.fillStyle = display > 30 ? '#e5212e' : '#ffb547'; c.fillRect(8, 39, 240 * display / CONFIG.hp, 17);
    this.texture.needsUpdate = true;
  }
  dispose() { this.texture.dispose(); this.sprite.material.dispose(); }
}
