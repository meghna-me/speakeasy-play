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
  /* NO EMPTY ROUND. Serving nothing was a legal move until 2026-08-18 and it
     cost more than it bought: three of the eighty library sentences existed only
     to talk about it ("there are exactly 0 drinks", "at least 1", "at most 1" —
     the first two turn constant and the third becomes "exactly 1"), and a
     first-timer's commonest mis-tap was calling with an empty counter. Measured
     before removing it: every rule's truth stays uniquely identifiable, no two
     shipped rules collapse together, and the page count moves 80 -> 77.
     `frontier` still starts from the empty round because that is how a round of
     length 1 gets built; it is simply never emitted. */
  const out = [];
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

/* `accepted` is the SIXTH argument and is only ever passed in two-player mode —
   see guestRule. A shipped rule answers for itself and a guest rule cannot,
   because the usual is in another person's head and reaches the device as a tap.
   Both directions throw rather than being quietly tolerated: passing a verdict
   to a rule that owns one would let a caller write any history it liked over a
   known predicate, and omitting one where nothing can compute it would silently
   record `undefined` as "sent it back". */
function probe(session, rule, round, call, now, accepted) {
  if (session.phase !== "play") throw new Error("not in the probing phase");
  if (!round.length) throw new Error("a round holds at least one drink");
  if (round.length > MAX_DRINKS) throw new Error("a round holds at most " + MAX_DRINKS);
  if (rule.fn && accepted !== undefined) throw new Error("this rule answers for itself");
  if (!rule.fn && typeof accepted !== "boolean") throw new Error("the customer has to answer this round");
  const needsCall = callRequired(session);
  if (needsCall && typeof call !== "boolean") throw new Error("call the round before you pour it");
  return {
    ...session,
    probes: session.probes.concat([
      { round, accepted: rule.fn ? rule.fn(round) : accepted, call: needsCall ? call : null }
    ]),
    lastActiveAt: now ?? session.lastActiveAt
  };
}

/* ---------- two-player ----------
 *
 * A rule with NO PREDICATE AND NO SEEDS. A friend keeps the usual — invented or
 * chosen on their own device — and answers each round themselves; the verdict
 * arrives at `probe` as an argument and nothing about the rule is ever encoded,
 * transmitted or stored, so there is nothing on this side to leak. The customer
 * link carries no rule for the same reason: it is the same page in the other
 * chair.
 *
 * Everything downstream reads `rule.fn` and `rule.seedYes` to decide what it can
 * still honestly do — the notebook still narrows (it only needs the evidence),
 * the till still pays, and the three things that need to know the answer in
 * advance go quiet: the regular has nothing to suggest, no class hint can be
 * computed, and there is no exam, because a device cannot grade a rule it was
 * never told. Last orders are settled by report instead — see `settle`. */
function guestRule() {
  return { n: 0, guest: true, tier: 0, space: null,
           fn: null, seedYes: null, seedNo: null, par: null,
           text: () => "" };
}

/* Last orders in someone else's bar. `right` is what the PLAYER REPORTS hearing
   back, not a verdict — nothing here can check it, which is exactly why a guest
   night is worth no more than the two people playing it agree it is. Kept
   separate from `answerExam` so that no shipped rule can ever be settled this
   way: this throws on anything that has a predicate to be graded against. */
function settle(session, rule, right, now) {
  if (session.phase !== "play") throw new Error("the night is already over");
  if (rule.fn) throw new Error("a rule with a predicate is settled by the exam");
  return { ...session, phase: "done", told: !!right,
           lastActiveAt: now ?? session.lastActiveAt };
}

/* ---------- what the player has actually been shown ---------- */

/* THE NUMBER OF FREE OPENERS IS 2 OR 0, and every consumer of `diedOn` needs to
   know which — the index contract in notebookState is written in terms of it. A
   guest rule has no seeds because a friend hands over nothing before the first
   pour, so the page must not assume the first two entries are openers. It reads
   `seeds` off notebookState rather than counting for itself. */
const seedCount = rule => (rule.seedYes && rule.seedNo) ? 2 : 0;

