/* Speakeasy — skins. Pure presentation: silhouettes, palettes, names.
 * The engine never sees any of this; it deals only in colour and size indices.
 *
 * {C} = the drink colour (or a texture pattern url) · {S} = outline · {G} = glass tint
 * Inner class hooks drive the shared animation CSS: .liq .srf .gar .bub .ice .shine
 *
 * Both palettes are verified for colour-blind safety — a wide monotone luminance
 * ramp plus the TEXTURES channel, so ordering survives full greyscale.
 *   cocktails  greyscale 50 / 127 / 206
 *   cellar     greyscale 56 / 129 / 211
 */

const SHAPES = {

cocktails: [
/* 0 · SHOT — squat tapered tumbler, thick base, lime wedge on the rim */
{ w:26, h:30, svg:
`<defs><clipPath id="ckS"><path d="M6.2 7.5H19.8L18 25.9Q17.85 27.5 16.35 27.5H9.65Q8.15 27.5 8 25.9Z"/></clipPath></defs>
<path d="M5 6.4H21L19.1 26.4Q18.9 28.6 16.7 28.6H9.3Q7.1 28.6 6.9 26.4Z" fill="{G}"/>
<g clip-path="url(#ckS)">
  <g class="liq">
    <rect x="4" y="10.2" width="18" height="20" fill="{C}"/>
    <ellipse class="srf" cx="13" cy="10.2" rx="6.6" ry="1.15" fill="#fff" opacity=".3"/>
    <circle class="bub" cx="10.7" cy="19.6" r="1" fill="#fff" opacity=".45"/>
    <circle class="bub" cx="15.3" cy="20.8" r=".8" fill="#fff" opacity=".38"/>
  </g>
  <path d="M8.4 22.4H17.6L18 25.9Q17.85 27.5 16.35 27.5H9.65Q8.15 27.5 8 25.9Z" fill="{G}"/>
  <path class="shine" d="M8.8 8L10.4 8L11.3 25.4L9.8 25.4Z" fill="#fff" opacity=".16"/>
</g>
<path d="M5 6.4H21L19.1 26.4Q18.9 28.6 16.7 28.6H9.3Q7.1 28.6 6.9 26.4Z" fill="none" stroke="{S}" stroke-width="1.4" stroke-linejoin="round"/>
<g class="gar">
  <path d="M19.4 6.4V2.2A4.2 4.2 0 0 1 23.6 6.4Z" fill="#a9d94e" stroke="{S}" stroke-width=".8" stroke-linejoin="round"/>
  <path d="M19.4 6.4 22.5 3.3" stroke="#eef8d2" stroke-width=".9" stroke-linecap="round"/>
</g>
<g class="spk"><path d="M2.8 11.4l.5 2.1 2.1.5-2.1.5-.5 2.1-.5-2.1-2.1-.5 2.1-.5z" fill="{S}"/></g>
<g class="spk2"><path d="M23.2 16.6l.4 1.7 1.7.4-1.7.4-.4 1.7-.4-1.7-1.7-.4 1.7-.4z" fill="{S}"/></g>` },

/* 1 · COUPE — wide shallow bowl, stem, foot, cherry on a pick across the rim */
{ w:36, h:46, svg:
`<defs><clipPath id="ckC"><path d="M5.1 9.6H30.9Q30.9 21 18 23.4Q5.1 21 5.1 9.6Z"/></clipPath></defs>
<path d="M16.8 23.4H19.2L18.9 40.8H17.1Z" fill="{G}" stroke="{S}" stroke-width=".9" stroke-linejoin="round"/>
<path d="M8.6 44.6Q8.6 40.6 12.4 40.6H23.6Q27.4 40.6 27.4 44.6Z" fill="{G}" stroke="{S}" stroke-width="1" stroke-linejoin="round"/>
<path d="M3.6 8.4H32.4Q32.4 22 18 24.6Q3.6 22 3.6 8.4Z" fill="{G}"/>
<g clip-path="url(#ckC)">
  <g class="liq">
    <rect x="3" y="11.6" width="30" height="16" fill="{C}"/>
    <ellipse class="srf" cx="18" cy="11.6" rx="12.4" ry="1.5" fill="#fff" opacity=".28"/>
    <circle class="bub" cx="13.6" cy="19.4" r="1" fill="#fff" opacity=".42"/>
    <circle class="bub" cx="21.8" cy="18.6" r=".85" fill="#fff" opacity=".36"/>
  </g>
  <path class="shine" d="M7 9.9Q7.4 18.4 12.6 21.6L10.6 22.2Q5.9 18.6 5.6 9.9Z" fill="#fff" opacity=".17"/>
</g>
<path d="M3.6 8.4H32.4Q32.4 22 18 24.6Q3.6 22 3.6 8.4Z" fill="none" stroke="{S}" stroke-width="1.4" stroke-linejoin="round"/>
<g class="gar">
  <path d="M20.6 10.6 28 2.9" stroke="{S}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="28.6" cy="3.6" r="3.1" fill="#d5304a" stroke="{S}" stroke-width=".9"/>
  <path d="M29.7 1.1Q31.7.4 32.4 2.6" fill="none" stroke="#3f6b28" stroke-width="1" stroke-linecap="round"/>
  <circle cx="27.4" cy="2.5" r=".85" fill="#fff" opacity=".55"/>
</g>
<g class="spk"><path d="M1.9 15.2l.5 2.1 2.1.5-2.1.5-.5 2.1-.5-2.1L-.6 18l2.1-.5z" fill="{S}"/></g>
<g class="spk2"><path d="M33.4 21.6l.4 1.7 1.7.4-1.7.4-.4 1.7-.4-1.7-1.7-.4 1.7-.4z" fill="{S}"/></g>` },

/* 2 · HIGHBALL — tall narrow tumbler, two ice cubes, straw, mint sprig */
{ w:30, h:60, svg:
`<defs><clipPath id="ckH"><path d="M7.9 11.8H22.1L21.2 54.7Q21.1 57.4 18.7 57.4H11.3Q8.9 57.4 8.8 54.7Z"/></clipPath></defs>
<path d="M6.6 10.6H23.4L22.4 55.2Q22.3 58.6 19 58.6H11Q7.7 58.6 7.6 55.2Z" fill="{G}"/>
<g clip-path="url(#ckH)">
  <g class="liq">
    <rect x="6" y="17" width="18" height="42" fill="{C}"/>
    <ellipse class="srf" cx="15" cy="17" rx="7" ry="1.4" fill="#fff" opacity=".28"/>
    <g class="ice">
      <rect x="10.2" y="21.4" width="8.4" height="8.4" rx="2.1" transform="rotate(-13 14.4 25.6)" fill="#fff" fill-opacity=".24" stroke="#fff" stroke-opacity=".42" stroke-width=".9"/>
      <rect x="11.8" y="32.4" width="7.6" height="7.6" rx="1.9" transform="rotate(11 15.6 36.2)" fill="#fff" fill-opacity=".2" stroke="#fff" stroke-opacity=".34" stroke-width=".9"/>
    </g>
    <circle class="bub" cx="11.6" cy="47" r="1.05" fill="#fff" opacity=".5"/>
    <circle class="bub" cx="17.9" cy="50.6" r=".85" fill="#fff" opacity=".42"/>
    <circle class="bub" cx="14.5" cy="44.2" r=".7" fill="#fff" opacity=".38"/>
  </g>
  <path class="shine" d="M9.6 13H11.4L11.9 54H10.1Z" fill="#fff" opacity=".16"/>
</g>
<path d="M6.6 10.6H23.4L22.4 55.2Q22.3 58.6 19 58.6H11Q7.7 58.6 7.6 55.2Z" fill="none" stroke="{S}" stroke-width="1.4" stroke-linejoin="round"/>
<rect x="18.4" y="2.8" width="2.9" height="39" rx="1.4" transform="rotate(9 19.85 22)" fill="{G}" stroke="{S}" stroke-width=".8"/>
<g class="gar">
  <path d="M23.2 9Q26.4 4 29.2 6.2Q28.2 10.4 23.2 9Z" fill="#4f9c40" stroke="{S}" stroke-width=".7" stroke-linejoin="round"/>
  <path d="M23 9.2Q22.6 3.8 25.8 2.6Q27.6 6.4 23 9.2Z" fill="#7cc85c" stroke="{S}" stroke-width=".7" stroke-linejoin="round"/>
</g>
<g class="spk"><path d="M2.9 25l.5 2.1 2.1.5-2.1.5-.5 2.1-.5-2.1-2.1-.5 2.1-.5z" fill="{S}"/></g>
<g class="spk2"><path d="M26.6 37.4l.4 1.7 1.7.4-1.7.4-.4 1.7-.4-1.7-1.7-.4 1.7-.4z" fill="{S}"/></g>` }
],

cellar: [
/* 0 · WHISKY TUMBLER — heavy rocks glass, thick base, one big rock, orange twist */
{ w:30, h:30, svg:
`<defs><clipPath id="ckW"><path d="M6 9.8H24L22.6 26.2Q22.45 27.5 21.1 27.5H8.9Q7.55 27.5 7.4 26.2Z"/></clipPath></defs>
<path d="M4.6 8.6H25.4L23.8 26.6Q23.6 28.6 21.4 28.6H8.6Q6.4 28.6 6.2 26.6Z" fill="{G}"/>
<g clip-path="url(#ckW)">
  <g class="liq">
    <rect x="4" y="12.4" width="22" height="18" fill="{C}"/>
    <ellipse class="srf" cx="15" cy="12.4" rx="8.7" ry="1.2" fill="#fff" opacity=".3"/>
    <g class="ice">
      <rect x="10.3" y="13.4" width="9.4" height="9.4" rx="2.3" transform="rotate(-11 15 18.1)" fill="#fff" fill-opacity=".26" stroke="#fff" stroke-opacity=".48" stroke-width="1"/>
    </g>
  </g>
  <path d="M8.6 23.2H21.4L22.6 26.2Q22.45 27.5 21.1 27.5H8.9Q7.55 27.5 7.4 26.2Z" fill="{G}"/>
  <path class="shine" d="M8.6 10.4H10.6L11.3 26H9.3Z" fill="#fff" opacity=".16"/>
</g>
<path d="M4.6 8.6H25.4L23.8 26.6Q23.6 28.6 21.4 28.6H8.6Q6.4 28.6 6.2 26.6Z" fill="none" stroke="{S}" stroke-width="1.4" stroke-linejoin="round"/>
<g class="gar">
  <path d="M20.2 8.6Q25.8 8 26.4 4.6Q26.9 1.5 23.9 1.3Q21.6 1.2 21.8 3.4Q22 5.1 23.7 4.9" fill="none" stroke="#e08a1e" stroke-width="2.3" stroke-linecap="round"/>
  <path d="M20.8 8.1Q25.2 7.4 25.8 4.8" fill="none" stroke="#f7c877" stroke-width=".9" stroke-linecap="round"/>
</g>
<g class="spk"><path d="M2.8 12.4l.5 2.1 2.1.5-2.1.5-.5 2.1-.5-2.1-2.1-.5 2.1-.5z" fill="{S}"/></g>
<g class="spk2"><path d="M27 19.6l.4 1.7 1.7.4-1.7.4-.4 1.7-.4-1.7-1.7-.4 1.7-.4z" fill="{S}"/></g>` },

/* 1 · WINE GLASS — tulip bowl, stem, foot, orange wheel on the rim */
{ w:32, h:46, svg:
`<defs><clipPath id="ckV"><path d="M8.8 8C7 15.2 8.4 20.8 16 24.3C23.6 20.8 25 15.2 23.2 8Z"/></clipPath></defs>
<path d="M14.9 25.4H17.1L16.9 40.6H15.1Z" fill="{G}" stroke="{S}" stroke-width=".9" stroke-linejoin="round"/>
<path d="M7.6 44.6Q7.6 40.4 11.6 40.4H20.4Q24.4 40.4 24.4 44.6Z" fill="{G}" stroke="{S}" stroke-width="1" stroke-linejoin="round"/>
<path d="M7.4 6.8C5.4 15 7 21.4 16 25.6C25 21.4 26.6 15 24.6 6.8Z" fill="{G}"/>
<g clip-path="url(#ckV)">
  <g class="liq">
    <rect x="6" y="13.4" width="20" height="14" fill="{C}"/>
    <ellipse class="srf" cx="16" cy="13.4" rx="8.3" ry="1.4" fill="#fff" opacity=".26"/>
    <circle class="bub" cx="13.2" cy="21.8" r=".9" fill="#fff" opacity=".34"/>
    <circle class="bub" cx="18.4" cy="22.6" r=".75" fill="#fff" opacity=".28"/>
  </g>
  <path class="shine" d="M10.4 9.4C9.5 15.2 10.7 19.4 14.3 22.4L12.5 23.2C8.9 19.8 7.9 15 8.7 9.4Z" fill="#fff" opacity=".16"/>
</g>
<path d="M7.4 6.8C5.4 15 7 21.4 16 25.6C25 21.4 26.6 15 24.6 6.8Z" fill="none" stroke="{S}" stroke-width="1.4" stroke-linejoin="round"/>
<g class="gar">
  <circle cx="25.2" cy="6.4" r="4.2" fill="#f0932b" stroke="{S}" stroke-width=".9"/>
  <circle cx="25.2" cy="6.4" r="2.6" fill="#fbc16a"/>
  <path d="M25.2 2.2V10.6M21 6.4H29.4" stroke="#d97a12" stroke-width=".7"/>
</g>
<g class="spk"><path d="M2.8 14.2l.5 2.1 2.1.5-2.1.5-.5 2.1-.5-2.1-2.1-.5 2.1-.5z" fill="{S}"/></g>
<g class="spk2"><path d="M28.8 21.8l.4 1.7 1.7.4-1.7.4-.4 1.7-.4-1.7-1.7-.4 1.7-.4z" fill="{S}"/></g>` },

/* 2 · STEIN — tapered tankard, D-handle, foam head (the .srf), lime wedge */
{ w:34, h:60, svg:
`<defs><clipPath id="ckB"><path d="M6.7 11.6H21.3L20.4 54.7Q20.3 57.4 17.9 57.4H10.1Q7.7 57.4 7.6 54.7Z"/></clipPath></defs>
<path d="M22.4 17.4Q31.4 17.6 31.4 29Q31.4 40.4 22.4 40.6V37.6Q28.2 37.4 28.2 29Q28.2 20.6 22.4 20.4Z" fill="{G}" stroke="{S}" stroke-width="1.1" stroke-linejoin="round"/>
<path d="M5.4 10.4H22.6L21.6 55.2Q21.5 58.6 18.2 58.6H9.8Q6.5 58.6 6.4 55.2Z" fill="{G}"/>
<g clip-path="url(#ckB)">
  <g class="liq">
    <rect x="5" y="11.6" width="18" height="47" fill="{C}"/>
    <circle class="bub" cx="10.4" cy="45" r="1.05" fill="#fff" opacity=".5"/>
    <circle class="bub" cx="16.8" cy="49" r=".85" fill="#fff" opacity=".44"/>
    <circle class="bub" cx="13.4" cy="41" r=".7" fill="#fff" opacity=".4"/>
  </g>
  <path class="shine" d="M9 13.6H11L11.6 54H9.6Z" fill="#fff" opacity=".16"/>
</g>
<path d="M5.4 10.4H22.6L21.6 55.2Q21.5 58.6 18.2 58.6H9.8Q6.5 58.6 6.4 55.2Z" fill="none" stroke="{S}" stroke-width="1.4" stroke-linejoin="round"/>
<g class="srf">
  <path d="M5.2 11.6Q3.4 7.6 6.4 5.6Q6.6 1.9 10.4 2.8Q12.8.7 15.6 2.6Q19.2 1.2 20.8 4.6Q24.4 5.8 23.4 9.8Q23 11.6 22.6 11.6Z" fill="#f6efdd" stroke="{S}" stroke-width="1" stroke-linejoin="round"/>
  <circle cx="10.2" cy="7.2" r="1.3" fill="{S}" opacity=".16"/>
  <circle cx="16.4" cy="6" r="1" fill="{S}" opacity=".13"/>
  <circle cx="13.6" cy="9.4" r=".8" fill="{S}" opacity=".12"/>
</g>
<g class="gar">
  <path d="M22.6 10.8V6A4.8 4.8 0 0 1 27.4 10.8Z" fill="#9fce4a" stroke="{S}" stroke-width=".8" stroke-linejoin="round"/>
  <path d="M22.6 10.8 26.2 7.2" stroke="#eef8d2" stroke-width=".9" stroke-linecap="round"/>
</g>
<g class="spk"><path d="M2.6 26l.5 2.1 2.1.5-2.1.5-.5 2.1-.5-2.1-2.1-.5 2.1-.5z" fill="{S}"/></g>
<g class="spk2"><path d="M31.4 45l.4 1.7 1.7.4-1.7.4-.4 1.7-.4-1.7-1.7-.4 1.7-.4z" fill="{S}"/></g>` }
],

/* GEOMETRY — the control skin. Same three colours as cocktails, byte for byte,
 * so swapping to it changes ONE variable: whether the silhouette needs any
 * knowledge to read. A shot, a coupe and a highball ask you to already know
 * what a coupe is; a circle, a triangle and a square ask nothing.
 *
 * Order is circle → triangle → square, and it is not the order anyone says the
 * three shapes in. Size is an ORDINAL attribute — rules talk about sizes never
 * decreasing and the largest sitting in the middle — so the ramp has to read
 * small-to-large with zero learning. A triangle is half its bounding box, so a
 * triangle drawn tallest still has less ink than a square drawn shorter, and
 * height would say one thing while area said another. This order keeps both
 * monotone: heights 28 / 42 / 56 on a shared baseline (the documented 1:1.5:2),
 * areas roughly 490 / 800 / 2900.
 *
 * Deliberately no garnish and no idle motion — no .gar, no .bub, no .ice. The
 * shared accept/refuse animations run off .tok, .liq, .srf and .spk, which are
 * all here, so the feedback is identical to the other skins; what is missing is
 * only decoration, which is the whole point of a control.
 *
 * AND NO clipPath, which is the load-bearing difference. A glass needs one —
 * its liquid is a rectangle that has to be cut to the silhouette. A circle,
 * triangle or square IS its own silhouette, so the shape is filled directly and
 * this skin authors no ids at all. Ids are per-shape, so every copy on the page
 * shares them and the renderer has to rewrite them per instance; authoring none
 * means there is nothing to rewrite and nothing to collide. Shipped once with a
 * clipPath and it rendered as unclipped squares on a page whose renderer had
 * not been reloaded — correct markup, but a failure mode worth not having. */
geometry: [
/* 0 · CIRCLE — smallest */
{ w:28, h:28, svg:
`<g class="liq">
  <circle cx="14" cy="14" r="12.8" fill="{C}"/>
  <ellipse class="srf" cx="14" cy="8.4" rx="6" ry="1.8" fill="#fff" opacity=".2"/>
</g>
<circle cx="14" cy="14" r="12.8" fill="none" stroke="{S}" stroke-width="1.4"/>
<g class="spk"><path d="M2.2 2.6l.5 2.1 2.1.5-2.1.5-.5 2.1-.5-2.1-2.1-.5 2.1-.5z" fill="{S}"/></g>
<g class="spk2"><path d="M25.6 20l.4 1.7 1.7.4-1.7.4-.4 1.7-.4-1.7-1.7-.4 1.7-.4z" fill="{S}"/></g>` },

/* 1 · TRIANGLE — middle */
{ w:42, h:42, svg:
`<g class="liq">
  <path d="M21 2.6 39.8 39.4H2.2Z" fill="{C}"/>
  <ellipse class="srf" cx="21" cy="26" rx="7" ry="2" fill="#fff" opacity=".2"/>
</g>
<path d="M21 2.6 39.8 39.4H2.2Z" fill="none" stroke="{S}" stroke-width="1.5" stroke-linejoin="round"/>
<g class="spk"><path d="M3.4 8l.5 2.1 2.1.5-2.1.5-.5 2.1-.5-2.1-2.1-.5 2.1-.5z" fill="{S}"/></g>
<g class="spk2"><path d="M38.6 12.4l.4 1.7 1.7.4-1.7.4-.4 1.7-.4-1.7-1.7-.4 1.7-.4z" fill="{S}"/></g>` },

/* 2 · SQUARE — largest */
{ w:56, h:56, svg:
`<g class="liq">
  <rect x="2.4" y="2.4" width="51.2" height="51.2" rx="3.4" fill="{C}"/>
  <ellipse class="srf" cx="28" cy="12" rx="14" ry="2.6" fill="#fff" opacity=".2"/>
</g>
<rect x="2.4" y="2.4" width="51.2" height="51.2" rx="3.4" fill="none" stroke="{S}" stroke-width="1.5"/>
<g class="spk"><path d="M3 3.6l.5 2.1 2.1.5-2.1.5-.5 2.1-.5-2.1-2.1-.5 2.1-.5z" fill="{S}"/></g>
<g class="spk2"><path d="M52.2 46l.4 1.7 1.7.4-1.7.4-.4 1.7-.4-1.7-1.7-.4 1.7-.4z" fill="{S}"/></g>` }
]};

