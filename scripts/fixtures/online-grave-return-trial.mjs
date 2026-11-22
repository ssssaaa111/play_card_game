import { DuelRoom, DuelRoomError } from "../../server/duel-room.js";
import { createOnlineDuelState } from "../../server/online-duel-state.js";
import { normalizeCommandEnvelope, sanitizeOnlineAction } from "../../src/duel-command.js";

export const graveReturnLimitReason = "本回合已发动过星尘回收，下个自己的回合可以再次发动。";

function graveReturnUsed(state, seatId) {
  if (state.turn.playerId !== seatId) return false;
  return state.events.findLast(event => event.type === "TURN_ENDED"
    || (event.type === "CARD_ACTIVATED" && event.playerId === seatId
      && state.cards[event.cardId]?.templateId === "grave-return"))?.type === "CARD_ACTIVATED";
}

// Local playtest rule shared by the paired simulation and the browser scenario.
export class GraveReturnTrialRoom extends DuelRoom {
  submit(connectionId, payload) {
    const seat = this.seatForConnection(connectionId);
    if (this.status === "playing" && seat && payload?.action?.type === "ACTIVATE_CARD") {
      const envelope = normalizeCommandEnvelope(payload);
      const receiptKey = `${seat.seatId}:${envelope.commandId}`;
      if (envelope.revision === this.revision && !this.commandReceipts.has(receiptKey)
          && this.seatList().every(entry => entry.connected)) {
        const rivalId = this.seatList().find(entry => entry.seatId !== seat.seatId).seatId;
        const action = sanitizeOnlineAction(envelope.action, { seatId: seat.seatId, rivalId });
        const state = this.engine.getState();
        if (state.cards[action.cardId]?.templateId === "grave-return"
            && state.players[seat.seatId].hand.includes(action.cardId) && graveReturnUsed(state, seat.seatId)) {
          throw new DuelRoomError(graveReturnLimitReason, "ILLEGAL_COMMAND");
        }
      }
    }
    return super.submit(connectionId, payload);
  }

  viewFor(seatId) {
    const view = super.viewFor(seatId);
    const legal = view.legalActions;
    if (!legal?.can.activateCard) return view;

    const hand = view.players[seatId].hand;
    const recoveryIds = new Set(hand.filter(card => card.templateId === "grave-return").map(card => card.id));
    const blocked = legal.actions.activateCard.filter(action => recoveryIds.has(action.cardId));
    if (!blocked.length || !graveReturnUsed(this.engine.getState(), seatId)) return view;

    for (const { cardId } of blocked) {
      legal.unavailableHandActions[cardId] = { code: "GRAVE_RETURN_LIMIT", label: "次数用完", reason: graveReturnLimitReason };
    }
    legal.actions.activateCard = legal.actions.activateCard.filter(action => !recoveryIds.has(action.cardId));
    legal.can.activateCard = legal.actions.activateCard.length > 0;
    legal.hasAny = legal.can.summon || legal.can.setTrap || legal.can.activateCard || legal.can.declareAttack || legal.can.changeMode;
    return view;
  }
}

export function createGraveReturnTrialState(config) {
  return createOnlineDuelState({
    ...config,
    openingHands: {
      p1: ["grave-return", "grave-return", "solar-knight", "war-chant", "guard-sigil"],
      p2: ["grave-return", "solar-knight", "gale-mage", "war-chant", "guard-sigil"]
    },
    openingGraves: { p1: ["iron-guardian", "mirror-snare"], p2: ["iron-guardian"] }
  });
}