function evidence(session, rule) {
  const openers = seedCount(rule)
    ? [{ round: rule.seedYes, accepted: true }, { round: rule.seedNo, accepted: false }]
    : [];
  return openers.concat(session.probes.map(p => ({ round: p.round, accepted: p.accepted })));
}

/* Hypotheses consistent with every data point, minus any that is merely the
   truth wearing a different sentence. */
function survivors(session, rule, library) {
  const ev = evidence(session, rule);
  const all = allRounds(rule.space);
  /* THE TRUTH IS ONLY EXCLUDED WHERE THERE IS ONE TO EXCLUDE. A guest rule has
     no predicate, so there is nothing to compare against and every consistent
     sentence stands — including, with luck, the one the friend actually picked.
     That is the honest answer: in two-player mode the device does not know which
     row is right, and a notebook that pretended otherwise would be guessing. */
  return library.filter(h =>
    ev.every(e => h.fn(e.round) === e.accepted) &&
    (!rule.fn || !all.every(r => h.fn(r) === rule.fn(r)))
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
  /* > 1, because dropping the only drink would emit the empty round, which is
     no longer in the space — a neighbour outside allRounds would be offered by
     the regular and could never be poured. */
  for (let i = 0; i < round.length; i++)
    if (round.length > 1) out.push(round.filter((_, j) => j !== i));
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
  if (!rule.fn) return null;          // the regular cannot suggest against a usual nobody told him
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
  if (!rule.fn) return null;          // no truth to separate a rival FROM
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

/* ---------- the till ----------
 *
 * ONE ECONOMY, IN TWO UNITS. The game already charged in rounds and already
 * called the charge a tab ("6 rounds on your tab"), so money is not a second
 * currency bolted alongside `effective` — it IS `effective`, priced. Every
 * quantity below is one `score()` already returns; nothing new is tracked and
 * nothing is counted twice. Adding a parallel score was the alternative and it
 * would have put two numbers for one night on one screen, which is the defect
 * `db.times` already has.
 *
 * The three rates live here rather than at the top of the file with FREE_PROBES
 * because they are a rate card: each is meaningless without the others, and
 * moving one without re-reading the rest changes what a night is worth. */
const SERVE_COST   = 2;    // stock, per round poured — rounds on the house are not charged
const SETTLE_BONUS = 40;   // what the night pays out when last orders are passed
/* THERE IS NO PER-ROUND EARNING TERM, AND THERE MUST NEVER BE ONE.
   A CALL_RIGHT = 5 existed here for one afternoon and it was a money printer.
   Any positive per-round term beats SERVE_COST and makes each additional round
   worth (term - SERVE_COST) forever: measured, grinding the round space paid
   $22,177 against an honest par night's $52, and payout rose monotonically with
   rounds poured — the exact inverse of the score it claims to be.
   Paying for correct calls was also in flat contradiction with the game: the
   nudge line says "a round you're already sure about teaches you nothing" and
   shareMarks' own comment says a high hit rate "mostly measures padding". The
   notebook narrows to a single row at median round 5, so after that every call
   is right for free and the default mode is the faucet.
   The only safe shape is a FIXED payout minus a per-round cost, which is what is
   left: takings fall as the night lengthens, exactly as the score rises. Adding
   any earning term — for correct calls, for surprises, for anything counted per
   round — reopens this, because being paid to be wrong farms just as well as
   being paid to be right. */

/* `rule` is optional and only reaches score() for par, which the till ignores —
   the signature matches score()'s so the two are called the same way. */
function takings(session, rule) {
  const s = score(session, rule);
  /* ONLY THE FIRST TIME A ROUND IS SERVED CAN PAY.
     A round already served has a known answer, so calling it right is not a
     judgement — it is reading the ledger. Paying for it made repeats worth
     CALL_RIGHT - SERVE_COST each, forever: pour the same drink, call the answer
     you were just shown, take $3, repeat. That is the exam farm again in a
     different currency, and the fix is the same one — you are paid for what you
     worked out, never for what you were told.
     Deliberately NOT a ban on repeating: a repeat still costs its pour, and a
     player who wants to re-check something may. It simply cannot earn. */
  const seen = new Set();
  const callsRight = session.probes.filter(p => {
    const k = roundKey(p.round);
    const first = !seen.has(k);
    seen.add(k);
    return first && p.call !== null && p.call === p.accepted;
  }).length;
  /* GIVING UP ALSO SETS phase:"done". Paying the settle bonus on it would make
     walking out the best-paid way to end a night you were losing. */
  /* TWO-PLAYER PAYS ON THE FRIEND'S WORD. `told` is only ever present on a
     guest night (see settle) and is the player's report of what they heard back;
     a night the friend did not accept is finished but unsettled, exactly like
     giving up, and pays nothing. Absent means a normal night, so this cannot
     change what any shipped rule pays. */
  const settled = session.phase === "done" && !session.gaveUp && session.told !== false;
  /* ON THE HOUSE MEANS ON THE HOUSE. The opening rounds carry call:null because
     the game does not ask for a prediction yet, and the page has always called
     them "on the house" — so charging for them made the till contradict the
     label, and worse, it opened every night at a loss: two free rounds with no
     call to get right is -$4 before the player has been asked to do anything.
     A game that greets you by telling you you are behind is not the low-stress
     mode it claims to be.
     Bounded, not open-ended: probe() drops the call itself for the first
     FREE_PROBES rounds and requires one after that, so at most FREE_PROBES
     rounds can ever be free and this cannot be farmed by declining to call. */
  const onTheHouse = session.probes.filter(p => p.call === null).length;
  const poured  = SERVE_COST * (s.probes - onTheHouse);
  /* the tab proper: failed last orders and hints, already triangular in
     examPenalty, converted at the pour rate rather than given a rate of their own */
  const tab     = SERVE_COST * (s.penalty + s.hints);
  const bonus   = settled ? SETTLE_BONUS : 0;
  /* FIXED PAYOUT MINUS A PER-ROUND COST. No term rises with the number of
     rounds, so takings fall as the night lengthens — the same direction the
     score moves, which is what "one economy" was supposed to mean and did not.
     `callsRight` is still reported because it is honest feedback, but nothing
     here multiplies by it: the moment money references a per-round count again,
     the printer is back. */
  const raw     = bonus - poured - tab;
  /* FLOORED AT ZERO, AND SAID SO. A bartender in debt is a losing screen, and
     the mode with the notebook open is the one that is meant to be low-stress;
     `short` lets the page word a bad night without printing a negative. */
  return { settled, callsRight, poured, tab, bonus, onTheHouse,
           total: Math.max(0, raw), raw, short: raw < 0 };
}

/* ---------- how much is left to work out ---------- */

/* Theories still standing, counting the truth. The single most motivating
   signal the game can give and it was computed every turn and thrown away:
   "11 still fit" -> "3 still fit" turns an opaque grind into visible progress,
   and it answers the question players get wrong most often, which is when to
   declare. `survivors` deliberately excludes the truth and anything merely
   restating it, so the honest count is one more than it returns. */
function standing(session, rule, library) {
  /* +1 for the truth, which survivors deliberately drops — but only where there
     IS one. A guest rule has no predicate to exclude, so survivors already
     counts every sentence still alive and adding one would report a theory that
     is not on the page. */
  return survivors(session, rule, library).length + (rule.fn ? 1 : 0);
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

/* ---------- a usual somebody set for you ----------
 *
 * A shipped rule is CONTENT: its seeds were searched offline and its par was
 * measured beside them, and rules.js carries both so that a change to the
 * hypothesis library cannot silently move a player's par mid-week. A rule a
 * friend picked has no content behind it — it is one library sentence, chosen a
 * minute ago — so the two numbers rules.js would have carried are measured here,
 * at the moment the link is opened.
 *
 * DETERMINISTIC, and that is the whole reason `rng` is an argument. The same
 * link must deal the same night to everybody who opens it: the setter sends one
 * link to five friends and their scores are only comparable if the openers and
 * the par are the same five times. `seededRng(hyp.id * 7919)` is derived from
 * the only thing the link carries, so nothing about WHO opened it or WHEN can
 * reach the search.
 *
 * The search is the same shape as tools/authoring.mjs — aim at TARGET, treat
 * the solver's cap as invalid, break ties toward shorter openers — just smaller,
 * because it runs on a phone while somebody waits. Measured at 40x40: about a
 * tenth of a second against the offline 120x120.
 *
 * WHY THIS IS ALLOWED TO COMPUTE A PAR when the engine is otherwise forbidden
 * to: the ban exists so that par and seeds travel together and cannot drift
 * apart. Here they are produced in the same call from the same rng, which is
 * that guarantee holding rather than being broken.
 */
const SHARE_TARGET = 6;      // the same number authoring.mjs aims every daily at
/* 32x32. Measured over the sentences the picker actually offers: 20 lets a rule
   through at nineteen probes, 26 still does, 32 does not, and the cost is 138ms
   against 55 — a tenth of a second once, while somebody opens a link, against a
   night that cannot be solved. */
const SHARE_SAMPLE = 32;

function sharedRule(hyp, library, rng) {
  const all = allRounds(null);
  const yes = shuffle(all.filter(hyp.fn), rng).slice(0, SHARE_SAMPLE);
  const no  = shuffle(all.filter(r => !hyp.fn(r)), rng).slice(0, SHARE_SAMPLE);
  const base = { n: 0, shared: true, tier: 0, space: null, fn: hyp.fn, hyp: hyp.id };
  let best = null;
  for (const y of yes) for (const n of no) {
    const probes = playerSolverProbes({ ...base, seedYes: y, seedNo: n }, library);
    if (probes >= 40) continue;                       // never converged: not a puzzle
    const cost = Math.abs(probes - SHARE_TARGET) * 100 + y.length + n.length;
    if (!best || cost < best.cost) best = { cost, probes, y, n };
    /* the floor: on target, with two single-drink openers. Nothing can beat it,
       so stop looking — deterministic, because the walk order is. */
    if (best.cost <= 2 + SHARE_TARGET * 0 + 2) break;
  }
  /* A sentence with no separating pair at all cannot be dealt. Callers get null
     and say so, rather than opening a night that can never be finished — every
     shipping library entry passes, but a library is content and content moves. */
  if (!best) return null;
  return { ...base, seedYes: best.y, seedNo: best.n, par: best.probes };
}

/* ---------- the link ----------
 *
 * What travels: ONE HYPOTHESIS ID and the setter's own name. Nothing else — not
 * the seeds, not the par, not a session — because everything else is derived
 * from the id by sharedRule, identically on every device that opens it.
 *
 * OBFUSCATED, NOT ENCRYPTED, AND THIS FILE SAYS SO RATHER THAN IMPLYING
 * OTHERWISE. `?u=BQAA` with the number visible would be read by the first
 * person who glanced at the address bar; XOR against a constant means it is not
 * read by accident. Anyone who wants the answer can have it in a minute, and
 * that was already true of every night this game deals — rules.js ships to the
 * device, and tools/pack.mjs applies exactly this much deterrence to it and no
 * more. A game whose whole subject is working something out cannot be defended
 * from a player who would rather look it up, and pretending otherwise here
 * would be the only dishonest line in the file.
 *
 * base64url by hand, because btoa/atob are deprecated in Node and this has to
 * run identically in both — the tests are the only thing that can check it. */
const SHARE_KEY = [0x5b, 0xa7, 0x3e, 0xd1, 0x6c];
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function b64url(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (b !== undefined) out += B64[(n >> 6) & 63];
    if (c !== undefined) out += B64[n & 63];
  }
  return out;
}
function unb64url(str) {
  const out = [];
  for (let i = 0; i < str.length; i += 4) {
    const q = [0, 1, 2, 3].map(k => B64.indexOf(str[i + k]));
    if (q[0] < 0 || q[1] < 0) return null;                  // a truncated or edited link
    const n = (q[0] << 18) | (q[1] << 12) | (Math.max(q[2], 0) << 6) | Math.max(q[3], 0);
    out.push((n >> 16) & 255);
    if (q[2] >= 0) out.push((n >> 8) & 255);
    if (q[3] >= 0) out.push(n & 255);
  }
  return out;
}
const SHARE_NAME_MAX = 18;

function shareCode(hypId, name) {
  const bytes = [hypId & 255,
    ...new TextEncoder().encode(String(name ?? "").slice(0, SHARE_NAME_MAX))];
  return b64url(bytes.map((b, i) => b ^ SHARE_KEY[i % SHARE_KEY.length]));
}

/* Null for anything it cannot read, and the caller deals an ordinary night
   instead. A link is a thing people forward, truncate and retype, so a broken
   one has to be a shrug rather than a broken page. */
function readCode(code, library) {
  if (typeof code !== "string" || !code.length) return null;
  const raw = unb64url(code);
  if (!raw || !raw.length) return null;
  const bytes = raw.map((b, i) => b ^ SHARE_KEY[i % SHARE_KEY.length]);
  const hyp = library.find(h => h.id === bytes[0]);
  if (!hyp) return null;
  let name = "";
  try { name = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes.slice(1))); }
  catch { name = ""; }
  /* a name is decoration and must never be able to break the night, so anything
     unprintable is dropped rather than rejected */
  name = name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, SHARE_NAME_MAX).trim();
  return { hyp, name };
}

