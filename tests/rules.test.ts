import { describe, expect, it } from "vitest";
import { createGame, getLegalActions, power, validateDeck } from "../src/engine/index.ts";
import { act, battleTurn, has, KID_DECK, leader, LUFFY_DECK, newGame, toField, toHand } from "./helpers.ts";

describe("setup and turn structure", () => {
  it("starter decks are legal", () => {
    expect(validateDeck(LUFFY_DECK)).toEqual([]);
    expect(validateDeck(KID_DECK)).toEqual([]);
  });

  it("deals 5 cards and 5 Life, first player gets 1 DON!! and no draw", () => {
    const s = newGame();
    for (const pl of s.players) {
      expect(pl.life).toHaveLength(5);
      expect(pl.hand.length + pl.deck.length + pl.life.length).toBe(50);
    }
    expect(s.players[0].hand).toHaveLength(5);
    expect(s.players[0].donActive).toBe(1);
    expect(s.players[0].deck).toHaveLength(40);
  });

  it("mulligan redraws a fresh 5", () => {
    let s = createGame([LUFFY_DECK, KID_DECK], { seed: 3, firstPlayer: 1 });
    expect(s.pending).toEqual({ type: "mulligan", player: 1 });
    s = act(s, { type: "mulligan", redraw: true });
    expect(s.players[1].hand).toHaveLength(5);
    expect(s.pending).toEqual({ type: "mulligan", player: 0 });
  });

  it("second player draws and gets 2 DON!!; nobody battles on their first turn", () => {
    let s = newGame();
    expect(has(s, (a) => a.type === "attack")).toBe(false);
    s = act(s, { type: "endTurn" });
    expect(s.activePlayer).toBe(1);
    expect(s.players[1].hand).toHaveLength(6);
    expect(s.players[1].donActive).toBe(2);
    expect(has(s, (a) => a.type === "attack")).toBe(false);
    s = act(s, { type: "endTurn" });
    expect(s.players[0].donActive).toBe(3);
    expect(has(s, (a) => a.type === "attack")).toBe(true);
  });

  it("refresh phase returns attached DON!! rested and then sets everything active", () => {
    let s = newGame();
    s = act(s, { type: "attachDon", target: leader(s, 0) });
    expect(s.players[0].leader.attachedDon).toBe(1);
    s = act(s, { type: "endTurn" });
    s = act(s, { type: "endTurn" });
    expect(s.players[0].leader.attachedDon).toBe(0);
    expect(s.players[0].donActive).toBe(3);
  });
});

describe("DON!! and power", () => {
  it("attached DON!! give +1000 only during the owner's turn", () => {
    const s = battleTurn(newGame(), 0);
    s.players[0].leader.attachedDon = 2;
    expect(power(s, leader(s, 0))).toBe(7000);
    s.activePlayer = 1;
    expect(power(s, leader(s, 0))).toBe(5000);
  });
});

describe("playing cards", () => {
  it("pays cost by resting DON!! and enforces the 5 Character limit", () => {
    let s = battleTurn(newGame(), 0);
    s.players[0].hand = [];
    for (let i = 0; i < 5; i++) toField(s, 0, "ST01-003");
    const robin = toHand(s, 0, "ST01-008");
    expect(has(s, (a) => a.type === "playCard" && a.iid === robin && !a.replace)).toBe(false);
    const victim = s.players[0].characters[0].iid;
    s = act(s, { type: "playCard", iid: robin, replace: victim });
    expect(s.players[0].characters.map((c) => c.iid)).toContain(robin);
    expect(s.players[0].trash).toContain(victim);
    expect(s.players[0].donActive).toBe(7);
    expect(s.players[0].donRested).toBe(3);
  });

  it("a Character can't attack the turn it is played unless it has [Rush]", () => {
    let s = battleTurn(newGame(), 0);
    s.players[0].hand = [];
    const robin = toHand(s, 0, "ST01-008");
    const luffy = toHand(s, 0, "ST01-012");
    s = act(s, { type: "playCard", iid: robin });
    s = act(s, { type: "playCard", iid: luffy });
    expect(has(s, (a) => a.type === "attack" && a.attacker === robin)).toBe(false);
    expect(has(s, (a) => a.type === "attack" && a.attacker === luffy)).toBe(true);
  });

  it("Sanji gains [Rush] only with 2 DON!! attached", () => {
    let s = battleTurn(newGame(), 0);
    s.players[0].hand = [];
    const sanji = toHand(s, 0, "ST01-004");
    s = act(s, { type: "playCard", iid: sanji });
    expect(has(s, (a) => a.type === "attack" && a.attacker === sanji)).toBe(false);
    s = act(s, { type: "attachDon", target: sanji });
    s = act(s, { type: "attachDon", target: sanji });
    expect(has(s, (a) => a.type === "attack" && a.attacker === sanji)).toBe(true);
  });

  it("only rested Characters can be attacked", () => {
    const s = battleTurn(newGame(), 0);
    const active = toField(s, 1, "ST02-006");
    const rested = toField(s, 1, "ST02-011", { rested: true });
    expect(has(s, (a) => a.type === "attack" && a.target === active)).toBe(false);
    expect(has(s, (a) => a.type === "attack" && a.target === rested)).toBe(true);
  });
});

