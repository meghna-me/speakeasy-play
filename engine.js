/* Speakeasy — the engine. The one seam.
 *
 * Pure. No DOM, no timers, no ambient randomness — anything stochastic takes
 * an rng parameter so every result is reproducible. The page is a renderer
 * over this; the CLI playtest harness is a second renderer over this; the
 * tests talk to it directly.
 *
 * Vocabulary: a DRINK is {c,s} (colour index, size index). A ROUND is an
 * ordered array of 0..4 drinks. A PROBE is a round the player submitted plus
 * the bartender's verdict and the player's call. A SURVIVOR is a hypothesis
 * still consistent with everything the player has seen.
 */

const FREE_PROBES  = 2;   // first two rounds need no call — nothing to reason from yet
const EXAM_N       = 4;   // four items, forced 2/2, so C(4,2) = 6 balanced patterns: a blind guess is 1 in 6
const EXAM_PENALTY = 3;   // what the FIRST failed exam costs — see examCharge, the k-th costs k times this
const MAX_DRINKS   = 4;
const MAX_STARTER_TIER = 2;   // see isStarter — tier is conceptual load, and a warm-up may not carry much

/* ---------- the round space ---------- */

/* The space a rule is played in is a PROPERTY OF THE RULE, not a constant of the
   engine. A rule with no `space` gets the full bar; a tutorial rule names fewer
   colours or fewer sizes and everything derived from the space — survivors, the
   exam, the regular's suggestion, both solver models, pass rate, equivalence —
   narrows with it. There is deliberately no second code path for tutorials: a
   tutorial rule differs from a daily only in this one field.

   Drinks are enumerated colour-major, size-minor, which is the order the whole
   engine walked before the space was a parameter — so the full-palette game is
   unchanged down to which probe each solver reaches for first. */
const FULL_SPACE = { cols: [0, 1, 2], sizes: [0, 1, 2] };

const _spaces = new Map();
function spaceOf(sp) {
  const raw = sp || FULL_SPACE;
  const key = `${raw.cols.join("")}:${raw.sizes.join("")}`;
  let got = _spaces.get(key);
  if (!got) {
    const drinks = [];
    for (const c of raw.cols) for (const s of raw.sizes) drinks.push({ c, s });
    got = { key, cols: raw.cols.slice(), sizes: raw.sizes.slice(), drinks };
    _spaces.set(key, got);
  }
  return got;
}

/* What the picker is allowed to offer, and what the legend must name. */
const roundSpace = rule => spaceOf(rule && rule.space);

const inSpace = (round, sp) => {
  const S = spaceOf(sp);
  return round.every(t => S.cols.includes(t.c) && S.sizes.includes(t.s));
};

/* Memoised PER SPACE — one global cache would hand a tutorial the full bar (or
   worse, hand the bar a tutorial) depending on which was asked for first. */
const _all = new Map();
function allRounds(sp) {
  const S = spaceOf(sp);
  const hit = _all.get(S.key);
  if (hit) return hit;
  const out = [[]];
  let frontier = [[]];
  for (let len = 0; len < MAX_DRINKS; len++) {
    const next = [];
    for (const p of frontier)
      for (const d of S.drinks) { const q = p.concat([{ c: d.c, s: d.s }]); next.push(q); out.push(q); }
    frontier = next;
  }
  _all.set(S.key, out);
  return out;
}
const roundKey = r => r.map(t => `${t.c}${t.s}`).join("-") || "-";

/* ---------- session ---------- */

function newSession(rule, now) {
  return {
    ruleId: rule.n,
    probes: [],            // {round, accepted, call}  call === null for the free ones
    exam: null,            // [{round, accepted, answer}]
    failedExams: 0,
    hints: 0,              // suggestions taken; each one costs a probe
    phase: "play",         // play | exam | done
    startedAt: now,
    lastActiveAt: now
  };
}

const callRequired = s => s.probes.length >= FREE_PROBES;

function probe(session, rule, round, call, now) {
  if (session.phase !== "play") throw new Error("not in the probing phase");
  if (round.length > MAX_DRINKS) throw new Error("a round holds at most " + MAX_DRINKS);
  const needsCall = callRequired(session);
  if (needsCall && typeof call !== "boolean") throw new Error("call the round before you pour it");
  return {
    ...session,
    probes: session.probes.concat([{ round, accepted: rule.fn(round), call: needsCall ? call : null }]),
    lastActiveAt: now ?? session.lastActiveAt
  };
}

/* ---------- what the player has actually been shown ---------- */

function evidence(session, rule) {
  return [{ round: rule.seedYes, accepted: true }, { round: rule.seedNo, accepted: false }]
    .concat(session.probes.map(p => ({ round: p.round, accepted: p.accepted })));
}

/* Hypotheses consistent with every data point, minus any that is merely the
   truth wearing a different sentence. */
function survivors(session, rule, library) {
  const ev = evidence(session, rule);
  const all = allRounds(rule.space);
  return library.filter(h =>
    ev.every(e => h.fn(e.round) === e.accepted) &&
    !all.every(r => h.fn(r) === rule.fn(r))
  );
}

/* ---------- minimal pairs ---------- */

/* Every round one change away: recolour a drink, resize a drink, take one out,
   add one on the end. Defined once and shared — the solver model and the hint
   must mean the same thing by "one thing changed", or the game would be rating
   rules against a strategy it does not itself teach.

   "One change" is only meaningful inside a space: a recolour is another drink of
   the SAME size that the space actually holds, a resize another drink of the same
   colour. In a two-drink tutorial that leaves swapping, dropping and appending —
   which is the whole game there. */
