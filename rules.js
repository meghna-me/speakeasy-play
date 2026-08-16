/* Hunch — rule content.
 * Loaded as a classic script before the engine, so this works over file://
 * with no server. The engine never inspects a rule beyond calling fn().
 *
 * A probe is an array of {c,s}:
 *   c = colour index 0..2   s = size index 0..2 (small → large)
 * Order matters. Length 0..4. The empty probe is legal and often informative.
 *
 * Each rule carries:
 *   n        puzzle number (also selects the palette — see SKINS in the engine)
 *   tier     1 single attribute · 2 conjunction/order · 3 counting · 4 relational
 *            Also the bar on being a warm-up: the engine will not deal a starter
 *            above tier 2, because probe count measures information and tier is
 *            the only field that measures how hard the idea is to hold.
 *   space    OPTIONAL {cols:[…], sizes:[…]} — the drinks this rule is played
 *            with. Absent means the whole bar, 3 colours x 3 sizes, 7,381 rounds.
 *            A tutorial is a rule with a smaller space and nothing else: the
 *            engine narrows survivors, the exam, the regular's suggestion, both
 *            solvers, pass rate and equivalence to whatever is named here, and
 *            the picker offers exactly these drinks.
 *   fn       the predicate. Pure, total, no ties left undefined.
 *   text     plain-English reveal. MUST state tie semantics where a max/min
 *            is involved — a player should never have to discover those.
 *   seedYes  a probe that satisfies fn, shown at the start
 *   seedNo   a probe that does not, shown at the start
 *   ladder   OPTIONAL position in the on-ramp run, 1..N. A ladder rung is an
 *            existing rule's `fn` played on a SMALLER space, with seeds
 *            searched for that space — never a new predicate. Rungs are
 *            ordered by measurement: player-solver probes must not decrease as
 *            the index rises, and each must sit at or under the ladder cap,
 *            one below the daily floor. Rungs carry no par.
 *   reuses   which rule's predicate a rung borrows. Documentation for a reader;
 *            the identity that matters is `fn === base.fn`, which is what the
 *            gate checks.
 *   par      probes a minimal-pairs player needs FROM THESE SEEDS. Measured,
 *            never judged: `node tools/authoring.mjs --emit-par` prints it, and
 *            check-rules.mjs fails if it drifts from the measurement. It moves
 *            when the seeds move, so the two travel together. Dailies only —
 *            starters and held rules carry none, because a par on a
 *            ninety-second warm-up turns it into something you can fail.
 *   note     why this rule plays well; shown on the reveal screen
 *
 * Authoring gates (all measured, see check-rules.mjs):
 *   - seedYes must pass and seedNo must fail, using only drinks from the space
 *   - no two rules may be equivalent across the whole 7,381-probe space
 *   - every daily's par equals its measured player-solver number
 *   - pass rate should sit in the informative band; far outside it, probes
 *     stop teaching anything. Measured over the rule's OWN space — the same
 *     predicate is a wall in one space and a coin flip in another.
 */

const T = (c, s) => ({c, s});
function cnt(p, c){ return p.filter(t => t.c === c).length; }

