import * as THREE from 'three';
import { BOT_MODEL } from '@trace/shared/practice';

export function createBotModel() {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#c90022', roughness: 0.42 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(BOT_MODEL.bodyRadius, BOT_MODEL.bodyTop - BOT_MODEL.bodyBottom, 8, 24), bodyMaterial);
  torso.position.y = (BOT_MODEL.bodyBottom + BOT_MODEL.bodyTop) / 2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(BOT_MODEL.headRadius, 24, 16), new THREE.MeshStandardMaterial({ color: '#a5a8a3', roughness: 0.65 }));
  head.position.y = BOT_MODEL.headY;
  group.add(torso, head);
  return { group, bodyMaterial };
}