function neighbours(round, sp) {
  const S = spaceOf(sp);
  const out = [];
  for (let i = 0; i < round.length; i++)
    for (const d of S.drinks) if (d.s === round[i].s && d.c !== round[i].c)
      out.push(round.map((t, j) => j === i ? { c: d.c, s: t.s } : t));
  for (let i = 0; i < round.length; i++)
    for (const d of S.drinks) if (d.c === round[i].c && d.s !== round[i].s)
      out.push(round.map((t, j) => j === i ? { c: t.c, s: d.s } : t));
  for (let i = 0; i < round.length; i++)
    out.push(round.filter((_, j) => j !== i));
  if (round.length < MAX_DRINKS)
    for (const d of S.drinks) out.push(round.concat([{ c: d.c, s: d.s }]));
  return out;
}

/* ---------- the regular's suggestion ---------- */

/* A hint hands over a ROUND, never a rule, and it is deliberately not the
   information-optimal round. Ranked over the whole space, one suggestion kills
   every rival at once and the game becomes "ask, then declare" for one probe.
   So the regular suggests a MINIMAL PAIR: something she took, with one thing
   changed. That is the strategy the game already rates rules against, so the
   hint teaches the method instead of skipping to the end. Only when no minimal
   pair would tell you anything does it widen to the whole space.

   Deterministic — walks in order, ties to the shorter round — so the same
   evidence always yields the same suggestion. */
function suggestProbe(session, rule, library) {
  const alive = survivors(session, rule, library);
  if (!alive.length) return null;               // she is already pinned
  const seen = new Set(session.probes.map(p => roundKey(p.round)));
  seen.add(roundKey(rule.seedYes));
  seen.add(roundKey(rule.seedNo));

  const taken  = session.probes.filter(p => p.accepted);
  const anchor = taken.length ? taken[taken.length - 1].round : rule.seedYes;

  /* The FIRST informative neighbour, not the best one. Ranking by how many
     rivals a round kills makes the regular an oracle: measured, greedy hints
     pinned every rule down in 2-3 asks against pars of 6-12. Taking the first
     one that teaches anything costs a mean of 8.8 asks — about par — so a
     player who asks every turn finishes no better than one who plays well. */
  const pick = pool => {
    for (const r of pool) {
      if (seen.has(roundKey(r))) continue;
      if (alive.some(h => h.fn(r) !== rule.fn(r))) return r;
    }
    return null;
  };
  return pick(neighbours(anchor, rule.space)) || pick(allRounds(rule.space));
}

/* Charged a probe each, so asking is never free and never forbidden. A player
   who asks every turn converges fast and scores badly, which is the trade. */
function takeHint(session, now) {
  return { ...session, hints: (session.hints ?? 0) + 1,
           lastActiveAt: now ?? session.lastActiveAt };
}

/* ---------- the exam ---------- */

/* Four unseen rounds, balanced two accepted / two refused, chosen so that every
   surviving rival disagrees with the truth on at least one of them. Greedy over
   the rule's round space — 7,381 candidates against a small library, milliseconds.
   In a tutorial space it is 31 candidates, so the side that runs dry first caps
   the exam at fewer than four items; answerExam grades against what was actually
   dealt rather than against EXAM_N. */
function buildExam(session, rule, library, rng) {
  const rivals = survivors(session, rule, library);
  const seen = new Set(session.probes.map(p => roundKey(p.round)));
  seen.add(roundKey(rule.seedYes));
  seen.add(roundKey(rule.seedNo));
  /* Rounds from an exam the player just failed are SEEN — they were shown, and
     the failure screen named which ones were missed. Re-offering them hands
     back a question whose answer was just published. A fresh seed alone does
     not prevent it; the pool has to exclude them. */
  if (session.exam) for (const q of session.exam) seen.add(roundKey(q.round));

  const pool = shuffle(allRounds(rule.space).filter(r => !seen.has(roundKey(r))), rng)
    .map(round => ({ round, accepted: rule.fn(round) }));

  const need = { true: EXAM_N / 2, false: EXAM_N / 2 };
  const uncovered = new Set(rivals.map(h => h.id));
  const picked = [];

  // separates(round) = the rivals this round would expose
  const separates = round => rivals.filter(h => uncovered.has(h.id) && h.fn(round) !== rule.fn(round));

  while (picked.length < EXAM_N) {
    let best = null, bestGain = -1;
    for (const cand of pool) {
      if (need[cand.accepted] <= 0) continue;
      if (picked.some(p => roundKey(p.round) === roundKey(cand.round))) continue;
      const gain = separates(cand.round).length;
      if (gain > bestGain) { best = cand; bestGain = gain; }
      if (gain === uncovered.size && gain > 0) break;   // can't do better
    }
    if (!best) break;                                    // pool exhausted on this side
    separates(best.round).forEach(h => uncovered.delete(h.id));
    need[best.accepted] -= 1;
    picked.push({ round: best.round, accepted: best.accepted, answer: null });
  }
  /* Shuffle, or the ORDER leaks the answers. The greedy loop above fills the
     accepted side first whenever an accepted round separates more rivals, so
     the emitted pattern was measurably lop-sided: YNNY turned up 31% of the
     time against a uniform 16.7%, and guessing the commonest pattern beat
     chance nearly two to one. The player is meant to read the drinks, not the
     positions. */
  return { items: shuffle(picked, rng), unseparated: uncovered.size };
}

/* The seed is derived HERE, not by the caller, and it counts failed attempts.
   It used to be (rule, probes.length) computed in the page — which meant
   declaring again without pouring anything produced the identical four rounds.
   Combined with a failure screen that names which items were wrong, that was a
   complete exploit: answer everything "yes", read off the two it names, flip
   them, pass 4/4 having deduced nothing. Measured, reproduced, and the reason
   the caller no longer gets to choose. `rng` is still accepted so a test can
   force a specific exam; omit it and the session decides. */
