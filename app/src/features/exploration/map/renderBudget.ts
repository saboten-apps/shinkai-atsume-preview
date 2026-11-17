/** Render scheduling and resolution feedback; no device-specific assumptions. */
const STEP = .25;
const WINDOW_MS = 2000;
const FAST_WINDOWS = 5;
const PROBE_WINDOWS = 3;
const FIRST_RETRY_MS = 20000;
const LONGEST_RETRY_MS = 160000;

export class RenderBudget {
  private lastFrame = -Infinity;
  private windowStart = 0;
  private samples = 0;
  private target = 60;
  private fastWindows = 0;
  /** Highest resolution that has not recently proved too slow. */
  private ceiling: number;
  private retryAt = 0;
  private retryDelay = FIRST_RETRY_MS;
  /** True while running at a level that failed before and is being tried again. */
  private probing = false;
  private probeWindows = 0;
  readonly maximum: number;
  dpr: number;
  /** Resolution changes since creation, for device captures. */
  changes = 0;
  constructor(deviceDpr: number) {
    // Keep the mobile GPU's pixel workload bounded; full device DPR adds a large
    // quadratic cost on high-density phone screens without improving source texels.
    this.maximum = Math.max(.5, Math.min(deviceDpr || 1, 1.25));
    this.dpr = this.maximum;
    this.ceiling = this.maximum;
  }
  /** Restart timing after a pause. What was learned about the resolution is kept. */
  reset(now: number) { this.lastFrame = -Infinity; this.windowStart = now; this.samples = 0; this.fastWindows = 0; }
  shouldRender(now: number, target: 30|60) {
    // A still map and a moving one share progress toward recovery; only the partial window is discarded.
    if (target !== this.target) { this.target = target; this.windowStart = now; this.samples = 0; }
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
    if (elapsed < WINDOW_MS) return false;
    const fps = this.samples * 1000 / elapsed;
    this.windowStart = now; this.samples = 0;
    const previous = this.dpr;
    const minimum = Math.min(this.maximum, .5);
    if (fps < this.target * .75) {
      this.fastWindows = 0;
      if (this.dpr > minimum) {
        this.dpr = Math.max(minimum, this.dpr - STEP);
        // Remember the level that failed. A level that fails again on a retry waits longer each time,
        // so a device that cannot hold it stops switching back and forth.
        if (this.probing) this.retryDelay = Math.min(this.retryDelay * 2, LONGEST_RETRY_MS);
        this.probing = false;
        this.ceiling = this.dpr;
        this.retryAt = now + this.retryDelay;
      }
    } else if (fps > this.target * .92) {
      // Only movement proves a retried level: a still map at 30 FPS says nothing about 60.
      if (this.probing && this.target === 60 && ++this.probeWindows >= PROBE_WINDOWS) {
        this.probing = false; this.retryDelay = FIRST_RETRY_MS;
      }
      if (++this.fastWindows >= FAST_WINDOWS) {
        this.fastWindows = 0;
        if (!this.probing && this.dpr >= this.ceiling && this.ceiling < this.maximum && now >= this.retryAt) {
          this.ceiling = Math.min(this.maximum, this.ceiling + STEP);
          this.probing = true; this.probeWindows = 0;
        }
        if (this.dpr < this.ceiling) this.dpr = Math.min(this.ceiling, this.dpr + STEP);
      }
    } else this.fastWindows = 0;
    if (this.dpr !== previous) this.changes++;
    return this.dpr !== previous;
  }
}
