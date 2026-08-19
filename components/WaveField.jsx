// Topographic contour lines for the card background.
//
// One organic contour is built from three stacked sines, then instantiated at
// irregular vertical offsets. Sharing a single shape is what keeps the stack
// reading as one coherent set — and it means the browser gets one path plus a
// list of <use> references rather than fifty separate path strings. The whole
// group is skewed, which tips the lines from bottom-left to top-right without
// changing the gaps between them.

const W = 420; // nominal card width, in viewBox units
const H = 580; // nominal card height
const SKEW = 27; // degrees of rise, left to right
const MIN_GAP = 3; // steep ground: contours crowd together
const MAX_GAP = 44; // flat ground: they spread right out
const START = -70; // draw past both edges so the skew never exposes a line end
const SPAN = W + 220;
const STEP = 20; // sampling interval along the contour

// Three harmonics: a long sweep, a mid roll, and a small ripple to break up the
// regularity. Amplitudes sum to roughly 26 units at the extremes.
const HARMONICS = [
  { amp: 16, wavelength: 520, phase: 0.4 },
  { amp: 7, wavelength: 290, phase: 2.1 },
  { amp: 3.2, wavelength: 170, phase: 4.7 },
];

const RISE = Math.tan((SKEW * Math.PI) / 180) * W;

const height = (x) =>
  HARMONICS.reduce((y, h) => y + h.amp * Math.sin((2 * Math.PI * x) / h.wavelength + h.phase), 0);

/** Catmull-Rom through the samples, converted to cubics for a smooth curve. */
function contourPath() {
  const pts = [];
  for (let x = START; x <= START + SPAN; x += STEP) pts.push([x, height(x)]);

  const at = (i) => pts[Math.min(pts.length - 1, Math.max(0, i))];
  let d = `M${pts[0][0]} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = at(i - 1);
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const [x3, y3] = at(i + 2);
    const c1x = x1 + (x2 - x0) / 6, c1y = y1 + (y2 - y0) / 6;
    const c2x = x2 - (x3 - x1) / 6, c2y = y2 - (y3 - y1) / 6;
    d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${x2} ${y2.toFixed(1)}`;
  }
  return d;
}

export default function WaveField() {
  const path = contourPath();

  // Contour density follows the terrain rather than chance: two slow,
  // incommensurate waves decide where the ground is steep — lines crowding
  // together — and where it flattens out and they spread. Neighbouring gaps
  // stay close to each other, which is what makes it read as a slope instead
  // of as noise.
  const top = -40;
  const bottom = H + RISE + 40;
  const span = bottom - top;
  const steepness = (t) =>
    Math.min(1, Math.max(0, 0.5 + 0.32 * Math.sin(t * 14.5 + 0.7) + 0.18 * Math.sin(t * 6.3 + 2.4)));

  const rows = [];
  for (let y = top; y <= bottom; ) {
    const t = (y - top) / span;
    rows.push({
      y: +y.toFixed(1),
      // Nested contours keep nearly the same shape; the drift is slight.
      scale: +(0.99 + 0.015 * Math.sin(t * 4.3 + 1.1)).toFixed(3),
    });
    y += MIN_GAP + (MAX_GAP - MIN_GAP) * Math.pow(1 - steepness(t), 2);
  }

  return (
    <svg
      className="h-full w-full"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <path id="topo-line" d={path} />
        {/* Ease the contours off behind the activity strip at the bottom. */}
        <linearGradient id="topo-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity=".75" />
          <stop offset="30%" stopColor="#fff" stopOpacity="1" />
          <stop offset="82%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity=".25" />
        </linearGradient>
        <mask id="topo-mask">
          <rect x="0" y="0" width={W} height={H} fill="url(#topo-fade)" />
        </mask>
      </defs>

      <g
        mask="url(#topo-mask)"
        transform={`skewY(-${SKEW})`}
        fill="none"
        stroke="#fff"
        strokeOpacity=".085"
        strokeWidth=".8"
        vectorEffect="non-scaling-stroke"
      >
        {rows.map((r, i) => (
          <use key={i} href="#topo-line" transform={`translate(0 ${r.y}) scale(1 ${r.scale})`} />
        ))}
      </g>
    </svg>
  );
}