describe("battle", () => {
  it("a successful Leader attack moves the top Life card to hand", () => {
    let s = battleTurn(newGame(), 0);
    s.players[1].hand = [];
    const top = s.players[1].life[0];
    s = act(s, { type: "attack", attacker: leader(s, 0), target: leader(s, 1) });
    expect(s.players[1].life).toHaveLength(4);
    expect(s.players[1].hand).toEqual([top]);
    expect(s.players[0].leader.rested).toBe(true);
    expect(s.battle).toBeNull();
  });

  it("an attack with less power fails", () => {
    let s = battleTurn(newGame(), 0);
    s.players[1].hand = [];
    const bege = toField(s, 0, "ST02-004");
    void bege;
    const karoo = toField(s, 0, "ST01-006"); // 1000 power
    s = act(s, { type: "attack", attacker: karoo, target: leader(s, 1) });
    expect(s.players[1].life).toHaveLength(5);
  });

  it("K.O.s a Character on equal power and returns its DON!! rested", () => {
    let s = battleTurn(newGame(), 0);
    s.players[1].hand = [];
    const target = toField(s, 1, "ST02-011", { rested: true, attachedDon: 1 }); // 4000
    const vivi = toField(s, 0, "ST01-009"); // 4000
    s = act(s, { type: "attack", attacker: vivi, target });
    expect(s.players[1].trash).toContain(target);
    expect(s.players[1].donRested).toBe(1);
  });

  it("[Blocker] redirects the attack", () => {
    let s = battleTurn(newGame(), 0);
    s.players[1].hand = [];
    const bege = toField(s, 1, "ST02-004");
    s = act(s, { type: "attack", attacker: leader(s, 0), target: leader(s, 1) });
    expect(s.pending).toEqual({ type: "block", player: 1, options: [bege] });
    s = act(s, { type: "block", blocker: bege });
    expect(s.players[1].trash).toContain(bege);
    expect(s.players[1].life).toHaveLength(5);
  });

  it("Luffy (ST01-012) with 2 DON!! stops blockers; Usopp stops 5000+ blockers", () => {
    let s = battleTurn(newGame(), 0);
    s.players[1].hand = [];
    toField(s, 1, "ST02-004");
    const kid = toField(s, 1, "ST02-013"); // 7000 blocker
    const luffy = toField(s, 0, "ST01-012", { attachedDon: 2 });
    const usopp = toField(s, 0, "ST01-002", { attachedDon: 2 });
    const s1 = act(s, { type: "attack", attacker: luffy, target: leader(s, 1) });
    expect(s1.pending).toBeNull();
    expect(s1.players[1].life).toHaveLength(4);
    const s2 = act(s, { type: "attack", attacker: usopp, target: leader(s, 1) });
    expect(s2.pending?.type).toBe("block");
    expect(s2.pending && "options" in s2.pending && s2.pending.options).not.toContain(kid);
  });

  it("Counter cards and [Counter] Events raise power for the battle only", () => {
    let s = battleTurn(newGame(), 1);
    s.players[0].hand = [];
    s.players[0].donActive = 1;
    const usopp = toHand(s, 0, "ST01-002"); // counter 1000
    const guard = toHand(s, 0, "ST01-014"); // +3000, cost 1
    const koby = toField(s, 1, "ST02-006", { attachedDon: 3 }); // 9000
    s = act(s, { type: "attack", attacker: koby, target: leader(s, 0) });
    expect(s.pending?.type).toBe("counter");
    s = act(s, { type: "counterCard", iid: usopp, target: leader(s, 0) });
    s = act(s, { type: "counterEvent", iid: guard });
    expect(s.pending?.type).toBe("choose");
    // 5000 + 1000 + 3000 = 9000 ties the attacker; one more counter would be needed.
    s = act(s, { type: "choose", selection: [leader(s, 0)] });
    expect(s.pending).toBeNull(); // no counter options left, battle resolves
    expect(s.players[0].life).toHaveLength(4);
    expect(power(s, leader(s, 0))).toBe(5000);
    expect(s.players[0].trash).toEqual(expect.arrayContaining([usopp, guard]));
  });

  it("a player loses when their Leader takes damage at 0 Life", () => {
    let s = battleTurn(newGame(), 0);
    s.players[1].hand = [];
    s.players[1].life = [];
    s = act(s, { type: "attack", attacker: leader(s, 0), target: leader(s, 1) });
    expect(s.winner).toBe(0);
    expect(getLegalActions(s)).toEqual([]);
  });

  it("Double Attack takes 2 Life but can't win against 1 Life on its own", () => {
    let s = battleTurn(newGame(), 0);
    s.players[1].hand = [];
    const ace = toField(s, 0, "P-028"); // [Double Attack] 6000
    const s2 = act(s, { type: "attack", attacker: ace, target: leader(s, 1) });
    expect(s2.players[1].life).toHaveLength(3);
    s.players[1].life = s.players[1].life.slice(0, 1);
    const s3 = act(s, { type: "attack", attacker: ace, target: leader(s, 1) });
    expect(s3.players[1].life).toHaveLength(0);
    expect(s3.winner).toBeNull();
  });

  it("a player loses when their deck is empty", () => {
    const s = newGame();
    s.players[1].deck = s.players[1].deck.slice(0, 1);
    const s2 = act(s, { type: "endTurn" }); // player 2 draws their last card
    expect(s2.winner).toBe(0);
  });
});

