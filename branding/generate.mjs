// Generates the Barkat logo assets in this folder: SVG variants plus PNG and ICO exports.
//
//   cd branding && npm i --no-save opentype.js @fontsource/inter sharp && node generate.mjs
//
// The wordmark is set in Inter (SIL OFL) and converted to outlines, so the SVGs
// need no font installed. The mark is a crescent cradling a coin, with a faint
// starfield and a soft sparkle: a crescent bowl holding what you have, under a sky of blessings.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import opentype from "opentype.js";
import sharp from "sharp";

const C = {
  green1: "#2a8a64",
  green2: "#185a40",
  greenInk: "#1f6f50",
  cream: "#fbf7ec",
  mint: "#5cc49a",
  black: "#0d0d0d",
  inkLight: "#0b0b0b",
  inkDark: "#f0efec",
  mutedDark: "#c3c2b7",
};

const bold = opentype.parse(toArrayBuffer(readFileSync("node_modules/@fontsource/inter/files/inter-latin-700-normal.woff")));
const regular = opentype.parse(toArrayBuffer(readFileSync("node_modules/@fontsource/inter/files/inter-latin-400-normal.woff")));

function toArrayBuffer(buf) {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/* ---------- the mark, in a 100-unit box: crescent x 14-78, y 22-86; sparkle to x 85, y 19 ---------- */

// A crescent (a disc with an offset disc cut away) opening to the upper right, a coin
// in its hollow, a sparkle above and a faint starfield. Small sizes drop the starfield
// and strengthen the sparkle ("flat"), since fine detail disappears under about 32px.
const MARK_W = 71;
const MARK_CX = 49.5;
const MARK_CY = 52.5;

const star4 = (cx, cy, r, fill, op = 1) => {
  const k = r * 0.3;
  return `<path d="M${cx} ${cy - r} L${cx + k} ${cy - k} L${cx + r} ${cy} L${cx + k} ${cy + k} L${cx} ${cy + r} L${cx - k} ${cy + k} L${cx - r} ${cy} L${cx - k} ${cy - k} Z" fill="${fill}" opacity="${op}"/>`;
};

const STARS = [[86, 46, 3.2], [80, 72, 2.4], [88, 66, 2.1], [58, 14, 2.4], [84, 84, 1.9], [46, 12, 1.8]];
const DOTS = [[92, 30, 1.1], [78, 60, 1], [52, 26, 1], [90, 54, 1], [66, 70, 0.9], [68, 14, 1]];

let markCount = 0;
/** colours: { crescent, coin, spark, stars }. */
const mark = ({ crescent, coin, spark, stars }, flat = false) => {
  const id = ++markCount;
  const sparkR = flat ? 10 : 8.5;
  const coinR = flat ? 10.5 : 9;
  const defs =
    `<defs><mask id="mc${id}"><rect width="100" height="100" fill="#fff"/><circle cx="60" cy="44" r="28" fill="#000"/></mask>` +
    `<radialGradient id="hg${id}"><stop offset="0" stop-color="${spark}" stop-opacity="0.38"/><stop offset="1" stop-color="${spark}" stop-opacity="0"/></radialGradient></defs>`;
  const sky = flat
    ? ""
    : STARS.map(([x, y, r]) => star4(x, y, r, stars, 0.34)).join("") +
      DOTS.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${stars}" opacity="0.42"/>`).join("") +
      `<circle cx="76" cy="28" r="17" fill="url(#hg${id})"/>`;
  return (
    defs +
    sky +
    `<circle cx="46" cy="54" r="32" fill="${crescent}" mask="url(#mc${id})"/>` +
    `<circle cx="62" cy="52" r="${coinR}" fill="${coin}"/>` +
    star4(76, 28, sparkR, spark, flat ? 0.95 : 0.62)
  );
};

const COLOURS = {
  onGreen: { crescent: C.cream, coin: C.mint, spark: C.cream, stars: C.cream },
  onDark: { crescent: C.mint, coin: C.cream, spark: C.mint, stars: C.mint },
  mono: { crescent: "currentColor", coin: "currentColor", spark: "currentColor", stars: "currentColor" },
  forLight: { crescent: C.greenInk, coin: C.mint, spark: C.greenInk, stars: C.greenInk },
  forDark: { crescent: C.mint, coin: C.cream, spark: C.mint, stars: C.mint },
};

/** The mark placed at the middle of a square of `size`, filling `fill` of its width. */
function placed(size, fill, colours, flat = false) {
  const s = (size * fill) / MARK_W;
  return `<g transform="translate(${size / 2 - MARK_CX * s} ${size / 2 - MARK_CY * s}) scale(${s})">${mark(colours, flat)}</g>`;
}

const gradient = (id) =>
  `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.green1}"/><stop offset="1" stop-color="${C.green2}"/></linearGradient></defs>`;

/* ---------- tiles ---------- */

function tile(size, { rx = size * 0.22, fill = 0.72, dark = false, id = "g", flat = false } = {}) {
  if (dark) {
    return `<rect width="${size}" height="${size}" rx="${rx}" fill="${C.black}"/>${placed(size, fill, COLOURS.onDark, flat)}`;
  }
  return `${gradient(id)}<rect width="${size}" height="${size}" rx="${rx}" fill="url(#${id})"/>${placed(size, fill, COLOURS.onGreen, flat)}`;
}

const svg = (w, h, body, extra = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${extra}>${body}</svg>\n`;

/* ---------- text as outlines ---------- */

function text(font, str, size, x, y, fill, letterSpacing = 0) {
  // Glyph by glyph with pair kerning: opentype.js trips over Inter's feature tables otherwise.
  const scale = size / font.unitsPerEm;
  let pen = x;
  let d = "";
  const glyphs = [...str].map((ch) => font.charToGlyph(ch));
  glyphs.forEach((g, i) => {
    d += g.getPath(pen, y, size).toPathData(2);
    pen += g.advanceWidth * scale + letterSpacing;
    if (glyphs[i + 1]) pen += font.getKerningValue(g, glyphs[i + 1]) * scale;
  });
  return { svg: `<path d="${d}" fill="${fill}"/>`, width: pen - x - letterSpacing };
}

const CAP = 0.727; // Inter cap height / em

/* ---------- variants ---------- */

const files = {};

files["barkat-icon.svg"] = svg(512, 512, tile(512));
files["barkat-icon-dark.svg"] = svg(512, 512, tile(512, { dark: true }));

// Mark alone: one colour (inherits currentColor), or in brand colours for light and dark pages.
const markBox = ` viewBox="10 10 86 82"`;
const bare = (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="344" height="328"${markBox}>${mark(color)}</svg>\n`;
files["barkat-mark.svg"] = bare(COLOURS.mono);
files["barkat-mark-light.svg"] = bare(COLOURS.forLight);
files["barkat-mark-dark.svg"] = bare(COLOURS.forDark);

function horizontal(ink, dark) {
  const icon = 64;
  const gap = 18;
  const size = 56;
  const word = text(bold, "Barkat", size, icon + gap, icon / 2 + (size * CAP) / 2, ink, -0.01 * size);
  const w = Math.ceil(icon + gap + word.width);
  return svg(w, icon, `${tile(icon, { rx: 14, dark, id: "gh" })}${word.svg}`);
}
files["barkat-logo.svg"] = horizontal(C.inkLight, false);
files["barkat-logo-dark.svg"] = horizontal(C.inkDark, true);

function stacked(ink, dark) {
  const icon = 160;
  const size = 72;
  const word = text(bold, "Barkat", size, 0, 0, ink, -0.01 * size);
  const w = Math.ceil(Math.max(icon, word.width)) + 40;
  const wordX = (w - word.width) / 2;
  const placedWord = text(bold, "Barkat", size, wordX, icon + 28 + size * CAP, ink, -0.01 * size);
  const iconSvg = `<g transform="translate(${(w - icon) / 2} 0)">${tile(icon, { rx: 36, dark, id: "gs" })}</g>`;
  return svg(w, Math.ceil(icon + 28 + size * CAP) + 6, `${iconSvg}${placedWord.svg}`);
}
files["barkat-stacked.svg"] = stacked(C.inkLight, false);
files["barkat-stacked-dark.svg"] = stacked(C.inkDark, true);

// Favicon: a bigger mark so it holds up at 16px.
files["favicon.svg"] = svg(512, 512, tile(512, { fill: 0.84, rx: 112, id: "gf", flat: true }));

// Social preview, 1280x640.
{
  const W = 1280;
  const H = 640;
  const icon = 132;
  const size = 116;
  const word = text(bold, "Barkat", size, 0, 0, C.inkDark, -0.01 * size);
  const total = icon + 34 + word.width;
  const x0 = (W - total) / 2;
  const y0 = 205;
  const wordSvg = text(bold, "Barkat", size, x0 + icon + 34, y0 + icon / 2 + (size * CAP) / 2, C.inkDark, -0.01 * size);
  const tag = text(regular, "Household bills, kept week by week.", 38, 0, 0, C.mutedDark);
  const tagSvg = text(regular, "Household bills, kept week by week.", 38, (W - tag.width) / 2, y0 + icon + 96, C.mutedDark);
  const sub = text(regular, "Self-hosted. Open source.", 26, 0, 0, C.mint);
  const subSvg = text(regular, "Self-hosted. Open source.", 26, (W - sub.width) / 2, y0 + icon + 150, C.mint);
  const bg = `<defs><radialGradient id="bg" cx="0.5" cy="0.35" r="0.9"><stop offset="0" stop-color="#16271f"/><stop offset="1" stop-color="${C.black}"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#bg)"/>`;
  files["social-preview.svg"] = svg(
    W,
    H,
    `${bg}<g transform="translate(${x0} ${y0})">${tile(icon, { rx: 30, dark: true, id: "gp" })}</g>${wordSvg.svg}${tagSvg.svg}${subSvg.svg}`,
  );
}

/* ---------- write ---------- */

mkdirSync(".", { recursive: true });
for (const [name, body] of Object.entries(files)) writeFileSync(name, body);

const png = (name, svgText, width, height) =>
  sharp(Buffer.from(svgText), { density: 384 }).resize(width, height).png().toFile(name);

// Full-bleed variants for platforms that round or mask the icon themselves.
const square = (size, fill, flat = false) =>
  svg(size, size, `${gradient("gq")}<rect width="${size}" height="${size}" fill="url(#gq)"/>${placed(size, fill, COLOURS.onGreen, flat)}`);

await Promise.all([
  png("barkat-icon.png", files["barkat-icon.svg"], 512, 512),
  png("icon-192.png", files["barkat-icon.svg"], 192, 192),
  png("icon-512.png", files["barkat-icon.svg"], 512, 512),
  png("icon-maskable-512.png", square(512, 0.56), 512, 512),
  png("apple-touch-icon.png", square(180, 0.72), 180, 180),
  png("favicon-32.png", files["favicon.svg"], 32, 32),
  png("favicon-16.png", files["favicon.svg"], 16, 16),
  png("barkat-logo.png", files["barkat-logo.svg"], 1200, Math.round((1200 * 64) / Math.ceil(parseFloat(/width="(\d+)"/.exec(files["barkat-logo.svg"])[1])))),
  png("social-preview.png", files["social-preview.svg"], 1280, 640),
]);

// favicon.ico: PNG-compressed 16 and 32.
{
  const parts = [readFileSync("favicon-16.png"), readFileSync("favicon-32.png")];
  const sizes = [16, 32];
  const head = Buffer.alloc(6 + 16 * parts.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(parts.length, 4);
  let offset = head.length;
  parts.forEach((p, i) => {
    const at = 6 + 16 * i;
    head.writeUInt8(sizes[i], at);
    head.writeUInt8(sizes[i], at + 1);
    head.writeUInt16LE(1, at + 4);
    head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(p.length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += p.length;
  });
  writeFileSync("favicon.ico", Buffer.concat([head, ...parts]));
}

console.log("wrote", Object.keys(files).length, "SVGs and the PNG and ICO exports");
