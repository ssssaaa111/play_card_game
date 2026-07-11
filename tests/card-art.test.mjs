import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { cardArtById } from "../src/card-art.js";
import { library } from "../src/data.js";

const rootPath = join(fileURLToPath(new URL("..", import.meta.url)));

test("every spell and trap has a unique artwork slot", () => {
  const cards = library.filter((card) => card.type === "spell" || card.type === "trap");
  const slots = cards.map((card) => {
    const art = cardArtById[card.id];
    assert.ok(art, `${card.id} should have artwork`);
    assert.ok(existsSync(join(rootPath, art.asset)), `${art.asset} should exist`);
    return `${art.asset}|${art.position}`;
  });

  assert.equal(new Set(slots).size, cards.length);
});

test("artwork mapping only contains spell and trap cards", () => {
  const spellTrapIds = new Set(library
    .filter((card) => card.type === "spell" || card.type === "trap")
    .map((card) => card.id));

  assert.deepEqual(Object.keys(cardArtById).sort(), [...spellTrapIds].sort());
});