/* ---------- how the night is reading from the other side of the counter ----------
 *
 * ONE derivation, in the engine, because the page may not hold a second opinion
 * about how the night is going. It reads `score()` and the phase and nothing
 * else — no timers, no round-by-round state — so a session restored from
 * storage gets the same answer as the one that produced it.
 *
 * The ladder is the SAME evidence `stuck` already uses, pushed one rung finer:
 * `stuck` answers "should the way out be on screen", this answers "how does the
 * customer look while you decide". Sharing the line means the figure cannot
 * still be relaxed on the screen that offers to end the night for you.
 *
 *   easy        under the line
 *   waiting     approaching it
 *   impatient   past it — the same threshold the nudge line starts counting at
 *   sour        past it with room to spare, or last orders already failed;
 *               this is exactly `stuck`
 *   pleased     settled
 *
 * WARM-UPS NEVER SOUR. A starter is a ninety-second lesson and its whole job is
 * to be survivable; a figure glowering at someone on their second ever round
 * teaches them the game is hostile, not that they are slow. Held rules and
 * ladder rungs carry no par for the same reason, so they take NO_PAR_LINE — the
 * one number the rest of the engine already uses when par is absent. */
function mood(session, rule) {
  if (session.phase === "done") return session.gaveUp ? "sour" : "pleased";
  if (isStarter(rule)) return "easy";
  const s = score(session, rule);
  if (stuck(session, rule)) return "sour";
  const line = s.par ?? NO_PAR_LINE;
  const over = s.effective - line;
  return over > 0 ? "impatient" : over > -2 ? "waiting" : "easy";
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
  if (!rule.fn) return null;          // nothing to be invariant under
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
  /* `seeds` is how many leading entries of `evidence` are FREE OPENERS rather
     than the player's own rounds — 2 normally, 0 in two-player mode. The page
     needs it to turn a diedOn into "round N", and counting for itself is how the
     two would drift. */
  return { entries, seeds: seedCount(rule), standing: entries.filter(e => e.alive).length };
}