function examSeed(session, rule) {
  return rule.n * 7919 + session.probes.length * 31 + session.failedExams * 104729;
}

function declare(session, rule, library, rng, now) {
  if (session.phase !== "play") throw new Error("already declared");
  const { items } = buildExam(session, rule, library, rng ?? seededRng(examSeed(session, rule)));
  return { ...session, phase: "exam", exam: items, lastActiveAt: now ?? session.lastActiveAt };
}

/* THE CHARGE RISES WITH THE NUMBER OF FAILURES. The k-th failed exam costs
   k * EXAM_PENALTY, so the total after n failures is the triangular number
   EXAM_PENALTY * n(n+1)/2: 3, 9, 18, 30, 45.

   A flat charge priced the exam like a slot machine. Four items with a forced
   2/2 split is 6 balanced patterns, `examSeed` counts `failedExams` so every
   retry is a genuinely fresh exam, and the two measure out like this — over the
   seven dailies against all six balanced patterns, against a par of 6:

     attempts   pass    flat: mean charge / worst   rising: mean / worst
        1       16.7%          2.50 /  3                  2.50 /   3
        2       28.6%          4.64 /  6                  6.79 /   9
        4       50.0%          7.86 / 12                 17.93 /  30
        8       78.6%         11.29 / 24                 39.43 / 108

   So deducing NOTHING used to buy a coin-flip pass for twice par, and the share
   card then certified it. It now costs five times par to reach the same odds.

   The first failure is deliberately unchanged. A player who declares a
   plausible wrong theory, is told it does not fit and goes back to the bar is
   doing exactly what the game wants, and must not be taxed for it; `stuck`
   already offers them the way out from that first failure onward. It is the
   FOURTH attempt that has to hurt, because only a farmer reaches it.

   Uncapped on purpose: any cap is the price of the farm, and a farmer would
   simply pay it. Pure arithmetic on a count, so it holds for a session
   persisted before this existed. */
const examCharge  = k => k * EXAM_PENALTY;                  // the k-th failure alone
const examPenalty = n => EXAM_PENALTY * n * (n + 1) / 2;    // all n of them together

/* Four for four passes. Anything less returns the player to the bar with a
   charge of `examCharge(failedExams)`, so declaring early costs something and
   declaring blind repeatedly costs a great deal.

   Graded against the number of items DEALT, not against EXAM_N. In the full bar
   those are always both four; in a space small enough to exhaust, buildExam can
   deal fewer, and demanding four out of three is a lock with no key. */
function answerExam(session, answers, now) {
  if (session.phase !== "exam") throw new Error("no exam in progress");
  const graded = session.exam.map((q, i) => ({ ...q, answer: !!answers[i] }));
  const of = graded.length;
  const right = graded.filter(q => q.answer === q.accepted).length;
  const passed = right === of;
  return {
    ...session,
    exam: graded,
    phase: passed ? "done" : "play",
    failedExams: session.failedExams + (passed ? 0 : 1),
    lastExam: { right, of, passed, missed: graded.map((q, i) => q.answer === q.accepted ? -1 : i).filter(i => i >= 0) },
    lastActiveAt: now ?? session.lastActiveAt
  };
}

/* ---------- what she says at the end ---------- */

/* Only name a rival when exactly one survives and it is not the truth. The
   library cannot cover every theory a person might hold, so a confident wrong
   attribution is worse than silence. */
function nameRival(session, rule, library) {
  const rivals = survivors(session, rule, library);
  if (rivals.length !== 1) return null;
  const rival = rivals[0];
  const split = allRounds(rule.space)
    .filter(r => rival.fn(r) !== rule.fn(r))
    .sort((a, b) => a.length - b.length)[0];
  return split ? { rival, separator: split } : null;
}

/* ---------- score ---------- */

/* Par is CONTENT, not a computation: it is measured by tools/authoring.mjs and
   pinned onto the rule, so a change to the hypothesis library cannot silently
   move every par under a player mid-week. The engine only reads it. Anything
   with no measured par — starters, held rules — scores with par null, and the
   `?? null` is what lets a rule file older than this field still score.

   `toPar` is the golf number: positive is over par, negative under, 0 level. */
function score(session, rule) {
  const probes    = session.probes.length;
  /* ?? — the same discipline `hints` needs, for the same reason: a saved
     session is a schema you no longer control. The charge is triangular in the
     failure count rather than flat; see examCharge for the measurement. */
  const penalty   = examPenalty(session.failedExams ?? 0);
  const hints     = session.hints ?? 0;        // ?? — sessions saved before hints existed
  const surprises = session.probes
    .map((p, i) => (p.call !== null && p.call !== p.accepted) ? i + 1 : 0)
    .filter(Boolean);
  const par = rule.par ?? null;
  const effective = probes + penalty + hints;
  return { probes, penalty, hints, effective, surprises, par,
           toPar: par === null ? null : effective - par };
}

/* ---------- how much is left to work out ---------- */

/* Theories still standing, counting the truth. The single most motivating
   signal the game can give and it was computed every turn and thrown away:
   "11 still fit" -> "3 still fit" turns an opaque grind into visible progress,
   and it answers the question players get wrong most often, which is when to
   declare. `survivors` deliberately excludes the truth and anything merely
   restating it, so the honest count is one more than it returns. */
function standing(session, rule, library) {
  return survivors(session, rule, library).length + 1;
}

/* ---------- the way out ---------- */

/* Offered only once a player is demonstrably stuck — see `stuck` — never from
   the first screen, which would be a standing invitation to stop thinking.
   Giving up is a FINISHED night, not an abandoned one: it reveals the rule, it
   is recorded, and nothing about it is scolded. It keeps no par, because a
   number to be measured against is exactly what the player just declined. */
