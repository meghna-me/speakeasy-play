/* Speakeasy — a QR encoder, because there is no dependency to reach for.
 *
 * Loaded as a classic script before the page, and via require() from the tests,
 * exactly like rules.js and the rest. NEVER an ES module: the game opens over
 * file:// and type="module" would break it.
 *
 * WHY THIS EXISTS. Two people in the same room want to hand each other a link,
 * and typing `?u=Xk9pQ2` off somebody else's phone is worse than not sharing at
 * all. Every QR library is a dependency, and this repo installs nothing — so
 * here is the encoder, and it is small because it refuses to be general:
 *
 *   · BYTE MODE ONLY. The input is a URL. Alphanumeric mode would pack an
 *     upper-case URL tighter, but our links carry a base64url payload where case
 *     is meaningful, so alphanumeric cannot represent them at all.
 *   · ERROR CORRECTION LEVEL L, VERSIONS 1..5. That is 108 bytes at the top,
 *     against links that measure about 55. Stopping at 5 removes two whole
 *     features of the spec: versions 7 and up carry an extra version-info block,
 *     and every (version, level) pair up to 5-L is a SINGLE data block, so there
 *     is no interleaving here. Both would be code with no caller.
 *   · NO KANJI, NO ECI, NO STRUCTURED APPEND.
 *
 * If a link ever grows past 108 bytes this throws rather than silently emitting
 * a code that will not scan — see qr().
 *
 * The output is a square array of 0/1 rows. Drawing it is the page's business;
 * this file has no DOM in it, for the same reason the engine does not.
 */

/* ---------- GF(256), the field Reed-Solomon lives in ----------
   x^8 + x^4 + x^3 + x^2 + 1 = 0x11d, which is the polynomial QR specifies.
   Log/antilog tables make multiplication an addition, which is what makes the
   generator polynomial below cheap enough to build at load. */
const GF_EXP = new Uint8Array(512), GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x; GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();
const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];

/* The generator polynomial for `n` error-correction codewords:
   (x - a^0)(x - a^1)...(x - a^(n-1)), built by repeated multiplication. */
function rsGenerator(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      /* HIGHEST DEGREE FIRST, so multiplying by (x + a^i) shifts g up by one —
         g[j] lands on next[j] — and the a^i term lands one further along. These
         two lines were the other way round at first, which builds the polynomial
         REVERSED: its leading coefficient is no longer 1, so the long division
         below is not a division. Everything else about the code was correct, so
         it produced a QR whose data codewords were byte-for-byte right and whose
         error correction was noise — and no scanner will touch that. */
      next[j] ^= g[j];
      next[j + 1] ^= gfMul(g[j], GF_EXP[i]);
    }
    g = next;
  }
  return g;
}

/* Polynomial long division; the remainder IS the error-correction codewords. */
function rsRemainder(data, n) {
  const gen = rsGenerator(n);
  const buf = data.concat(new Array(n).fill(0));
  for (let i = 0; i < data.length; i++) {
    const lead = buf[i];
    if (!lead) continue;
    for (let j = 0; j < gen.length; j++) buf[i + j] ^= gfMul(gen[j], lead);
  }
  return buf.slice(data.length);
}

/* ---------- what fits ----------
   Data codewords and EC codewords per version at level L. Single block
   throughout, which is why there is no interleaving in this file. */
const CAP = [
  null,
  { data: 19,  ec: 7  },   // 1
  { data: 34,  ec: 10 },   // 2
  { data: 55,  ec: 15 },   // 3
  { data: 80,  ec: 20 },   // 4
  { data: 108, ec: 26 }    // 5
];
const MAX_VERSION = 5;
const size = v => 17 + v * 4;

/* Alignment pattern centres. Versions 2..5 have exactly one usable centre —
   the coordinate list is [6, n] and three of the four combinations sit under a
   finder pattern, leaving the bottom-right. Version 1 has none. */
const ALIGN = [null, null, 18, 22, 26, 30];