/* Which row IS her rule. Separate from the page on purpose: the page is read
   every turn, this is read once, at the reveal. Null if the truth is not on the
   page at all — the library does not have to cover every predicate, and a
   silent wrong answer would be worse than none. Tested to be non-null for every
   shipping rule, because that is the promise the header makes. */
function notebookTruth(rule, library) {
  if (!rule.fn) return null;          // two-player: the device was never told which row is right
  const rec = notebookOf(rule, library);
  const sig = verdictsOf(rule.fn, rec.space).key;
  for (const [id, s] of rec.sigs) if (s === sig) return id;
  return null;
}

/* ---------- the sentence the player actually solved ----------
 *
 * The reveal prints `rule.text()`, which is the AUTHOR'S wording. The notebook
 * spends the whole night crossing sentences out until one is left, and that one
 * is a LIBRARY wording. They mean the same thing and they do not read the same,
 * and at the moment of reveal that is a player stopping to ask whether they got
 * it — two playtesters did, independently, on rule 13.
 *
 * Both sentences are canonical and neither should go: the author's is written
 * for the bar the rule is played in, and the ladder's whole design REQUIRES a
 * rung's reveal to differ from its base rule's (rule 103 reveals "every shot
 * comes before every mug" over a predicate the library calls "the sizes never
 * decrease"). So the reveal shows the pad's line as well — but only when it is
 * far enough from the author's to be worth a line.
 *
 * MEASURED, not guessed. Over the 26 shipping rules the overlap of content
 * words runs 0.00 to 1.00, and it is bimodal: fourteen rules sit at 0.75 or
 * above, where the two sentences are plainly the same sentence, and twelve at
 * 0.57 or below, where they are not. Rule 13 — the reported case — is 0.57, and
 * the worst are rules 5, 20 and 103 at 0.00, where the two share no content word
 * at all. The threshold sits in the gap. */