function giveUp(session, now) {
  if (session.phase === "done") throw new Error("the night is already over");
  return { ...session, phase: "done", gaveUp: true,
           lastActiveAt: now ?? session.lastActiveAt };
}

/* Past par with room to spare, or having already been told a theory does not
   fit. Both are evidence rather than mood — a player who has not declared and
   is not past par is not stuck, they are playing. */
const STUCK_OVER = 3;      // rounds past the line before a way out is offered
const NO_PAR_LINE = 5;     // warm-ups and ladder rungs are built to fall in five

function stuck(session, rule) {
  const s = score(session, rule);
  /* ?? — starters and ladder rungs deliberately carry NO par, so gating on
     `par !== null` meant the way out could never appear on the on-ramp, which
     is precisely where a new player gets stuck. Found by being stuck there. */
  const line = s.par ?? NO_PAR_LINE;
  return session.failedExams > 0 || s.effective > line + STUCK_OVER;
}

/* ---------- what she is not watching ---------- */

/* A hint that names a ROUND helps with the part that is already cheap: measured,
   probing at random costs about par, so choosing the probe is nearly free. What
   a person cannot do is hold eighty theories at once — the bottleneck is
   generating the hypothesis, not selecting the probe. So the regular's better
   hint eliminates a whole CLASS: if the rule is invariant under relabelling the
   colours, then colour cannot be what she is watching, and every colour theory
   the player is still carrying dies at once.

   Invariance is checked by enumeration over the rule's own space, so it is a
   measured fact about the predicate, never an annotation someone has to keep
   true. */
/* Ignoring an attribute means the verdict is a function of everything EXCEPT
   it. Tested by partitioning the space on what remains and demanding the rule
   be constant inside every part — exact, and still just a walk.

   The weaker test that suggests itself, relabelling colours and checking the
   verdict holds, is wrong and produces hints that lie: "the first and last
   share a colour" survives any relabelling, so it looks colour-blind, while
   colour is the entire rule. It does not care WHICH colour; it cares very much
   about colour. Likewise reversal-invariance is not order-invariance —
   reversing swaps first and last, so that same rule survives it too. */
/* THE THREE PARTITIONS, defined once. Each one throws an attribute away and
   keeps everything else: group by the sizes and colour is gone, group by the
   colours and size is gone, sort the drinks and order is gone.
     colour — the sizes alone decide every verdict
     size   — the colours alone do
     order  — only WHICH drinks are present matters, so every permutation agrees
   The same three answer it for a rule (does she ignore this?) and for a library
   entry (does this theory use it?), which is what keeps the regular's class hint
   and the notebook's headers from ever disagreeing. */
const PARTITION = {
  colour: r => r.map(t => t.s).join(","),
  size:   r => r.map(t => t.c).join(","),
  order:  r => r.map(t => `${t.c}${t.s}`).sort().join(",")
};

/* The keys belong to the SPACE, not to the predicate being tested, and building
   them was nearly all of the cost: eighty library entries each rebuilt 7,381
   strings three times over, which measured 320ms on the full bar. Cached per
   space they are built once — same partition, same answers, one walk. */
const _keys = new Map();
function partitionKeys(sp, attr) {
  const S = spaceOf(sp);
  let byAttr = _keys.get(S.key);
  if (!byAttr) { byAttr = {}; _keys.set(S.key, byAttr); }
  if (!byAttr[attr]) byAttr[attr] = allRounds(S).map(PARTITION[attr]);
  return byAttr[attr];
}

/* Decided WITHOUT the attribute: constant inside every part of the partition
   that throws it away. Exact, and still just a walk. */
function decidedWithout(fn, sp, attr) {
  const all = allRounds(sp), keys = partitionKeys(sp, attr), seen = new Map();
  for (let i = 0; i < all.length; i++) {
    const k = keys[i], v = fn(all[i]);
    if (!seen.has(k)) seen.set(k, v);
    else if (seen.get(k) !== v) return false;
  }
  return true;
}

/* An attribute a bar does not have is one nobody can be watching, so a
   one-colour bar neither ignores colour nor uses it — the question does not
   arise, and answering it either way produces a hint that lies. */
const ignoresColour = rule =>
  roundSpace(rule).cols.length >= 2 && decidedWithout(rule.fn, rule.space, "colour");
const ignoresSize = rule =>
  roundSpace(rule).sizes.length >= 2 && decidedWithout(rule.fn, rule.space, "size");
const ignoresOrder = rule => decidedWithout(rule.fn, rule.space, "order");

/* The class-level hint, or null when every class still matters. Returns the one
   that kills the most theories the player is actually still carrying, so it is
   never a true fact that tells them nothing. */
function classHint(session, rule, library) {
  const alive = survivors(session, rule, library);
  if (!alive.length) return null;
  const sp = roundSpace(rule);
  const cands = [];
  if (ignoresColour(rule)) cands.push({ attr: "colour", uses: h => usesColour(h, sp) });
  if (ignoresSize(rule))   cands.push({ attr: "size",   uses: h => usesSize(h, sp) });
  if (ignoresOrder(rule))  cands.push({ attr: "order",  uses: h => usesOrder(h, sp) });
  let best = null;
  for (const c of cands) {
    const kills = alive.filter(c.uses).length;
    if (kills > 0 && (!best || kills > best.kills)) best = { attr: c.attr, kills };
  }
  return best;
}

/* A rival "uses" an attribute exactly when it is NOT constant within the
   partition that ignores it — the same test as above, pointed at a rival
   instead of the truth, so the hint and the check cannot disagree. */
