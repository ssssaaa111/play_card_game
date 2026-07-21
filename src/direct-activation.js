export function createDirectActivationTracker({ maxDelay = 500, now = () => Date.now() } = {}) {
  let previous = null;

  return {
    register(key) {
      const time = Number(now());
      const direct = Boolean(
        key
        && previous?.key === key
        && time >= previous.time
        && time - previous.time <= maxDelay
      );
      previous = direct ? null : { key, time };
      return direct;
    },
    reset() {
      previous = null;
    }
  };
}