const RULES = [
  {
    n:1, tier:1,
    hold: "78.9% pass — she takes almost everything, so a probe teaches nothing",
    fn: p => p.some(t => t.s === 0),
    text: () => `The ${U()} contains at least one ${SZ(0).toLowerCase()}.`,
    seedYes: [T(2,1), T(1,1), T(1,0), T(0,1)],
    seedNo:  [T(0,1), T(2,2)],
    note: "Size-first, so it defeats the reflex colour hypothesis. Held 2026-08-16: not hard but uninformative — at 78.9% she takes most things, so refusals are the only signal and 12 probes is a long way to grope. Restore by deleting hold and re-emitting par."
  },
  {
    n:2, tier:2,
    starter: true,
    fn: p => p.every((t,i) => i === 0 || t.c !== p[i-1].c),
    text: () => `No two side-by-side items share a colour.`,
    seedYes: [T(1,1), T(0,2)],
    seedNo:  [T(2,1), T(2,0), T(0,2)],
    note: "Order matters and brute force gives nothing. Falls in five probes whatever the seeds, so it is genuinely a gentle one."
  },
  {
    n:3, tier:2,
    hold: "21.0% pass — a wall of refusals",
    fn: p => p.every((t,i) => i === 0 || t.s >= p[i-1].s),
    text: () => `Sizes never decrease from left to right.`,
    seedYes: [T(0,0), T(0,0), T(1,1), T(0,1)],
    seedNo:  [T(2,1), T(2,0), T(2,1)],
    note: "Pure ordering. The moment every colour theory dies is the aha. Held 2026-08-16: the owner could not solve it live — at 21.0% she refuses four rounds in five, and single drinks and empty rounds always pass, so it reads as arbitrary before it reads as ordering. Restore by deleting hold and re-emitting par."
  },
  {
    n:4, tier:3,
    fn: p => cnt(p,0) > cnt(p,1),
    text: () => `There are strictly more ${CL(0)} than ${CL(1)}.`,
    seedYes: [T(1,1), T(0,2), T(2,0), T(0,2)],
    seedNo:  [T(1,0), T(1,1), T(0,0)],
    par: 6,
    note: "Counting failures are loud. Rival “≥ 2 of the first colour, or none of the second” dies to a balanced round."
  },
  {
    n:5, tier:3,
    hold: "no viable seeds",
    fn: p => p.length === new Set(p.map(t=>t.c)).size,
    text: () => `The number of items equals the number of different colours present.`,
    seedYes: [T(0,1), T(1,2)],
    seedNo:  [T(0,0), T(0,2), T(1,1)],
    note: "Cut: at 3.1% pass she refuses almost everything, and the seed search found no pair a modelled player can ever solve from."
  },
  {
    n:6, tier:3,
    hold: "pass rate 7.8% — a wall of refusals",
    fn: p => [0,1,2].filter(c => cnt(p,c) % 2 === 1).length === 1,
    text: () => `Exactly one colour appears an odd number of times.`,
    seedYes: [T(2,1), T(1,0), T(1,0)],
    seedNo:  [T(1,1), T(2,2), T(0,2), T(1,2)],
    note: "Parity — near misses look random, so guessing collapses. Held back: at 7.8% pass it is still a wall of refusals."
  },
  {
    n:7, tier:4,
    fn: p => {
      if (!p.length) return false;
      const max = Math.max(...p.map(t=>t.s));
      const i = p.findIndex(t => t.s === max);           // ties: leftmost largest
      return i > (p.length - 1 - i);
    },
    text: () => `More items sit to the left of the largest item than to its right. (Ties: the leftmost largest one counts.)`,
    seedYes: [T(2,0), T(1,1)],
    seedNo:  [T(1,2), T(1,2)],
    par: 6,
    note: "Positional-relational with zero colour content. Players burn probes on colour first."
  },

  /* --- week two. Chosen from 22 candidates by measured pass rate (all land
     21–47%, inside the informative band) and by DIMENSION, so consecutive days
     never test the same kind of thinking twice. --- */
  {
    n:8, tier:1,
    hold: "21.1% pass — a wall of refusals",
    fn: p => !p.some(t => t.s === 1),
    text: () => `The ${U()} contains no ${SZ(1)}.`,
    seedYes: [T(2,0), T(1,0), T(0,2), T(1,2)],
    seedNo:  [T(2,1), T(2,2), T(2,2), T(2,0)],
    note: "Absence, not presence — the dimension players check last. Held 2026-08-16: same wall as rule 3 at 21.1%, and absence is the hardest thing to notice while being refused four times in five. Restore by deleting hold and re-emitting par."
  },
  {
    n:9, tier:2,
    fn: p => p.every((t,i) => i === 0 || t.s !== p[i-1].s),
    text: () => `No two side-by-side items are the same size.`,
    seedYes: [T(0,1), T(2,2), T(1,1)],
    seedNo:  [T(1,0), T(0,0)],
    par: 6,
    note: "The size mirror of rule 2. Players who met rule 2 look at colour first and lose probes to it."
  },
  {
    n:10, tier:2,
    fn: p => p.length > 0 && p[0].c === p[p.length-1].c,
    text: () => `The first and last items share a colour. (A single item is its own first and last.)`,
    seedYes: [T(1,0), T(0,1), T(1,0)],
    seedNo:  [T(0,0), T(0,1), T(2,2)],
    par: 6,
    note: "Endpoints only, the middle is irrelevant. Fast at six probes, so it sits early in the rotation."
  },
  {
    n:11, tier:3,
    fn: p => p.filter(t=>t.s===2).length > p.filter(t=>t.s===0).length,
    text: () => `There are strictly more ${SZ(2)}s than ${SZ(0)}s.`,
    seedYes: [T(2,2), T(0,2), T(2,1)],
    seedNo:  [T(2,2), T(1,0)],
    par: 6,
    note: "Counting on size instead of colour. Rule 4 trains players to count colours; this punishes the habit."
  },
  {
    n:12, tier:3,
    fn: p => new Set(p.map(t=>t.s)).size === new Set(p.map(t=>t.c)).size,
    text: () => `The number of different sizes equals the number of different colours.`,
    seedYes: [T(2,1)],
    seedNo:  [T(2,2), T(2,1), T(2,1)],
    par: 6,
    note: "Cross-attribute: neither colour alone nor size alone explains it, so single-attribute theories all die."
  },
  {
    n:13, tier:4,
    fn: p => {
      if (p.length < 3) return false;
      const max = Math.max(...p.map(t=>t.s));
      const i = p.findIndex(t => t.s === max);           // ties: leftmost largest
      return i > 0 && i < p.length - 1;
    },
    text: () => `The largest item sits somewhere in the middle — never at either end. (Ties: the leftmost largest one counts.)`,
    seedYes: [T(0,0), T(1,2), T(1,1)],
    seedNo:  [T(0,1), T(2,2)],
    par: 6,
    note: "Positional. Seeds are searched rather than chosen — the hand-picked pair gave the game away in two probes."
  },
  {
    n:14, tier:4,
    hold: "tier 4 — coupled position and colour, too much for a warm-up",
    fn: p => p.length > 0 && cnt(p, p[0].c) === 1,
    text: () => `The first item is the only one of its colour.`,
    seedYes: [T(0,2), T(2,0)],
    seedNo:  [T(1,1), T(1,1), T(1,2)],
    note: "Position and colour coupled. Rules 10 and 14 look alike from the front and separate only on the tail. Held 2026-08-16: it was a starter, chosen because it falls in five probes — but five probes is an eighty-five-theory reasoner's number, and tier 4 is the hardest idea in the library to read as the second thing you ever see. The owner got stuck on it. Five probes is also under the daily gate, so it cannot simply be promoted; restore by re-searching seeds to 6+ and emitting par."
  },

  /* --- the tutorial. Two drinks, so the whole space is 31 rounds and a new
     player can enumerate it in their head instead of searching it. It is an
     ordinary rule with a smaller `space` — no tutorial code path exists. --- */
  {
    n:15, tier:2,
    starter: true,
    space: { cols: [0], sizes: [0, 2] },
    fn: p => p.length > 0 && p[0].s === 2,
    text: () => `The first item is a ${SZ(2).toLowerCase()}.`,
    seedYes: [T(0,2)],
    seedNo:  [T(0,0)],
    note: "Measured over its own 31 rounds: 48.4% pass (15 of 31), inside the 25–55% band, and five probes for the modelled player. Two sizes of one colour rather than two colours of one size, also measured: the library separates 39 theories over the size pair against 34 over the colour pair, and no size seed pair pins the rule before the first pour where three colour pairs do. The obvious reading of the seeds — she dislikes the small one — is wrong, and the round that breaks it is the whole lesson."
  }
];