const REVEAL_OVERLAP = 0.75;
/* Words that carry no content, so a difference in them is not a difference in
   meaning. Deliberately short: this is a similarity measure, not a parser, and
   every word it drops is a word that cannot then distinguish two sentences. */
const REVEAL_STOP = new Set(["the", "a", "an", "is", "are", "of", "in", "it", "its",
  "and", "or", "to", "at", "one", "ones", "never", "that", "this"]);
const revealWords = s => new Set(
  /* parentheticals are tie notes — the author explaining an edge the library
     sentence has no room for — and counting them would make every rule that has
     one look different from its own class */
  s.toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9 ]/g, " ")
   .split(/\s+/).filter(w => w && !REVEAL_STOP.has(w)));

/* Null when there is nothing worth adding: no truth on the page (two-player),
   or a wording close enough that printing it twice is noise. */
function revealAlso(rule, library, C, S, N) {
  const id = notebookTruth(rule, library);
  if (id == null) return null;
  const cls = notebookPage(rule, library).find(c => c.id === id);
  if (!cls) return null;
  const said = cls.text(C, S, N);
  const a = revealWords(rule.text()), b = revealWords(said);
  const shared = [...a].filter(w => b.has(w)).length;
  return shared / Math.max(a.size, b.size, 1) < REVEAL_OVERLAP ? said : null;
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
function shareText(session, rule, glyphs, title, minutes, run) {
  const pro = session.openedBook === false;
  const s = score(session, rule);
  const row = shareMarks(session).map(m => glyphs[m]).join("");
  /* THE OUTCOME, IN THE PICTURE. The row is the rounds poured, and for months
     that was the whole card — which meant a night somebody WON and a night they
     walked out of produced byte-identical pictures, differing only in a word
     three lines down that a reader skimming a chat thread never reaches. The
     one thing a share card has to carry is how it went.
     NOT the failure cross this replaced. That marked what went wrong, in the
     round row, on a card somebody had just won; this marks how the night ENDED,
     it sits outside the run of squares, and on a win it is the only glyph on the
     card that says so. A player who got there on the second attempt still got
     there, and the retries are still counted in the tail where the facts live.
     Absent from `glyphs` means absent from the card, so a caller that has not
     opted in — every test written before this, and any future one — gets exactly
     the card it got before. */
  const settled = session.phase === "done" && !session.gaveUp && session.told !== false;
  const mark = session.gaveUp ? glyphs.walked : settled ? glyphs.settled : null;
  const pic = mark ? (row ? row + " " + mark : mark) : row;
  /* FAILED LAST ORDERS ARE A FACT IN THE TAIL, NOT A CROSS IN THE PICTURE.
     They used to be appended to the glyph row as "❌", which was wrong twice
     over. The row is the ROUNDS THE PLAYER POURED — one mark each, in order —
     and last orders is not a round, so a symbol in that row claimed a fifth
     round that never happened. And it put a red cross at the end of a card
     somebody had just WON: the last thing on the picture, after four squares
     that say "I worked this out", was a failure mark. A player who got there on
     the second attempt still got there.
     The information does not go anywhere — a night with two failures still reads
     differently from a clean one, in the same line as the par and the surprises,
     where the facts about the night live. */
  const tail = [session.gaveUp ? "gave up" : `${s.effective} rounds`]
    .concat(s.par === null || session.gaveUp ? [] : [`par ${s.par}`])
    .concat(s.surprises.length ? [`${s.surprises.length} surprises`] : [])
    .concat(session.failedExams ? [`${session.failedExams} retries`] : [])
    .concat(minutes ? [`${minutes} min`] : [])
    .concat(pro ? ["pro"] : [])
    /* A STREAK IS A REASON TO COME BACK, and it was doing that work only on
       the reveal, where nobody but the player ever sees it. One night running
       is not a streak and saying so would be noise. */
    .concat(run > 1 ? [`${run} nights running`] : []);
  /* NO NUMBER WHERE THERE IS NO NUMBER. `#n` identifies which night this was,
     so two cards can be compared — a rule a friend set has no place in that
     rotation and printing "#0" would invite exactly the comparison it cannot
     support. The caller passes the title it wants instead. */
  return `${title}${rule.n ? ` #${rule.n}` : ""}\n${pic}\n${tail.join(" · ")}`;
}

/* ---------- the streak ----------
 *
 * NIGHTS FINISHED, NOT NIGHTS SOLVED. Giving up is a finished night everywhere
 * else in this engine — it reveals the rule, it is recorded, and it is never
 * scolded — and a streak that breaks when somebody admits they are stuck would
 * turn the way out into a punishment, which is exactly what it was built not to
 * be. The thing worth rewarding is coming back.
 *
 * IT DOES NOT BREAK UNTIL A WHOLE DAY IS MISSED. A streak whose last night was
 * yesterday is still alive today: anyone who plays at eleven on Monday and one
 * o'clock on Wednesday morning has missed no day, and a stricter rule would
 * punish them for the clock rather than for not turning up. Two days' silence
 * ends it.
 *
 * Pure, and time is an argument — the same discipline as dailyRule, so a test
 * can walk a year of dates without touching the system clock. */
const DAY_MS = 86400000;
const dayNumber = iso => Math.floor(Date.parse(iso + "T00:00:00Z") / DAY_MS);

function streak(times, todayISO) {
  const today = dayNumber(todayISO);
  const days = [...new Set((times || []).map(t => t && t.day).filter(Boolean).map(dayNumber))]
    /* a clock set forward and back again leaves entries in the future; they are
       ignored rather than counted, so the streak can never be inflated by one */
    .filter(d => Number.isFinite(d) && d <= today)
    .sort((a, b) => b - a);
  if (!days.length || days[0] < today - 1) return 0;
  let n = 1;
  for (let i = 1; i < days.length && days[i] === days[i - 1] - 1; i++) n++;
  return n;
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
  allRounds, roundSpace, inSpace, roundKey, neighbours, newSession, callRequired, probe, evidence, survivors,
  buildExam, examSeed, examCharge, examPenalty, declare, answerExam, nameRival, score,
  takings, SERVE_COST, SETTLE_BONUS, mood,
  guestRule, settle, seedCount, sharedRule, shareCode, readCode, SHARE_NAME_MAX,
  shareMarks, shareText, suggestProbe, takeHint, openNotebook, closeNotebook,
  standing, giveUp, stuck, classHint, ignoresColour, ignoresSize, ignoresOrder,
  NOTEBOOK_FAMILIES, familyOf, notebookPage, notebookState, notebookTruth, revealAlso,
  dailyRule, streak, isWarmUp, isLadder, isStarter, roleOf, starters, ladder,
  passRate, equivalent, competentSolverProbes, playerSolverProbes,
  shuffle, seededRng
};

if (typeof module !== "undefined" && module.exports) module.exports = ENGINE;
