/* Speakeasy — the hypothesis library.
 *
 * Not the puzzles. This is the space of theories a PLAYER might plausibly be
 * holding, and the engine uses it for three things:
 *
 *   1. Exam generation — the four unseen rounds must separate the truth from
 *      every other theory still consistent with what the player has seen.
 *      Without this the exam can certify a player who is wrong.
 *   2. Rival naming — when exactly one other theory survives, we can hand the
 *      player their own reasoning back by name.
 *   3. The notebook — the whole library, grouped and struck through as the
 *      evidence kills it. See engine.notebookPage.
 *
 * Coverage is not guaranteed: a player may hold a theory outside this list.
 * That is why rival naming is guarded (see engine.nameRival) — we stay silent
 * rather than confidently attribute a theory nobody held.
 *
 * Every shipping rule in rules.js must be equivalent to some entry here, or
 * the truth would not appear among its own survivors. Enforced by test.
 *
 * NO ENTRY CARRIES A CATEGORY. The notebook groups these sentences by what the
 * verdict measurably depends on, derived per bar from the predicate itself
 * (engine.familyOf). A hand-written tag would be content that has to be kept
 * true by hand, and this repo has watched that drift twice.
 *
 * ---------- how a sentence is worded ----------
 *
 * text(C, S, N) takes the current skin's colour names, size names and ITEM
 * NOUN, so a hypothesis reads in whatever bar the player is standing in.
 *
 * `N` is optional and defaults to the drink noun, because callers older than it
 * — the gate script, the rival-naming tests — pass two arguments and must keep
 * getting exactly the sentence they got before.
 *
 * The item noun exists because "drink" was hardcoded eighty times. That was
 * invisible while only `nameRival` ever quoted one sentence at a reveal; the
 * notebook puts all eighty on screen at once, and "the largest drink is Red"
 * over a bar of circles is the skin leaking through the copy.
 *
 * Singular and plural are chosen by the number, for the same reason: "there are
 * exactly 1 drinks" is a sentence nobody would write, and it is now permanently
 * on screen rather than quoted once in a blue moon.
 */