const usesColour = (h, sp) =>
  spaceOf(sp).cols.length >= 2 && !decidedWithout(h.fn, sp, "colour");
const usesSize = (h, sp) =>
  spaceOf(sp).sizes.length >= 2 && !decidedWithout(h.fn, sp, "size");
const usesOrder = (h, sp) => !decidedWithout(h.fn, sp, "order");

/* ---------- the notebook ---------- */

/* The page the player reads instead of holding eighty sentences in their head.
   It promises exactly one thing — HER RULE IS ON THIS PAGE — so everything here
   is built to keep that promise literally true, and it is a pure derivation:
   nothing about the notebook is stored on a session or annotated onto content.

   THREE THINGS THIS IS NOT BUILT ON, each deliberately.

   Not on `survivors`. That deliberately excludes anything equivalent to the
   truth, because its callers — the exam, `nameRival`, `classHint` — want rivals
   only. A notebook built on it would strike the one row the promise is about.
   Aliveness here is read straight off `evidence`.

   Not on a hand-written family tag. A tag on each hypothesis is content that has
   to be kept true by hand, and it drifts. The family is MEASURED instead, from
   the same invariance tests `classHint` uses, which buys three things:
     - it cannot drift from the predicate, because it is computed from it;
     - it re-derives PER SPACE, so a one-colour tutorial bar simply has no
       colour family (`usesColour` already requires two colours to compare);
     - the headers and the regular's class hint AGREE BY CONSTRUCTION. When she
       says "she's not looking at colour tonight", the families that go dark are
       exactly the ones whose measured signature includes colour, because both
       features call the same three predicates. Two features that could have
       contradicted each other now cannot.

   Not on the hypothesis list as written. Two sentences that agree on every round
   IN THIS SPACE are one theory here, and printing both would be printing the
   same row twice — so the page is over BEHAVIOUR-CLASSES, and the count of rows
   is a number the player can verify by counting them. */

/* A family is which attributes the verdict actually depends on. `attrs` is the
   measured signature; `key` is stable and is what a page keys its markup off;
   `label` is what it prints. The array order IS the display order — pinned here
   so the page never invents one: count first, because it is the one group a
   player can settle with a single short round, then the single attributes, then
   the pairs.

   "count" is the empty signature, and the name is exact rather than a shrug: a
   verdict that ignores colour is fixed by the size sequence, one that ignores
   size is fixed by the colour sequence, and over a product space any two rounds
   of the same length are joined by one swap of each — so ignoring both means the
   verdict is a function of LENGTH alone. That same argument makes "order" alone
   unreachable (ignoring colour and size already forces order-invariance); it is
   listed last for totality, so a lookup can never miss, and measured empty in
   every space the game ships. */
const NOTEBOOK_FAMILIES = [
  { key: "count",             attrs: [],                          label: "count" },
  { key: "colour",            attrs: ["colour"],                  label: "colour" },
  { key: "size",              attrs: ["size"],                    label: "size" },
  { key: "colour+size",       attrs: ["colour", "size"],          label: "colour and size" },
  { key: "colour+order",      attrs: ["colour", "order"],         label: "colour and order" },
  { key: "size+order",        attrs: ["size", "order"],           label: "size and order" },
  { key: "colour+size+order", attrs: ["colour", "size", "order"], label: "colour, size and order" },
  { key: "order",             attrs: ["order"],                   label: "order" }
];
const _familyByKey  = new Map(NOTEBOOK_FAMILIES.map(f => [f.key, f]));
const _familyRank   = new Map(NOTEBOOK_FAMILIES.map((f, i) => [f.key, i]));
const _familyKey    = attrs => attrs.join("+") || "count";

/* MEASURED, over the rule's own space — the same three predicates `classHint`
   asks, pointed at a library entry. `attr` names in the signature match the
   `attr` field classHint returns, so a caller can compare them directly. */
function familyOf(h, sp) {
  const S = spaceOf(sp);
  const attrs = [];
  if (usesColour(h, S)) attrs.push("colour");
  if (usesSize(h, S))   attrs.push("size");
  if (usesOrder(h, S))  attrs.push("order");
  return _familyByKey.get(_familyKey(attrs));
}

/* HOW PLAIN A SENTENCE IS, measured on the WIDEST bar: how many attributes it
   leans on when every attribute is available. It is the tie-break that picks
   which member of a class gets printed, and it has to be measured on the full
   bar rather than on the bar being played, because inside one class every
   member has the same behaviour in this space and therefore the same family —
   the local measurement is a class invariant and cannot break any tie at all.

   This is not a nicety. On rule 15's bar — one colour, two sizes — eleven
   sentences collapse into one theory, and the lowest id of them is "it contains
   at least one Grenadine", which on a bar where every drink IS Grenadine is a
   nonsense way to say "there is at least 1 drink". The library is authored
   colour-first, so the lowest id is systematically the worst sentence on
   exactly the bars a new player meets first. Measured on the full bar the
   count sentence uses no attribute and wins, which is the right answer. */
const _plainness = new WeakMap();
function plainness(h) {
  let n = _plainness.get(h);
  if (n === undefined) { n = familyOf(h, FULL_SPACE).attrs.length; _plainness.set(h, n); }
  return n;
}

/* A hypothesis's verdict over every round in the space, packed one bit per
   round. The one definition of "the same theory here" — `notebookPage` groups
   by `key` and `notebookTruth` compares the rule against it, so the two cannot
   drift. Bit-packed rather than a "0101" string because this is 590,480
   predicate calls on the full bar and the signature is 80 x 7,381 characters of
   garbage otherwise; `constant` is counted on the way past, since a packed key
   cannot be searched for a "0". */
