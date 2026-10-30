import type { Hud } from '../game/Engine';
export function Diagnostics({ hud }: { hud: Hud }) {
  const d=hud.diagnostics;if(!d)return null;
  return <div className="diagnostics"><strong>{d.connection}</strong><span>Frame avg / p95 / p99: {d.averageMs.toFixed(2)} / {d.p95Ms.toFixed(2)} / {d.p99Ms.toFixed(2)} ms</span><span>JS work per render: {d.cpuMs.toFixed(2)} ms · {d.drawCalls} draw calls</span><span>Ping: {Math.round(hud.ping)} ms · snapshot age: {Math.round(d.snapshotAge)} ms</span><span>Skipped ticks client / server: {d.skippedTicks} / {d.serverSkippedTicks}</span><span>Server simulation tick: {d.serverTickMs.toFixed(2)} ms · {d.samples} frame samples</span><small>Rolling rendered frames · JS timing excludes asynchronous GPU work</small></div>;
}
