/** Render scheduling and resolution feedback; no device-specific assumptions. */
export class RenderBudget {
  private lastFrame = -Infinity;
  private windowStart = 0;
  private samples = 0;
  private target = 60;
  private fastWindows = 0;
  readonly maximum: number;
  dpr: number;
  constructor(deviceDpr: number) {
    this.maximum = Math.max(.5, Math.min(deviceDpr || 1, 1.5));
    this.dpr = this.maximum;
  }
  reset(now: number) { this.lastFrame = -Infinity; this.windowStart = now; this.samples = 0; this.fastWindows = 0; }
  shouldRender(now: number, target: 30|60) {
    if (target !== this.target) { this.target = target; this.windowStart = now; this.samples = 0; this.fastWindows = 0; }
    const interval = 1000 / target;
    if (now + .5 < this.lastFrame) return false;
    // Keep a deadline rather than a modulo: rounding near a refresh boundary must not add extra frames.
    this.lastFrame = Number.isFinite(this.lastFrame) ? this.lastFrame + interval : now + interval;
    if (this.lastFrame <= now + .5) this.lastFrame = now + interval;
    return true;
  }
  sample(now: number, ready: boolean): boolean {
    if (!ready) { this.windowStart = now; this.samples = 0; this.fastWindows = 0; return false; }
    this.samples++;
    const elapsed = now - this.windowStart;
    if (elapsed < 2000) return false;
    const fps = this.samples * 1000 / elapsed;
    this.windowStart = now; this.samples = 0;
    const previous = this.dpr;
    const minimum = Math.min(this.maximum, .75);
    if (fps < this.target * .75) { this.dpr = Math.max(minimum, this.dpr - .25); this.fastWindows = 0; }
    else if (this.target === 60 && fps > 55) {
      if (++this.fastWindows >= 5) { this.dpr = Math.min(this.maximum, this.dpr + .25); this.fastWindows = 0; }
    } else this.fastWindows = 0;
    return this.dpr !== previous;
  }
}