/* --- the on-ramp ladder. ------------------------------------------------
 *
 * Nine levels before the dailies, and NOT ONE NEW PREDICATE. Difficulty is a
 * property of predicate x palette, not of the predicate: measured 2026-08-16,
 * rule 3 is a 21.0% wall at the full bar and a comfortable 48.4% on two drinks.
 * So a rung is an existing rule's `fn` — the same object, never a copy — played
 * on a smaller bar, with seeds searched for that bar.
 *
 * Each rung carries `ladder: k`, its position in the run. Rungs are ordered by
 * MEASUREMENT, not by taste: `E.playerSolverProbes` over the rung's own space
 * must be non-decreasing as k rises, and every rung must come in at or under
 * the ladder cap, which is one below the daily floor. The number that
 * disqualifies a daily — "it falls before it is a puzzle" — is exactly what
 * qualifies a rung. check-rules.mjs enforces both.
 *
 * Rungs carry NO par, for the same reason starters do not: a par on a level
 * meant to be a giveaway turns a giveaway into something you can fail.
 *
 * Three constraints that are not obvious and are all gated:
 *
 *   NINE DISTINCT PREDICATES, NOT NINE RUNGS OVER FIVE. A rung that repeats an
 *   earlier rung's predicate hands the player the later one's answer in plain
 *   English on the reveal screen. That is not a ramp, it is the same puzzle
 *   twice with the second one spoiled.
 *
 *   NEITHER WARM-UP'S PREDICATE APPEARS HERE. Rules 15 and 2 are already on the
 *   on-ramp, at the front and the back, so replaying either as a rung is the
 *   same spoiler in slower motion. With rules 1 and 5 out of band on every small
 *   bar and 6 a parity wall, that leaves exactly nine predicates — which is why
 *   the ladder is nine rungs and not ten.
 *
 *   EVERY RUNG WRITES ITS OWN REVEAL SENTENCE, for the bar it is played on. The
 *   predicate is shared; the wording must not be, and no two rules in this file
 *   may reveal the same sentence. Several of these are not paraphrases but
 *   collapses: on a two-size bar "sizes never decrease" IS "every shot comes
 *   before every highball", and that is the truer sentence there.
 *
 * The bar grows monotonically too — 2 cells, 3, 4, then 6 — so the run ends one
 * step below the nine-cell full bar the dailies are played on.
 * ---------------------------------------------------------------------- */