/* ---------- the bit stream ---------- */

function encodeData(bytes, version) {
  const cap = CAP[version];
  const bits = [];
  const push = (value, n) => { for (let i = n - 1; i >= 0; i--) bits.push((value >> i) & 1); };
  push(0b0100, 4);                      // byte mode
  push(bytes.length, 8);                // 8-bit length field, versions 1..9
  for (const b of bytes) push(b, 8);
  /* terminator, up to four zero bits, then pad to a byte boundary */
  for (let i = 0; i < 4 && bits.length < cap.data * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const words = [];
  for (let i = 0; i < bits.length; i += 8)
    words.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  /* the two pad codewords the spec names, alternating, until the block is full */
  const PAD = [0xec, 0x11];
  while (words.length < cap.data) words.push(PAD[(words.length - bits.length / 8) % 2]);
  return words.concat(rsRemainder(words, cap.ec));
}

/* ---------- the matrix ---------- */

/* `fixed` marks every module the data must flow around: the three finders and
   their separators, both timing lines, the alignment pattern, the format-info
   strips and the one dark module. It is tracked separately from the values
   because masking must NOT touch any of them. */
function skeleton(version) {
  const n = size(version);
  const m = Array.from({ length: n }, () => new Array(n).fill(0));
  const fixed = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (r, c, v) => { m[r][c] = v; fixed[r][c] = true; };

  const finder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const rr = r0 + r, cc = c0 + c;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
      const on = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                 (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                 (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      set(rr, cc, on ? 1 : 0);          // the separator is the -1/7 ring, drawn light
    }
  };
  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);

  for (let i = 8; i < n - 8; i++) {     // the two timing lines
    set(6, i, i % 2 === 0 ? 1 : 0);
    set(i, 6, i % 2 === 0 ? 1 : 0);
  }

  const a = ALIGN[version];
  if (a != null)
    for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++)
      set(a + r, a + c, (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) ? 1 : 0);

  set(n - 8, 8, 1);                     // the dark module, always
  /* reserve the format strips — the values are written after a mask is chosen */
  for (let i = 0; i < 9; i++) { if (!fixed[8][i]) set(8, i, 0); if (!fixed[i][8]) set(i, 8, 0); }
  for (let i = 0; i < 8; i++) { if (!fixed[8][n - 1 - i]) set(8, n - 1 - i, 0);
                                if (!fixed[n - 1 - i][8]) set(n - 1 - i, 8, 0); }
  return { m, fixed, n };
}

/* Upward-then-downward zigzag in two-column strips from the bottom right,
   skipping the vertical timing line at column 6. */
function place(m, fixed, n, words) {
  const bit = i => (words[i >> 3] >> (7 - (i & 7))) & 1;
  let i = 0, up = true;
  for (let right = n - 1; right > 0; right -= 2) {
    if (right === 6) right--;           // column 6 is timing, never data
    for (let step = 0; step < n; step++) {
      const r = up ? n - 1 - step : step;
      for (const c of [right, right - 1]) {
        if (fixed[r][c]) continue;
        m[r][c] = i < words.length * 8 ? bit(i) : 0;
        i++;
      }
    }
    up = !up;
  }
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
];

/* The four penalty rules, which exist to stop a code that looks like its own
   finder patterns. A scanner does not need the best mask, but it does need one
   that is not pathological, and the scoring is cheap. */
