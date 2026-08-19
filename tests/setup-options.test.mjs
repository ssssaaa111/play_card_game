import test from "node:test";
import assert from "node:assert/strict";

import { aiProfiles, deckPresets, roleProfiles, scenarioSetups } from "../src/data.js";
import {
  aiSetupOptions,
  deckSetupOptions,
  roleSetupOptions,
  scenarioSetupOptions
} from "../src/setup-options.js";

test("production setup only exposes player decks", () => {
  const ids = deckSetupOptions(deckPresets).map((entry) => entry.id);

  assert.ok(ids.includes("balanced"));
  assert.ok(ids.includes("protagonistTrioOmegaFull"));
  assert.ok(!ids.includes("suppressionRival"));
  assert.ok(!ids.includes("trioOmegaRivalFull"));
  assert.ok(!ids.includes("trioOmegaRivalAscension"));
});

test("production setup exposes curated duel modes", () => {
  const ids = scenarioSetupOptions(scenarioSetups).map((entry) => entry.id);

  assert.deepEqual(ids, [
    "normal",
    "protagonistComeback",
    "protagonistComebackChallenge",
    "protagonistAceEvolution",
    "protagonistAceProtection",
    "protagonistTrioOmega",
    "protagonistTrioOmegaChallenge",
    "protagonistTrioOmegaStory",
    "protagonistTrioOmegaVow",
    "protagonistTrioOmegaFinale",
    "protagonistTrioOmegaFinaleRush",
    "protagonistTrioOmegaFull",
    "protagonistTrioOmegaAscension"
  ]);
});

test("test mode keeps every deck and rule scenario available", () => {
  assert.equal(deckSetupOptions(deckPresets, { testMode: true }).length, Object.keys(deckPresets).length);
  assert.equal(scenarioSetupOptions(scenarioSetups, { testMode: true }).length, Object.keys(scenarioSetups).length);
});

test("role and AI options are generated from their definitions", () => {
  assert.deepEqual(roleSetupOptions(roleProfiles).map((entry) => entry.label), [
    "星辉使者",
    "炎岚指挥官",
    "辉棱守望者"
  ]);
  assert.deepEqual(aiSetupOptions(aiProfiles).map((entry) => entry.label), [
    "均衡策士",
    "强攻斗士",
    "防守控场"
  ]);
});

test("deck options append custom decks after player presets", () => {
  const customDecks = [
    { id: "custom:a", name: "我的第一套" },
    { id: "custom:b", name: "我的第二套" }
  ];
  const options = deckSetupOptions(deckPresets, { customDecks });
  const customEntries = options.filter((entry) => entry.custom);
  assert.deepEqual(customEntries.map((entry) => entry.label), ["我的第一套", "我的第二套"]);
  assert.equal(options[options.length - 1].id, "custom:b");
  assert.ok(options.some((entry) => entry.id === "balanced"));
  assert.equal(deckSetupOptions(deckPresets, {}).some((entry) => entry.custom), false);
});