const LADDER = [
  { n:101, ladder:1, reuses:3,  space:{ cols:[0], sizes:[0,2] },
    text: () => `Every ${SZ(0).toLowerCase()} comes before every ${SZ(2).toLowerCase()}.`,
    seedYes:[T(0,0), T(0,2), T(0,2)], seedNo:[T(0,2), T(0,0), T(0,2)],
    note: "The tutorial's two drinks, a new rule. 48.4% of its 31 rounds and one probe for the modelled player: the seeds are the same three drinks reordered, which is the whole lesson — she is reading the order, not the drinks. Rule 3's predicate, which is a 21.0% wall at the full bar and held there for it." },
  { n:102, ladder:2, reuses:4,  space:{ cols:[0,1], sizes:[0] },
    text: () => `The ${CL(0)} outnumbers the ${CL(1)}.`,
    seedYes:[T(0,0), T(0,0)], seedNo:[T(0,0), T(1,0)],
    note: "Counting, on a bar with nothing else on it: one size, two colours. 35.5% pass, two probes. The seeds differ by exactly one drink, so the thing that changed is the thing that matters." },
  { n:103, ladder:3, reuses:10, space:{ cols:[0,1,2], sizes:[0] },
    text: () => `The ${U()} ends on the colour it started on. (One item on its own counts as both.)`,
    seedYes:[T(0,0), T(1,0), T(0,0)], seedNo:[T(0,0), T(2,0)],
    note: "Three colours, one size. 34.7% pass, two probes. The accepted seed has a stranger in the middle and she took it anyway, so 'they must all match' dies before the first pour." },
  { n:104, ladder:4, reuses:9,  space:{ cols:[0], sizes:[0,1,2] },
    text: () => `She never takes two of the same size next to each other.`,
    seedYes:[T(0,0), T(0,1)], seedNo:[T(0,0), T(0,0)],
    note: "One colour, three sizes — the first bar where size is the only thing on it. 38.0% pass, two probes. With colour gone there is nowhere else to look, which is the point of taking it away." },
  { n:105, ladder:5, reuses:14, space:{ cols:[0,1,2], sizes:[0] },
    text: () => `Nothing else in the ${U()} shares the colour of the first item.`,
    seedYes:[T(0,0)], seedNo:[T(0,0), T(0,0)],
    note: "Rule 14's predicate, held at the full bar because it couples position and colour and that is too much to meet second. On three shots it couples with nothing: the size dimension is not there. 37.2% pass, three probes." },
  { n:106, ladder:6, reuses:8,  space:{ cols:[0], sizes:[0,1,2] },
    text: () => `Not a single ${SZ(1).toLowerCase()} anywhere in the ${U()}.`,
    seedYes:[T(0,0), T(0,0)], seedNo:[T(0,1)],
    note: "Absence, the dimension players check last — rule 8's predicate, held at the full bar as a 21.1% wall. 25.6% pass here, which is low but readable: one of the three drinks is poison and everything else is fine. Three probes." },
  { n:107, ladder:7, reuses:13, space:{ cols:[0,1], sizes:[0,2] },
    text: () => `The biggest item has at least one item on each side of it. (Ties: the leftmost biggest one counts.)`,
    seedYes:[T(0,0), T(0,2), T(0,0)], seedNo:[T(1,0)],
    note: "The first bar with two attributes live at once, four cells. 32.8% pass, four probes. With only two sizes, 'the biggest' is never ambiguous, which is what makes a positional rule fair this early." },
  { n:108, ladder:8, reuses:11, space:{ cols:[0,1], sizes:[0,2] },
    text: () => `The ${SZ(2).toLowerCase()}s outnumber the ${SZ(0).toLowerCase()}s.`,
    seedYes:[T(0,2), T(0,2)], seedNo:[T(1,0)],
    note: "Counting again, on size instead of colour, with the middle size taken off the bar so there is nothing to be undecided about. 34.6% pass, five probes." },
  { n:109, ladder:9, reuses:12, space:{ cols:[0,1], sizes:[0,1,2] },
    text: () => `Count the different sizes, count the different colours: the two numbers match.`,
    seedYes:[T(0,0)], seedNo:[T(0,1), T(0,0)],
    note: "Last level before the bar opens fully — six cells, one colour short. 47.1% pass, the most informative rate on the ladder, and five probes. The first rule here that neither colour alone nor size alone can explain, which is the step the dailies start from." }
];

/* A rung is the base rule's own `fn`, BY REFERENCE — copying a predicate is
   what drifted last time, when a duplicate started dealing different puzzles
   than the game. The wording is the one thing a rung does not borrow: two rules
   revealing the same sentence spoil each other, so each rung says what its own
   bar makes true. */
for (const L of LADDER) {
  const base = RULES.find(r => r.n === L.reuses);
  if (!base) throw new Error(`ladder rung ${L.n} reuses rule ${L.reuses}, which does not exist`);
  RULES.push({
    n: L.n, tier: base.tier, ladder: L.ladder, reuses: L.reuses,
    space: L.space, fn: base.fn, text: L.text,
    seedYes: L.seedYes, seedNo: L.seedNo, note: L.note
  });
}

/* usable from node (check-rules.mjs) as well as the browser */
if (typeof module !== "undefined" && module.exports) module.exports = { RULES, T, cnt };