function penalty(m, n) {
  let p = 0;
  const runs = line => {
    let run = 1;
    for (let i = 1; i <= line.length; i++) {
      if (i < line.length && line[i] === line[i - 1]) { run++; continue; }
      if (run >= 5) p += 3 + (run - 5);
      run = 1;
    }
  };
  for (let r = 0; r < n; r++) runs(m[r]);
  for (let c = 0; c < n; c++) runs(m.map(row => row[c]));
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++)
    if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) p += 3;
  const BAD = [1, 0, 1, 1, 1, 0, 1];
  const hasBad = (line, i) => BAD.every((v, k) => line[i + k] === v) &&
    (line.slice(Math.max(0, i - 4), i).every(v => v === 0) ||
     line.slice(i + 7, i + 11).every(v => v === 0));
  for (let r = 0; r < n; r++) for (let c = 0; c + 7 <= n; c++) if (hasBad(m[r], c)) p += 40;
  for (let c = 0; c < n; c++) { const col = m.map(row => row[c]);
    for (let r = 0; r + 7 <= n; r++) if (hasBad(col, r)) p += 40; }
  const dark = m.flat().reduce((a, b) => a + b, 0) * 100 / (n * n);
  p += Math.floor(Math.abs(dark - 50) / 5) * 10;
  return p;
}

/* BCH(15,5) over the 5 format bits — 2 for the EC level, 3 for the mask — then
   the constant mask the spec applies so an all-zero format is not all-zero. */
function formatBits(mask) {
  const data = (0b01 << 3) | mask;      // 0b01 is level L
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0b10100110111 << (i - 10);
  return ((data << 10) | rem) ^ 0b101010000010010;
}

/* THE TWO COPIES ARE NOT THE SAME SHAPE, and writing them as though they were
   is how this first shipped: the second copy runs bits 0..6 UP the left column
   and bits 7..14 along the bottom row, where the first copy splits 0..8 / 9..14
   around the corner. Writing the column half as 0..5 left bits 6 and 7 unset,
   and a decoder that cannot read the format cannot read anything — every code
   this produced was silently unscannable while looking perfectly QR-shaped.
   Caught by decoding the output rather than by reading it. */
function writeFormat(m, n, mask) {
  const f = formatBits(mask);
  /* INDEX 0 IS THE MOST SIGNIFICANT BIT. The 15-bit format string is written
     MSB-first into the sequence of module positions below — not LSB-first, which
     is the obvious reading of "bit 0 goes at (8,0)" and is what shipped here
     first. Every code it produced looked perfectly QR-shaped and none of them
     scanned, because a decoder that cannot read the format cannot read anything.
     Established by generating a reference with CoreImage's CIQRCodeGenerator,
     reading its modules back, and brute-forcing which of the 32 (level, mask)
     pairs and which of the two bit orders reproduced it: msb-first, uniquely. */
  const at = i => (f >> (14 - i)) & 1;
  /* copy one: along the top-left row, then up its column */
  for (let i = 0; i <= 5; i++) m[8][i] = at(i);
  m[8][7] = at(6); m[8][8] = at(7); m[7][8] = at(8);
  for (let i = 9; i <= 14; i++) m[14 - i][8] = at(i);
  /* copy two: up the bottom-left column, then along the top-right row */
  for (let i = 0; i <= 6; i++) m[n - 1 - i][8] = at(i);
  for (let i = 7; i <= 14; i++) m[8][n - 15 + i] = at(i);
  m[n - 8][8] = 1;                      // the dark module survives every format
}

/* ---------- the whole thing ----------
   Returns { size, modules } where modules is an array of rows of 0/1. */
function qr(text) {
  const bytes = [...new TextEncoder().encode(String(text))];
  const version = CAP.findIndex((c, i) => i > 0 && bytes.length + 3 <= c.data);
  if (version < 1)
    throw new Error(`qr: ${bytes.length} bytes is past the ${CAP[MAX_VERSION].data - 3} this encoder carries`);

  const words = encodeData(bytes, version);
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const { m, fixed, n } = skeleton(version);
    place(m, fixed, n, words);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
      if (!fixed[r][c] && MASKS[mask](r, c)) m[r][c] ^= 1;
    writeFormat(m, n, mask);
    const p = penalty(m, n);
    if (!best || p < best.p) best = { p, m, n, mask };
  }
  return { size: best.n, modules: best.m, version, mask: best.mask };
}

const QR = { qr, MAX_BYTES: CAP[MAX_VERSION].data - 3 };
if (typeof module !== "undefined" && module.exports) module.exports = QR;
