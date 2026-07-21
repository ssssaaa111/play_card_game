import { analyzeFinaleBalance } from "../src/finale-balance-audit.js";

const options = parseArgs(process.argv.slice(2));
const report = analyzeFinaleBalance(options);

console.log(JSON.stringify(report, null, 2));

if (
  !report.authored.deployment.fullTrioEstablished
  || report.authored.deployment.tributeCount !== 3
  || !report.disruption.attackDestroyTrap.trapResult?.sourceGodDestroyed
) {
  process.exitCode = 1;
}

function parseArgs(args) {
  const options = {
    samples: 1000,
    seed: "finale-balance-audit",
    openingHandSize: 5
  };
  for (const arg of args) {
    const [key, rawValue] = arg.replace(/^--/, "").split("=");
    if (key === "samples") options.samples = positiveInteger(rawValue, options.samples);
    if (key === "seed" && rawValue) options.seed = rawValue;
    if (key === "opening-hand") options.openingHandSize = positiveInteger(rawValue, options.openingHandSize);
    if (key === "draw-checkpoints" && rawValue) {
      options.drawCheckpoints = rawValue
        .split(",")
        .map(Number)
        .filter((value) => Number.isInteger(value) && value > 0);
    }
  }
  return options;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
