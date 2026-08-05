import { simulateRandomDuels } from "../src/rule-simulator.js";

const options = parseArgs(process.argv.slice(2));
const result = simulateRandomDuels({
  games: options.games,
  seed: options.seed,
  maxStepsPerGame: options.maxSteps,
  playerPreset: "protagonistTrioOmegaFull",
  aiPreset: "trioOmegaRivalFull"
});

const report = {
  seed: result.seed,
  games: result.games,
  completedGames: result.completedGames,
  maxStepsReached: result.maxStepsReached,
  failures: result.failures,
  balance: result.balanceReport
    ? {
        wins: result.balanceReport.wins,
        winRates: result.balanceReport.winRates,
        averages: result.balanceReport.averages,
        gameOverReasons: result.balanceReport.gameOverReasons,
        abnormalEndReasons: result.balanceReport.abnormalEndReasons,
        deckOuts: result.balanceReport.totals.deckOuts,
        deckOutCardsMissing: result.balanceReport.totals.deckOutCardsMissing,
        maxStepTruncations: result.balanceReport.totals.maxStepTruncations
      }
    : null
};

console.log(JSON.stringify(report, null, 2));

const unhealthy =
  result.failures.length > 0 ||
  result.maxStepsReached > 0 ||
  Object.keys(result.balanceReport?.abnormalEndReasons || {}).length > 0 ||
  (result.balanceReport?.totals?.deckOutCardsMissing || 0) > 0;
if (unhealthy) process.exitCode = 1;

function parseArgs(args) {
  const options = {
    games: 30,
    seed: "finale-sim",
    maxSteps: 400
  };
  for (const arg of args) {
    const [key, rawValue] = arg.replace(/^--/, "").split("=");
    if (key === "games") options.games = positiveInteger(rawValue, options.games);
    if (key === "seed" && rawValue) options.seed = rawValue;
    if (key === "max-steps") options.maxSteps = positiveInteger(rawValue, options.maxSteps);
  }
  return options;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