describe("card effects", () => {
  it("Gum-Gum Jet Pistol K.O.s a Character with 6000 power or less", () => {
    let s = battleTurn(newGame(), 0);
    s.players[0].hand = [];
    const koby = toField(s, 1, "ST02-006"); // 6000
    const kid = toField(s, 1, "ST02-013"); // 7000
    const pistol = toHand(s, 0, "ST01-015");
    s = act(s, { type: "playCard", iid: pistol });
    expect(s.pending).toMatchObject({ type: "choose", options: [koby] });
    s = act(s, { type: "choose", selection: [koby] });
    expect(s.players[1].trash).toContain(koby);
    expect(s.players[1].characters.map((c) => c.iid)).toEqual([kid]);
    expect(s.players[0].trash).toContain(pistol);
  });

  it("Killer K.O.s only rested Characters with cost 3 or less", () => {
    let s = battleTurn(newGame(), 1);
    s.players[1].hand = [];
    const nami = toField(s, 0, "ST01-007", { rested: true });
    toField(s, 0, "ST01-010", { rested: true }); // cost 4
    toField(s, 0, "ST01-003"); // active
    const killer = toHand(s, 1, "ST02-005");
    s = act(s, { type: "playCard", iid: killer });
    expect(s.pending).toMatchObject({ type: "choose", options: [nami] });
  });

  it("Kid leader: rest 3 DON!! and trash a card to set the Leader active", () => {
    let s = battleTurn(newGame(), 1, 3);
    s = act(s, { type: "attack", attacker: leader(s, 1), target: leader(s, 0) });
    while (s.pending) s = act(s, getLegalActions(s).find((a) => a.type === "passCounter" || a.type === "block")!);
    expect(s.players[1].leader.rested).toBe(true);
    const handBefore = s.players[1].hand.length;
    s = act(s, { type: "activate", iid: leader(s, 1), ability: 0 });
    expect(s.pending).toMatchObject({ type: "choose", min: 1, max: 1 });
    s = act(s, { type: "choose", selection: [s.players[1].hand[0]] });
    expect(s.players[1].leader.rested).toBe(false);
    expect(s.players[1].hand).toHaveLength(handBefore - 1);
    expect(s.players[1].donActive).toBe(0);
    expect(has(s, (a) => a.type === "activate")).toBe(false); // once per turn
  });

  it("Bonney looks at 5 and may take a {Supernovas} card", () => {
    let s = battleTurn(newGame(), 1);
    const bonney = toField(s, 1, "ST02-007");
    const top5 = s.players[1].deck.slice(0, 5);
    s = act(s, { type: "activate", iid: bonney, ability: 0 });
    const pending = s.pending!;
    expect(pending.type).toBe("choose");
    const options = pending.type === "choose" ? pending.options : [];
    for (const o of options) expect(top5).toContain(o);
    s = act(s, { type: "choose", selection: options.slice(0, 1) });
    expect(s.players[1].deck.slice(-5 + options.slice(0, 1).length)).toEqual(top5.filter((x) => !options.slice(0, 1).includes(x)));
    expect(s.players[1].characters[0].rested).toBe(true);
  });

  it("X.Drake powers up Supernovas while rested on your turn", () => {
    const s = battleTurn(newGame(), 1);
    toField(s, 1, "ST02-014", { attachedDon: 1, rested: true });
    expect(power(s, leader(s, 1))).toBe(6000);
    s.activePlayer = 0;
    expect(power(s, leader(s, 1))).toBe(5000);
  });

  it("Urouge gets +2000 with 1 DON!! and 3 Characters", () => {
    const s = battleTurn(newGame(), 1);
    const urouge = toField(s, 1, "ST02-003", { attachedDon: 1 });
    expect(power(s, urouge)).toBe(4000);
    toField(s, 1, "ST02-012");
    toField(s, 1, "ST02-012");
    expect(power(s, urouge)).toBe(6000);
  });

  it("Hawkins sets itself active after battling a Character", () => {
    let s = battleTurn(newGame(), 1);
    s.players[0].hand = [];
    const hawkins = toField(s, 1, "ST02-010", { attachedDon: 1 });
    const target = toField(s, 0, "ST01-003", { rested: true });
    s = act(s, { type: "attack", attacker: hawkins, target });
    expect(s.players[0].trash).toContain(target);
    expect(s.players[1].characters[0].rested).toBe(false);
  });

  it("Kid (ST02-013) sets itself active at the end of your turn", () => {
    let s = battleTurn(newGame(), 1);
    s.players[0].hand = [];
    const kid = toField(s, 1, "ST02-013", { attachedDon: 1 });
    s = act(s, { type: "attack", attacker: kid, target: leader(s, 0) });
    s = act(s, { type: "endTurn" });
    expect(s.players[1].characters[0].rested).toBe(false);
  });

  it("Brook gives 2 rested DON!!", () => {
    let s = battleTurn(newGame(), 0, 5);
    s.players[0].hand = [];
    s.players[0].donRested = 2;
    const brook = toHand(s, 0, "ST01-011");
    s = act(s, { type: "playCard", iid: brook });
    s = act(s, { type: "choose", selection: [leader(s, 0)] });
    expect(s.players[0].leader.attachedDon).toBe(2);
    expect(s.players[0].donRested).toBe(2); // the 2 rested to pay for Brook
  });

  it("Diable Jambe makes a Straw Hat unblockable this turn", () => {
    let s = battleTurn(newGame(), 0);
    s.players[1].hand = [];
    s.players[0].hand = [];
    toField(s, 1, "ST02-004");
    const zoro = toField(s, 0, "ST01-013");
    s = act(s, { type: "playCard", iid: toHand(s, 0, "ST01-016") });
    s = act(s, { type: "choose", selection: [zoro] });
    s = act(s, { type: "attack", attacker: zoro, target: leader(s, 1) });
    expect(s.pending).toBeNull();
    expect(s.players[1].life).toHaveLength(4);
  });
});
