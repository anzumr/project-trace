export type FrameStats = { averageMs: number; p95Ms: number; p99Ms: number; cpuMs: number; samples: number };
export class FrameMetrics {
  private intervals = new Float64Array(1200);
  private costs = new Float64Array(1200);
  private cursor = 0;
  private count = 0;
  record(intervalMs: number, cpuMs: number) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0 || !Number.isFinite(cpuMs)) return;
    this.intervals[this.cursor] = intervalMs; this.costs[this.cursor] = Math.max(0,cpuMs);
    this.cursor = (this.cursor + 1) % this.intervals.length; this.count = Math.min(this.count+1,this.intervals.length);
  }
  reset() { this.cursor=0;this.count=0; }
  stats(): FrameStats {
    if (!this.count) return { averageMs:0,p95Ms:0,p99Ms:0,cpuMs:0,samples:0 };
    const values=Array.from(this.intervals.subarray(0,this.count)).sort((a,b)=>a-b);
    return { averageMs:values.reduce((a,b)=>a+b,0)/this.count, p95Ms:values[Math.ceil(this.count*.95)-1], p99Ms:values[Math.ceil(this.count*.99)-1], cpuMs:this.costs.subarray(0,this.count).reduce((a,b)=>a+b,0)/this.count, samples:this.count };
  }
}
export class FrameGate {
  private next = 0;
  private cap = -1;
  due(now: number, cap: number) {
    if (cap !== this.cap) { this.next=now;this.cap=cap; }
    if (!cap) return true;
    if (now + 0.1 < this.next) return false;
    const period=1000/cap;
    this.next = now > this.next + period ? now + period : this.next + period;
    return true;
  }
}
