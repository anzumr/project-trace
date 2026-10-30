export class TokenBucket {
  private tokens: number;
  private previous: number;
  constructor(private rate: number, private burst: number, now: number) { this.tokens=burst;this.previous=now; }
  take(now: number) {
    this.tokens=Math.min(this.burst,this.tokens+Math.max(0,now-this.previous)*this.rate/1000);this.previous=now;
    if(this.tokens<1)return false;
    this.tokens--;return true;
  }
}
