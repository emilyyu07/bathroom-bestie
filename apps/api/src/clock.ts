/** Injected clock (invariant 1 spirit): only this file touches Date.now. Minutes since epoch. */
export interface Clock {
  nowMinute(): number;
}
export const systemClock: Clock = { nowMinute: () => Math.floor(Date.now() / 60000) };
export class FakeClock implements Clock {
  constructor(public t = 0) {}
  nowMinute() {
    return this.t;
  }
}