function verdictsOf(fn, sp) {
  const all = allRounds(sp);
  const bytes = new Uint8Array((all.length + 7) >> 3);
  let trues = 0;
  for (let i = 0; i < all.length; i++)
    if (fn(all[i])) { bytes[i >> 3] |= 1 << (i & 7); trues++; }
  let key = "";
  for (let i = 0; i < bytes.length; i += 4096)
    key += String.fromCharCode.apply(null, bytes.subarray(i, i + 4096));
  return { key, constant: trues === 0 || trues === all.length };
}

/* MEMOISED ON (LIBRARY, SPACE), and the memo is load-bearing rather than an
   optimisation: without it this whole pass would run on every verdict the
   player asks for. Measured cold on the full bar, it is not "milliseconds" —
   590,480 predicate calls plus the family measurement, and a phone is several
   times slower again.

   Keyed by LIBRARY FIRST. The library is a parameter, the tests pass explicit
   ones, and a subset library served the full library's cached page would be a
   silent wrong answer. A WeakMap means an experiment's library is collected
   with it. Then by space key, following the `_all` / `_spaces` precedent, for
   the reason that one has: a single cache hands a tutorial the full bar. */
const _notebooks = new WeakMap();
function notebookOf(rule, library) {
  const S = spaceOf(rule && rule.space);
  let bySpace = _notebooks.get(library);
  if (!bySpace) { bySpace = new Map(); _notebooks.set(library, bySpace); }
  const hit = bySpace.get(S.key);
  if (hit) return hit;

  const classes = new Map();                       // signature -> member ids
  for (const h of library) {
    const { key, constant } = verdictsOf(h.fn, S);
    /* An always-true or always-false sentence is not a theory anybody holds,
       and it can never die — a row that cannot change is noise on a page whose
       whole job is showing change. Dropped as a class, so a sentence that is a
       tautology HERE never joins one that is not. */
    if (constant) continue;
    if (!classes.has(key)) classes.set(key, []);
    classes.get(key).push(h.id);
  }

  const byId = new Map(library.map(h => [h.id, h]));
  const page = [];
  const sigs = new Map();                          // representative id -> signature
  for (const [key, ids] of classes) {
    ids.sort((a, b) => a - b);
    /* The plainest sentence speaks for the class; lowest id only breaks a real
       tie, so the row is still stable and deterministic. */
    const rep = byId.get(ids.slice().sort((a, b) =>
      plainness(byId.get(a)) - plainness(byId.get(b)) || a - b)[0]);
    const fam = familyOf(rep, S);
    page.push(Object.freeze({
      id: rep.id, ids: Object.freeze(ids.slice()),
      family: fam.key, familyLabel: fam.label, text: rep.text
    }));
    sigs.set(rep.id, key);
  }
  page.sort((a, b) => _familyRank.get(a.family) - _familyRank.get(b.family) || a.id - b.id);

  const rec = { library, page, sigs, space: S };
  bySpace.set(S.key, rec);
  return rec;
}

/* The page itself: one row per theory, in display order. `id` is the
   representative — the plainest member, see `plainness` — and `ids` is every
   sentence that says the same thing here, the representative included, so a
   page can print the rest underneath as "also".

   A FRESH ARRAY every call, holding frozen rows. The page sorts the dead below
   the living, and a caller sorting the memo in place would corrupt every later
   read of it. */
function notebookPage(rule, library) {
  return notebookOf(rule, library).page.slice();
}

/* The page plus what the evidence has done to it.
 *
 * `alive` — the representative agrees with every item of `evidence`.
 * `diedOn` — the INDEX INTO `evidence(session, rule)` of the first item it
 *   contradicts, or null while alive.
 * `standing` — how many rows are still alive, the truth's row included.
 *
 * EVIDENCE INDICES, so the page does not have to work them out:
 *   0      the seed she took          -> "her opener"
 *   1      the seed she refused       -> "her opener"
 *   2 + k  probe k + 1                -> "round (diedOn - 1)"
 *
 * IT READS `evidence()` AND NOTHING ELSE, which is a guardrail rather than an
 * implementation detail. `session.exam` survives a failed exam with every
 * `accepted` field populated, and folding those items in here would publish the
 * verdicts the failure screen deliberately withholds — the player would be told
 * which items they got wrong by watching the notebook. A failed exam must leave
 * this page byte-identical, and there is a test that says so.
 *
 * Built fresh every call, from frozen rows: the page sorts the dead below the
 * living, and sorting the memo in place would corrupt it for everyone after.
 *
 * `standing` here and the existing `standing()` CAN DISAGREE, and neither is
 * wrong. `standing()` counts library entries and adds one for the truth, so on a
 * small bar it double-counts sentences that are distinct in general but one
 * theory in that space — 80 entries collapse to 37 rows on the two-drink
 * tutorial bar. This one counts rows, which is the number a player can check by
 * counting the page, so it is the one the page shows. */
function notebookState(session, rule, library) {
  const ev = evidence(session, rule);
  const byId = new Map(library.map(h => [h.id, h]));
  const entries = notebookOf(rule, library).page.map(cls => {
    const fn = byId.get(cls.id).fn;
    let diedOn = null;
    for (let i = 0; i < ev.length; i++)
      if (fn(ev[i].round) !== ev[i].accepted) { diedOn = i; break; }
    return { id: cls.id, ids: cls.ids.slice(), family: cls.family,
             familyLabel: cls.familyLabel, text: cls.text,
             alive: diedOn === null, diedOn };
  });
  return { entries, standing: entries.filter(e => e.alive).length };
}

/* Which row IS her rule. Separate from the page on purpose: the page is read
   every turn, this is read once, at the reveal. Null if the truth is not on the
   page at all — the library does not have to cover every predicate, and a
   silent wrong answer would be worse than none. Tested to be non-null for every
   shipping rule, because that is the promise the header makes. */
