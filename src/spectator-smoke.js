import { library } from "./data.js";

// Public, local-only layout fixture. It never connects to a duel or bypasses server authentication.
export async function runSpectatorLayoutSmoke(render, elements, name) {
  document.body.dataset.smokeStatus = "running";
  document.querySelector("h1").textContent = "只读观战 · 布局测试（非真实对局）";
  const card = (templateId, id, mode = "attack") => ({ ...library.find((entry) => entry.id === templateId),
    id, templateId, mode, tempAtk: 0, tempDef: 0, used: false });
  const players = Object.fromEntries(["p1", "p2"].map((id) => [id, {
    lp: id === "p1" ? 3600 : 4000, deckCount: 35, handCount: 5,
    hand: [{ id: "private-layout-hand", name: "SHOULD_NOT_APPEAR" }],
    monsterZone: ["solar-knight", "iron-guardian", "starfall-colossus", "ember-drake", "genesis-star-dragon"].map((template, index) => ({
      ...card(template, `${id}:public:${index}`, index % 2 ? "defense" : "attack"), ...(index === 4 ? { atk: 99999, def: 99999 } : {})
    })),
    spellTrapZone: [{ hidden: true, id: "private-layout-trap", name: "SHOULD_NOT_APPEAR" }, null, null, null, null],
    grave: [card("mirror-snare", `${id}:public-grave`)], banished: []
  }]));
  render({ viewerRole: "spectator", roomCode: "TEST23", revision: 1, status: "playing", duelNumber: 2,
    series: { completed: 1, draws: 0, wins: { p1: 0, p2: 1 } },
    seats: [{ seatId: "p1", name: "公开测试玩家一", connected: true }, { seatId: "p2", name: "公开测试玩家二", connected: true }],
    players, spectators: { count: 1 }, turn: { playerId: "p1", phase: "battle" },
    turnTimer: { paused: false, deadlineAt: Date.now() + 90_000 }, machine: { chain: [] }, recentEvents: [] });
  try {
    await new Promise((resolve) => setTimeout(resolve, 80));
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    assert(document.documentElement.scrollWidth <= innerWidth + 1, "spectator page must not overflow horizontally");
    assert(!document.body.textContent.includes("SHOULD_NOT_APPEAR"), "hands and covered card metadata must not render");
    assert(!document.querySelector('[data-card-id="private-layout-trap"]'), "covered cards must not carry private instance ids");
    for (const button of document.querySelectorAll(".watch-card")) {
      const rect = button.getBoundingClientRect(), slot = button.closest(".watch-slot").getBoundingClientRect();
      assert(rect.left >= slot.left - 1 && rect.right <= slot.right + 1, "public cards must stay inside their slots");
      const stats = button.querySelector(".watch-stats"), art = button.querySelector(".watch-art");
      if (stats) {
        const sr = stats.getBoundingClientRect(), ar = art.getBoundingClientRect();
        assert(sr.left >= rect.left - 1 && sr.right <= rect.right + 1 && sr.top >= ar.bottom, "ATK/DEF must be below art without clipping");
        for (const value of stats.children) {
          const vr = value.getBoundingClientRect();
          assert(vr.left >= rect.left - 1 && vr.right <= rect.right + 1, "full stat values must fit the card");
        }
        assert(art.dataset.mode === "defense" ? ar.width > ar.height : ar.height > ar.width, "defense art must stay horizontal");
      }
    }
    assert(!document.querySelector("#battleButton, #endTurnButton, #readyButton, #forfeitButton, #responseActivate"), "spectator page must not mount game action controls");
    document.querySelector(".watch-card").click();
    assert(elements.watchDetail.open, "public details must open");
    elements.watchDetailClose.scrollIntoView({ block: "nearest" });
    const close = elements.watchDetailClose.getBoundingClientRect();
    assert(close.height >= 44 && close.top >= 0 && close.bottom <= innerHeight + 1, "detail close must remain reachable");
    elements.watchDetailClose.click(); assert(!elements.watchDetail.open, "public details must close");
    document.body.dataset.smokeStatus = "passed";
    document.body.dataset.smokeDetail = `${name} viewport=${innerWidth}x${innerHeight}`;
  } catch (error) {
    document.body.dataset.smokeStatus = "failed";
    document.body.dataset.smokeDetail = error.message;
    elements.watchError.textContent = error.message;
  }
}