const TEXTURES = [
  null,
  { w:9,   h:9,   rot:45, body:`<rect x="0" y="0" width="3.9" height="9" fill="{T}"/>` },
  { w:7.6, h:7.6, rot:0,  body:`<circle cx="3.8" cy="3.8" r="2" fill="{T}"/>` }
];

const SKINS = {
  cocktails: { label:"cocktails", sizes:["Shot","Coupe","Highball"],
    cols:[{name:"Grenadine",hex:"#a80f33"},{name:"Curaçao",hex:"#2b8bff"},{name:"Midori",hex:"#96ec46"}] },
  cellar:    { label:"cellar", sizes:["Tumbler","Wine glass","Stein"],
    cols:[{name:"Claret",hex:"#86203a"},{name:"Amber",hex:"#cd7519"},{name:"Straw",hex:"#f5d64e"}] },
  /* The control. Palette is cocktails' three hexes unchanged — already verified
     against all three simulations — so the ONLY difference between playing this
     and playing cocktails is whether the silhouette needs prior knowledge.
     Plain colour names for the same reason: "Grenadine" is a word you either
     know or spend a probe wondering about. */
  geometry:  { label:"geometry", sizes:["Circle","Triangle","Square"],
    cols:[{name:"Red",hex:"#a80f33"},{name:"Blue",hex:"#2b8bff"},{name:"Green",hex:"#96ec46"}] }
};;

if (typeof module !== "undefined" && module.exports) module.exports = { SHAPES, TEXTURES, SKINS };