function notebookTruth(rule, library) {
  const rec = notebookOf(rule, library);
  const sig = verdictsOf(rule.fn, rec.space).key;
  for (const [id, s] of rec.sigs) if (s === sig) return id;
  return null;
}

/* ---------- the share card ---------- */

/* The card is in the PLAYER'S frame, not the bartender's.
   It used to mark what SHE did — green when she took it — which is a semantic
   inversion in the most-copied artefact the game has. Everywhere else green
   means "I was right", and a card could be green-heavy purely because the day's
   rule accepts a lot, saying nothing about how well it was played.
   Now: a called round you got right is "called", one that caught you out is
   "surprised", and the two free openers are "free" because no call was made.
   Surprise density is the only mark that cannot be faked — calling at random
   runs about half surprised — so it is the one worth carrying. */
function shareMarks(session) {
  return session.probes.map(p =>
    p.call === null ? "free" : (p.call === p.accepted ? "called" : "surprised"));
}

/* WHETHER THE NOTEBOOK WAS EVER OPEN. Two mutators in `takeHint`'s shape, so the
   page records what the player did and the engine decides what it means. There
   is no third state to invent: a night played with the page shut is marked pro
   on the card, a night with it open is not, and a session that recorded neither
   is not judged at all (see shareText). */
function openNotebook(session, now) {
  return { ...session, openedBook: true, lastActiveAt: now ?? session.lastActiveAt };
}
function closeNotebook(session, now) {
  /* Once opened, always opened — the claim is "played without it", and a player
     who has read the page cannot unread it. */
  return { ...session, openedBook: session.openedBook === true,
           lastActiveAt: now ?? session.lastActiveAt };
}

/* PRO IS SESSION STATE, not an argument. It is exactly what `hints` is —
   something the player did during this night that the card reports — so it is
   recorded by a mutator and read back here, and the page never hand-writes
   engine state. A sixth positional boolean was the alternative and it is the
   wrong shape: every caller that omits `minutes` would have to pass `undefined`
   through to reach it.
 *
 * THE DEFAULT IS "NOT PRO", and deliberately so. A session saved before the
 * notebook existed was genuinely played without one, but the card must not
 * certify what it cannot know: `openedBook` absent means unjudged, and an
 * unjudged night prints exactly the card it printed before, byte for byte.
 * Only a session that actually recorded playing with the notebook shut — see
 * closeNotebook — is marked. */
function shareText(session, rule, glyphs, title, minutes) {
  const pro = session.openedBook === false;
  const s = score(session, rule);
  const row = shareMarks(session).map(m => glyphs[m]).join("");
  /* A failed exam was invisible: a night with two of them printed the same grid
     and the same "exam 4/4" as a clean one, so a player's best and worst
     sessions were typographically identical. */
  /* ?? — a caller may hand over only the three round marks, and a share card
     that throws is worse than one missing a symbol */
  const fails = session.failedExams
    ? " " + (glyphs.failed ?? "X").repeat(session.failedExams) : "";
  const tail = [session.gaveUp ? "gave up" : `${s.effective} rounds`]
    .concat(s.par === null || session.gaveUp ? [] : [`par ${s.par}`])
    .concat(s.surprises.length ? [`${s.surprises.length} surprises`] : [])
    .concat(minutes ? [`${minutes} min`] : [])
    .concat(pro ? ["pro"] : []);
  return `${title} #${rule.n}\n${row}${fails}\n${tail.join(" · ")}`;
}

/* ---------- scheduling ---------- */

/* Same puzzle for everyone on a given day. Anything FLAGGED a starter is
   reserved and never surfaces as a daily — including one the tier bar below
   disqualifies, which is benched rather than quietly promoted into the rotation.
   A ladder rung is reserved for the same reason: it is a measured giveaway on a
   small bar, and it is dealt from the on-ramp, never from the rotation. */
function dailyRule(dateISO, rules) {
  const pool = rules.filter(r => !r.starter && !r.hold && r.ladder == null);
  const days = Math.floor(Date.parse(dateISO + "T00:00:00Z") / 86400000);
  return pool[((days % pool.length) + pool.length) % pool.length];
}

/* A warm-up is chosen by CONCEPTUAL load, not only by how fast it falls. Probe
   count measures information against a solver holding eighty-five theories at
   once; tier is the only field that says how hard the idea is to hold in a head,
   and it used to be ignored — which is how a tier-4 rule coupling position and
   colour became the second thing anyone ever saw, and how the owner got stuck on
   warm-up 2. Flag plus tier, both. */
const isWarmUp = r => !!r.starter && !r.hold && r.tier <= MAX_STARTER_TIER;

/* A LADDER RUNG is an existing predicate played on a smaller bar. It is judged
   by measurement rather than by tier: check-rules.mjs demands it fall in fewer
   probes than the daily floor, in its own space, and that the run never gets
   easier as the index rises. The tier bar above is a warm-up's protection and
   is untouched; the palette is a rung's. */
const isLadder = r => r.ladder != null && !r.hold;

/* The role a piece of content plays. One definition — the gate script and the
   test suite both read it here rather than keeping a copy each. Order matters:
   a rule flagged a warm-up is reported as one even when the tier bar benches
   it, which is how a benched starter shows up as benched instead of silently
   joining the daily rotation. */
const roleOf = r =>
  r.starter ? "starter" : r.hold ? "held" : r.ladder != null ? "ladder" : "daily";

