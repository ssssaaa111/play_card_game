// One command may be in flight, including the main-to-battle phase transition.
export function createOnlineActionRunner(onPending = () => {}, now = () => performance.now()) {
  let pending = false;
  let repeatClickUntil = -Infinity;
  const run = async (action) => {
    if (pending) return false;
    pending = true;
    try {
      onPending(true);
      await action();
      return true;
    } finally {
      pending = false;
      repeatClickUntil = now() + 400;
      onPending(false);
    }
  };
  // The second click of a double-click can land on the hand after a dialog closes.
  // Ordinary clicks and keyboard activation remain available immediately.
  run.blocksRepeatedClick = (detail) => detail > 1 && (pending || now() < repeatClickUntil);
  return run;
}