const HYPOTHESES = (() => {
  const H = [];
  /* The default noun is applied HERE rather than in each sentence, so no entry
     can forget it and every entry stays a one-liner. */
  const ITEM = { one: "drink", many: "drinks" };
  const add = (text, fn) =>
    H.push({ id: H.length, text: (C, S, N) => text(C, S, N || ITEM), fn });

  const cnt  = (p, c) => p.filter(t => t.c === c).length;
  const cntS = (p, s) => p.filter(t => t.s === s).length;
  const maxS = p => Math.max(...p.map(t => t.s));
  const total = p => p.reduce((a, t) => a + t.s + 1, 0);
  const be    = n => (n === 1 ? "is" : "are");
  const items = (n, N) => `${n} ${n === 1 ? N.one : N.many}`;

  for (let c = 0; c < 3; c++) {
    add((C) => `it contains at least one ${C[c]}`,            p => cnt(p, c) > 0);
    add((C) => `it contains no ${C[c]}`,                       p => cnt(p, c) === 0);
    add((C, S, N) => `the first ${N.one} is ${C[c]}`,          p => p.length > 0 && p[0].c === c);
    add((C, S, N) => `the last ${N.one} is ${C[c]}`,           p => p.length > 0 && p[p.length - 1].c === c);
    add((C, S, N) => `the largest ${N.one} is ${C[c]}`,        p => p.length > 0 && p.some(t => t.s === maxS(p) && t.c === c));
    add((C, S, N) => `every smallest ${N.one} is ${C[c]}`,     p => {
      if (!p.length) return false;
      const m = Math.min(...p.map(t => t.s));
      return p.filter(t => t.s === m).every(t => t.c === c);
    });
    add((C) => `they are all ${C[c]}`,                         p => p.length > 0 && p.every(t => t.c === c));
    for (let d = 0; d < 3; d++) if (c !== d)
      add((C) => `there is more ${C[c]} than ${C[d]}`,         p => cnt(p, c) > cnt(p, d));
  }

  for (let s = 0; s < 3; s++) {
    add((C, S) => `it contains at least one ${S[s]}`,          p => cntS(p, s) > 0);
    add((C, S) => `it contains no ${S[s]}`,                    p => cntS(p, s) === 0);
    add((C, S, N) => `the first ${N.one} is a ${S[s]}`,        p => p.length > 0 && p[0].s === s);
    add((C, S, N) => `the last ${N.one} is a ${S[s]}`,         p => p.length > 0 && p[p.length - 1].s === s);
    add((C, S) => `they are all ${S[s]}s`,                     p => p.length > 0 && p.every(t => t.s === s));
    for (let r = 0; r < 3; r++) if (s !== r)
      add((C, S) => `there are more ${S[s]}s than ${S[r]}s`,   p => cntS(p, s) > cntS(p, r));
  }

  /* The endpoints of this loop generate degenerate entries, and a DUPLICATE is
     worse than a missing hypothesis: a pair that is behaviourally identical
     always survives or dies together, so `survivors` can never reach one, and
     `nameRival` — which speaks only when exactly one rival stands — falls
     silent and the game tells a player with a wrong theory "you had her
     pinned". Reachable on starter rule 2 in two probes.
       n = 0 : "at least 0" and "at most 4" are tautologies, true of every round
       n = 4 : "exactly 4" IS "at least 4", because 4 is MAX_DRINKS
     Nobody holds a tautology as a theory, so these are not worth keeping. */
  /* FROM 1, NOT 0, AND THE BOUNDS ARE GUARDED AT BOTH ENDS. A round is 1..4
     drinks — the empty round left the space on 2026-08-18 — so three sentences
     stopped saying anything and were removed with it: "there are exactly 0
     drinks" refuses every round, "there is at least 1 drink" accepts every
     round, and "there is at most 1 drink" became a second wording of "there is
     exactly 1". check-rules.mjs fails on all three shapes, which is how they
     were caught. The `n < 4` guard is the same rule at the top of the range and
     predates this; the `n > 1` guard is its mirror. Library 80 -> 77. */
  for (let n = 1; n <= 4; n++) {
    add((C, S, N) => `there ${be(n)} exactly ${items(n, N)}`,  p => p.length === n);
    if (n > 1 && n < 4)
      add((C, S, N) => `there ${be(n)} at least ${items(n, N)}`, p => p.length >= n);
    if (n > 1 && n < 4)
      add((C, S, N) => `there ${be(n)} at most ${items(n, N)}`,  p => p.length <= n);
  }

  add((C, S, N) => `no two side-by-side ${N.many} share a colour`,    p => p.every((t, i) => i === 0 || t.c !== p[i - 1].c));
  add((C, S, N) => `no two side-by-side ${N.many} are the same size`, p => p.every((t, i) => i === 0 || t.s !== p[i - 1].s));
  add(() => `the sizes never decrease from left to right`,     p => p.every((t, i) => i === 0 || t.s >= p[i - 1].s));
  add(() => `the sizes never increase from left to right`,     p => p.every((t, i) => i === 0 || t.s <= p[i - 1].s));
  add(() => `the sizes never decrease, and rise at least once`,
      p => p.every((t, i) => i === 0 || t.s >= p[i - 1].s) && p.some((t, i) => i > 0 && t.s > p[i - 1].s));
  add((C, S, N) => `every ${N.one} is the same size`,          p => p.length > 0 && p.every(t => t.s === p[0].s));
  add((C, S, N) => `every ${N.one} is the same colour`,        p => p.length > 0 && p.every(t => t.c === p[0].c));
  add((C, S, N) => `the first and last ${N.many} share a colour`,    p => p.length > 0 && p[0].c === p[p.length - 1].c);
  add((C, S, N) => `the first and last ${N.many} are the same size`, p => p.length > 0 && p[0].s === p[p.length - 1].s);
  add((C, S, N) => `the first ${N.one} is the only one of its colour`, p => p.length > 0 && cnt(p, p[0].c) === 1);
  add((C, S, N) => `the last ${N.one} is the only one of its colour`,  p => p.length > 0 && cnt(p, p[p.length - 1].c) === 1);
  add((C, S, N) => `the largest ${N.one} is last`,             p => p.length > 0 && p[p.length - 1].s === maxS(p));
  add((C, S, N) => `the largest ${N.one} is first`,            p => p.length > 0 && p[0].s === maxS(p));
  add((C, S, N) => `the largest ${N.one} sits in the middle`,  p => {
    if (p.length < 3) return false;
    const i = p.findIndex(t => t.s === maxS(p));
    return i > 0 && i < p.length - 1;
  });
  add((C, S, N) => `more ${N.many} sit left of the largest than right`, p => {
    if (!p.length) return false;
    const i = p.findIndex(t => t.s === maxS(p));
    return i > (p.length - 1 - i);
  });
  add(() => `exactly one colour appears an odd number of times`,
      p => [0, 1, 2].filter(c => cnt(p, c) % 2 === 1).length === 1);
  /* "the number of drinks equals the number of different colours" lived here
     and is the same predicate as "no colour appears twice" below — every round
     agrees. Kept the plainer sentence, since the rival line quotes it back to
     the player as the theory they were drinking on. */
  add(() => `the number of different sizes equals the number of different colours`,
      p => new Set(p.map(t => t.s)).size === new Set(p.map(t => t.c)).size);
  add(() => `the colours read the same both ways`, p => {
    const a = p.map(t => t.c);
    return a.join("") === [...a].reverse().join("");
  });
  add(() => `the sizes read the same both ways`, p => {
    const a = p.map(t => t.s);
    return a.join("") === [...a].reverse().join("");
  });
  add(() => `the total size is even`,                          p => total(p) % 2 === 0);
  add(() => `no colour appears twice`,                         p => [0, 1, 2].every(c => cnt(p, c) <= 1));

  /* ---------- 2026-08-18: 77 -> 120 ----------
   *
   * Three of the original eighty were about the empty round and left with it.
   * The forty-three below were added in the same change, for two reasons that
   * are really one: the library is the model of what a player might be
   * thinking, and a thin model makes puzzles measure easy. Rule 12 fell to five
   * probes the moment the empty round went — not because the puzzle changed but
   * because the modelled player had one fewer theory to eliminate — and the fix
   * for that is a fuller library, not a lower gate. Measured after: rule 12 is
   * back over the daily floor, and the seed search re-aimed every rule at the
   * same target it always had.
   *
   * EVERY ONE IS BEHAVIOURALLY DISTINCT over the 7,380-round bar, checked by
   * enumeration before being written here — forty-nine were drafted and six did
   * not survive: one was a re-wording of an entry already present, and five were
   * dropped by hand as sentences nobody holds ("there are more drinks than
   * colours in them" is true of 97% of rounds and is never anybody's theory).
   * A sentence that survives almost every round is a row that never gets
   * crossed off, which is clutter on the page and a rival the solver has to
   * spend a probe on for no reason.
   *
   * The COLOUR x SIZE block is the only cross-attribute presence family in the
   * library, and it is the theory a first-timer reaches for out loud — "they
   * want a Red Mug in there somewhere". Nine sentences of one shape is a lot,
   * and it is deliberate: they separate from each other on single-drink rounds,
   * which is the cheapest probe there is. */
  const minS = p => Math.min(...p.map(t => t.s));
  const nC = p => new Set(p.map(t => t.c)).size;
  const nS = p => new Set(p.map(t => t.s)).size;

  for (let c = 0; c < 3; c++) {
    add((C) => `there is exactly one ${C[c]}`,                p => cnt(p, c) === 1);
    add((C) => `there are at least two ${C[c]}`,              p => cnt(p, c) >= 2);
    add((C) => `there is more ${C[c]} than anything else`,    p => [0, 1, 2].every(d => d === c || cnt(p, c) > cnt(p, d)));
  }
  for (let s = 0; s < 3; s++) {
    add((C, S) => `there is exactly one ${S[s]}`,             p => cntS(p, s) === 1);
    add((C, S) => `there are at least two ${S[s]}s`,          p => cntS(p, s) >= 2);
  }
  for (let c = 0; c < 3; c++) for (let s = 0; s < 3; s++)
    add((C, S) => `it contains a ${C[c]} ${S[s]}`,            p => p.some(t => t.c === c && t.s === s));

  add((C, S, N) => `there are an even number of ${N.many}`,   p => p.length % 2 === 0);
  add(() => `every colour appears`,                           p => nC(p) === 3);
  add(() => `every size appears`,                             p => nS(p) === 3);
  add(() => `exactly two colours appear`,                     p => nC(p) === 2);
  add(() => `exactly two sizes appear`,                       p => nS(p) === 2);
  /* Strictly, where 58 and 60 are the non-strict pair. A player who says "they
     get bigger" usually means this one, and it dies to any repeated size. */
  add((C, S, N) => `each ${N.one} is bigger than the one before`,  p => p.every((t, i) => i === 0 || t.s > p[i - 1].s));
  add((C, S, N) => `each ${N.one} is smaller than the one before`, p => p.every((t, i) => i === 0 || t.s < p[i - 1].s));
  add(() => `the sizes never increase, and fall at least once`,
      p => p.every((t, i) => i === 0 || t.s <= p[i - 1].s) && p.some((t, i) => i > 0 && t.s < p[i - 1].s));
  add((C, S, N) => `the same ${N.one} appears twice`,         p => new Set(p.map(t => `${t.c}${t.s}`)).size < p.length);
  add((C, S, N) => `the first and last ${N.many} are exactly alike`,
      p => p.length > 0 && p[0].c === p[p.length - 1].c && p[0].s === p[p.length - 1].s);
  add((C, S, N) => `the smallest ${N.one} is first`,          p => p.length > 0 && p[0].s === minS(p));
  add((C, S, N) => `the smallest ${N.one} is last`,           p => p.length > 0 && p[p.length - 1].s === minS(p));
  add((C, S, N) => `the largest ${N.one} is the only one of its size`, p => p.length > 0 && cntS(p, maxS(p)) === 1);
  add((C, S, N) => `every ${N.one} is a different size`,      p => nS(p) === p.length);
  add((C, S, N) => `the first two ${N.many} share a colour`,    p => p.length >= 2 && p[0].c === p[1].c);
  add((C, S, N) => `the last two ${N.many} share a colour`,     p => p.length >= 2 && p[p.length - 1].c === p[p.length - 2].c);
  add((C, S, N) => `the first two ${N.many} are the same size`, p => p.length >= 2 && p[0].s === p[1].s);
  add((C, S, N) => `the last two ${N.many} are the same size`,  p => p.length >= 2 && p[p.length - 1].s === p[p.length - 2].s);
  add(() => `the colours never go backwards from left to right`, p => p.every((t, i) => i === 0 || t.c >= p[i - 1].c));

  return H;
})();

if (typeof module !== "undefined" && module.exports) module.exports = { HYPOTHESES };