/* THE ON-RAMP — everything a new player meets before their first daily: the
   warm-ups and then the ladder. `isStarter` and `starters` name it because they
   are what the page asks for; a rung is a warm-up in every way the page cares
   about (reserved, no par, "Next" rather than "Play another").

   Ordered so the run actually ramps: fewest drinks on the bar first — the rule
   starters() has always used — then the rung's pinned index, so a warm-up comes
   before a rung on a bar of the same size. The ladder's indices are measured to
   agree with that ordering, so the two never argue. */
const isStarter = r => isWarmUp(r) || isLadder(r);

function starters(rules) {
  return rules.filter(isStarter).sort((a, b) =>
    roundSpace(a).drinks.length - roundSpace(b).drinks.length ||
    (a.ladder ?? -1) - (b.ladder ?? -1) ||
    a.tier - b.tier || a.n - b.n);
}

/* The ladder alone, in the order it is climbed. */
function ladder(rules) {
  return rules.filter(isLadder).sort((a, b) => a.ladder - b.ladder || a.n - b.n);
}

/* ---------- authoring gates ---------- */

/* Both take the space they are being judged in. Left off, that is the full bar,
   which is what every full-palette caller means. A rule is only ever informative
   or equivalent RELATIVE to a space: two theories that differ on a green highball
   are the same theory in a bar that pours neither. */
const passRate = (fn, sp) => allRounds(sp).filter(fn).length / allRounds(sp).length;

const equivalent = (a, b, sp) => allRounds(sp).every(r => a(r) === b(r));

/* How many probes a player who plays well needs to isolate the rule. Pass rate
   says nothing about how FAST a rule falls; this does. Greedy maximum-split
   from the seeds, which is at least as good as any human, so it is a lower
   bound on real sessions. */
function competentSolverProbes(rule, library) {
  const all = allRounds(rule.space);
  let alive = library.filter(h =>
    h.fn(rule.seedYes) === true && h.fn(rule.seedNo) === false);
  const used = new Set([roundKey(rule.seedYes), roundKey(rule.seedNo)]);
  let n = 0;
  while (alive.length > 1 && n < 30) {
    let best = null, bestWorst = Infinity;
    for (const r of all) {
      if (used.has(roundKey(r))) continue;
      const truth = rule.fn(r);
      const agree = alive.filter(h => h.fn(r) === truth).length;
      const worst = Math.max(agree, alive.length - agree);   // adversarial split
      if (worst < bestWorst) { bestWorst = worst; best = r; }
      if (bestWorst === Math.ceil(alive.length / 2)) break;
    }
    if (!best || bestWorst === alive.length) break;          // nothing discriminates
    used.add(roundKey(best));
    const truth = rule.fn(best);
    alive = alive.filter(h => h.fn(best) === truth);
    n++;
  }
  return n;
}

/* How many probes a REAL player needs, modelled on the opening every playtester
   actually used: take the round she accepted and change one thing at a time.
   Colour first, because playtesting showed colour is the loud attribute and
   size the quiet one; then size; then length. Re-anchor on the last accepted
   round when the neighbourhood runs dry.

   This is the gate that catches "triviality with ceremony" — a rule can sit
   comfortably inside the pass-rate band and still fall apart in four probes. */
function playerSolverProbes(rule, library) {
  let alive = library.filter(h => h.fn(rule.seedYes) === true && h.fn(rule.seedNo) === false);
  const used = new Set([roundKey(rule.seedYes), roundKey(rule.seedNo)]);
  let anchor = rule.seedYes, n = 0, stalled = -1;

  while (alive.length > 1 && n < 40) {
    const cand = neighbours(anchor, rule.space).filter(r => !used.has(roundKey(r)));
    if (!cand.length) {
      const fresh = allRounds(rule.space).find(r => !used.has(roundKey(r)) &&
        alive.some(h => h.fn(r) !== alive[0].fn(r)));
      /* Re-anchoring does not consume a round, so two re-anchors with nothing
         used in between is a fixed point: same evidence, same `fresh`, forever.
         Rare enough never to have fired in the full bar; reachable in a space
         small enough for the neighbourhood to be exhausted. Breaking here can
         only end a run that would otherwise not end. */
      if (!fresh || used.size === stalled) break;
      stalled = used.size;
      anchor = fresh; continue;
    }
    // a player prefers a probe that would actually tell their live theories apart
    const useful = cand.find(r => alive.some(h => h.fn(r) !== alive[0].fn(r))) || cand[0];
    used.add(roundKey(useful));
    n++;
    const truth = rule.fn(useful);
    const before = alive.length;
    alive = alive.filter(h => h.fn(useful) === truth);
    if (truth) anchor = useful;                 // she took it, so build from there
    if (alive.length === before && cand.length === 1) break;
  }
  return n;
}

/* ---------- utility ---------- */

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Deterministic rng so a given day plays identically for everyone. */
function seededRng(seed) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

const ENGINE = {
  FREE_PROBES, EXAM_N, EXAM_PENALTY, MAX_DRINKS, MAX_STARTER_TIER, FULL_SPACE,
  allRounds, roundSpace, inSpace, roundKey, newSession, callRequired, probe, evidence, survivors,
  buildExam, examSeed, examCharge, examPenalty, declare, answerExam, nameRival, score,
  shareMarks, shareText, suggestProbe, takeHint, openNotebook, closeNotebook,
  standing, giveUp, stuck, classHint, ignoresColour, ignoresSize, ignoresOrder,
  NOTEBOOK_FAMILIES, familyOf, notebookPage, notebookState, notebookTruth,
  dailyRule, isWarmUp, isLadder, isStarter, roleOf, starters, ladder,
  passRate, equivalent, competentSolverProbes, playerSolverProbes,
  shuffle, seededRng
};

if (typeof module !== "undefined" && module.exports) module.exports = ENGINE;
