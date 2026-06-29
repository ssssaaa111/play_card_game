import { simulateChainTrapScenario, simulateRandomDuels } from "../src/rule-simulator.js";

const options = parseArgs(process.argv.slice(2));
const result = simulateRandomDuels(options);
result.scenarios = {
  chainTrap: simulateChainTrapScenario()
};

console.log(JSON.stringify(result, null, 2));

if (
  result.failures.length > 0 ||
  result.maxStepsReached > 0 ||
  Object.values(result.scenarios).some((scenario) => scenario.failures.length > 0)
) {
  process.exitCode = 1;
}

function parseArgs(args) {
  const options = {
    games: 50,
    seed: "rule-sim-cli",
    maxStepsPerGame: 260
  };
  for (const arg of args) {
    const [key, rawValue] = arg.replace(/^--/, "").split("=");
    if (key === "games") options.games = positiveInteger(rawValue, options.games);
    if (key === "seed" && rawValue) options.seed = rawValue;
    if (key === "max-steps") options.maxStepsPerGame = positiveInteger(rawValue, options.maxStepsPerGame);
    if (key === "preset" && rawValue) {
      options.playerPreset = rawValue;
      options.aiPreset = rawValue;
    }
    if (key === "player-preset" && rawValue) options.playerPreset = rawValue;
    if (key === "ai-preset" && rawValue) options.aiPreset = rawValue;
    if (key === "presets" && rawValue) options.presets = rawValue;
  }
  return options;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
