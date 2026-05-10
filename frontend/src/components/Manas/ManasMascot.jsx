import React, { useId } from 'react';
import { motion } from 'framer-motion';

// ───────── EYES ─────────
// Idle blink: open most of the time, then a quick close-and-open.
const BLINK_IDLE = {
  scaleY: [1, 1, 0.97, 0.05, 1],
  scale:  [1, 1, 1,    1,    1],
};
const BLINK_IDLE_TRANSITION = {
  duration: 4.5,
  times: [0, 0.90, 0.93, 0.95, 0.99],
  repeat: Infinity,
  ease: 'easeInOut',
};

// Excited eyes: wide open + a small surprised pop, no blinking.
const EXCITED_EYES = {
  scaleY: [1, 1.25, 1.18, 1.25, 1.2],
  scale:  [1, 1.20, 1.15, 1.20, 1.18],
};
const EXCITED_EYES_TRANSITION = {
  duration: 0.6,
  times: [0, 0.3, 0.5, 0.75, 1],
  ease: 'easeOut',
};

// ───────── MOUTH ─────────
// Idle mouth: gentle resting smile.
const MOUTH_IDLE = { scaleX: 1, scaleY: 1 };
// Excited mouth: bigger grin + a tiny laugh wobble.
const EXCITED_MOUTH = {
  scaleX: [1, 1.25, 1.18, 1.30, 1.25],
  scaleY: [1, 1.30, 1.20, 1.35, 1.25],
};
const EXCITED_MOUTH_TRANSITION = {
  duration: 0.6,
  times: [0, 0.3, 0.55, 0.8, 1],
  ease: 'easeOut',
};

// ───────── HANDS UP (on hover / excited) ─────────
// When excited, the "legs" swing outward and upward like raising both arms in
// a "Hi!" wave. Origin is at the bottom-near-body corner, so a large rotation
// flips the leg from vertical-down to angled-up-and-out.
const HANDS_UP_LEFT  = { rotate: -110 };
const HANDS_UP_RIGHT = { rotate:  110 };
const HANDS_UP_TRANSITION = {
  type: 'spring',
  stiffness: 260,
  damping: 18,
};

// ───────── LIFT-WEIGHT SEQUENCE (60-second cycle) ─────────
// Once per minute, MANAS does a brief lifting motion: legs bend inward like
// pushing a weight, face strains, sweat drips. Active phase is ~5s out of 60s
// (so MANAS is mostly idle but visibly "alive" with a periodic show of effort).
const LIFT_DURATION = 60;
// Keyframe times across the 60s cycle:
//   0 → 92%  rest (no movement)
//   92% (55.2s) → start to wind up
//   94% (56.4s) → peak strain (legs at max bend, sweat appears)
//   96% (57.6s) → still lifting (sweat drips down)
//   97% (58.2s) → start releasing
//   99% (59.4s) → almost back to rest
//   100% rest
const LIFT_TIMES = [0, 0.92, 0.94, 0.96, 0.97, 0.99, 1];

const LIFT_LEFT  = { rotate: [0, 0, -16, -16, -10, 0, 0] };
const LIFT_RIGHT = { rotate: [0, 0,  16,  16,  10, 0, 0] };
const LIFT_TRANSITION = {
  duration: LIFT_DURATION,
  times: LIFT_TIMES,
  repeat: Infinity,
  ease: 'easeInOut',
};
const LEG_STYLE_LEFT = {
  transformBox: 'fill-box',
  transformOrigin: 'bottom right',
};
const LEG_STYLE_RIGHT = {
  transformBox: 'fill-box',
  transformOrigin: 'bottom left',
};

// ───────── STRAIN FACE (during lift) ─────────
// Eyes squint hard during the lift's peak. Layered ON TOP of the blink via
// a wrapping <motion.g>; transforms compose multiplicatively so the eye
// shrinks into a squinted line.
const STRAIN_EYES = { scaleY: [1, 1, 0.35, 0.30, 0.55, 1, 1] };
const STRAIN_MOUTH = {
  scaleX: [1, 1, 0.7,  0.65, 0.85, 1, 1],
  scaleY: [1, 1, 0.55, 0.50, 0.75, 1, 1],
};

const STRAIN_FACE_TRANSITION = {
  duration: LIFT_DURATION,
  times: LIFT_TIMES,
  repeat: Infinity,
  ease: 'easeInOut',
};
const STRAIN_GROUP_STYLE = {
  transformBox: 'fill-box',
  transformOrigin: 'center',
};

// ───────── SWEAT DROP (appears during lift) ─────────
// Small bead near the right side of the forehead (above the right eye).
// Fades in at peak strain, drips down, then fades out — all in ~2 seconds.
const SWEAT_OPACITY    = [0, 0, 0.95, 0.85, 0,    0, 0];
const SWEAT_TRANSLATE_Y = [0, 0, 0,    140,  240, 0, 0];
const SWEAT_TRANSITION = {
  duration: LIFT_DURATION,
  times: LIFT_TIMES,
  repeat: Infinity,
  ease: 'easeIn',
};

const EYE_STYLE = {
  transformBox: 'fill-box',
  transformOrigin: 'center',
};
const MOUTH_STYLE = {
  transformBox: 'fill-box',
  transformOrigin: 'center top', // smile widens from the top
};

/**
 * MANAS robot mascot SVG.
 *
 * Each visible part has a `data-part` attribute so we can target it from CSS
 * (or refs) for animation later. Add transforms to the parts via CSS like:
 *
 *   .manas-mascot [data-part="eye-left"] { transform-origin: center; ... }
 *   .manas-mascot [data-part="ear-left"] { animation: wiggle 2s infinite; ... }
 *
 * Props:
 *   size       — width/height in px (default: 130). Aspect ratio is preserved.
 *   className  — extra classes on the root <svg>
 *   style      — inline style on the root <svg>
 *   title      — accessible label (default: "MANAS")
 *   ...rest    — forwarded to the <svg> element
 */
export default function ManasMascot({
  size = 130,
  className,
  style,
  title,            // optional — only rendered as <title> when explicitly provided
  ariaLabel = 'MANAS', // accessible name for screen readers; no native browser tooltip
  excited = false,
  ...rest
}) {
  // Unique clip-path id per instance so multiple mascots on one page don't collide.
  const clipId = `manas-clip-${useId().replace(/:/g, '')}`;

  // Aspect ratio of the original artboard: 3902 × 4637.
  // We let height auto-derive from width so the SVG scales correctly.
  const width = size;
  const height = (size * 4637) / 3902;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 3902 4637"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`manas-mascot${className ? ` ${className}` : ''}`}
      style={style}
      role="img"
      aria-label={title || ariaLabel}
      {...rest}
    >
      {title && <title>{title}</title>}
      <g clipPath={`url(#${clipId})`}>
        {/* Bottom dome / chin / legs base (gold) */}
        <path
          data-part="base"
          d="M2560.94 3929.25V4445.44C2560.94 4551.19 2473.79 4637 2366.4 4637C2321.55 4637 2269.8 4613.75 2247.61 4574.15C2238.16 4557.34 2232.91 4538.74 2228.71 4519.99C2217.16 4468.09 2210.11 4414.98 2193.76 4364.13C2177.41 4313.28 2151.76 4268.42 2117.86 4229.72C2091.02 4199.12 2057.27 4173.77 2018.42 4161.16C1974.32 4146.91 1927.38 4152.46 1886.43 4173.02C1849.53 4191.77 1818.63 4220.87 1794.33 4254.02C1755.49 4307.28 1729.69 4370.88 1714.84 4434.48C1709.59 4457.44 1705.69 4480.84 1702.69 4504.09C1699.54 4527.79 1698.49 4552.54 1686.34 4573.85C1664.14 4612.4 1623.05 4636.7 1578.05 4636.7C1447.11 4636.7 1341.06 4532.14 1341.06 4403.28V3938.85C1341.06 3611.97 1602.2 3337.3 1933.98 3328.45C2109.01 3323.8 2268 3391.91 2382.3 3504.11C2492.54 3612.87 2560.94 3763.18 2560.94 3928.95V3929.25Z"
          fill="#B99353"
        />

        {/* Left leg / "arm" — raises up on hover, otherwise periodic lift */}
        <motion.path
          data-part="leg-left"
          d="M1044.68 3611.52H1013.18C913.78 3611.52 833.196 3692.12 833.196 3791.54V4180.07C833.196 4279.48 913.78 4360.08 1013.18 4360.08H1044.68C1144.09 4360.08 1224.67 4279.48 1224.67 4180.07V3791.54C1224.67 3692.12 1144.09 3611.52 1044.68 3611.52Z"
          fill="#B99353"
          style={LEG_STYLE_LEFT}
          animate={excited ? HANDS_UP_LEFT : LIFT_LEFT}
          transition={excited ? HANDS_UP_TRANSITION : LIFT_TRANSITION}
        />

        {/* Right leg / "arm" — raises up on hover, otherwise periodic lift */}
        <motion.path
          data-part="leg-right"
          d="M2888.81 3611.52H2857.32C2757.91 3611.52 2677.33 3692.12 2677.33 3791.54V4180.07C2677.33 4279.48 2757.91 4360.08 2857.32 4360.08H2888.81C2988.22 4360.08 3068.8 4279.48 3068.8 4180.07V3791.54C3068.8 3692.12 2988.22 3611.52 2888.81 3611.52Z"
          fill="#B99353"
          style={LEG_STYLE_RIGHT}
          animate={excited ? HANDS_UP_RIGHT : LIFT_RIGHT}
          transition={excited ? HANDS_UP_TRANSITION : LIFT_TRANSITION}
        />

        {/* Main body / antenna sweep (gold) */}
        <path
          data-part="body"
          d="M3662.02 1648.47V2317.08C3662.02 2875.72 3209.19 3328.6 2650.63 3328.6H1250.77C692.206 3328.6 239.385 2875.72 239.385 2317.08V1648.47C239.385 1470.86 286.482 1294.6 375.726 1140.84C462.57 991.425 587.662 866.916 734.803 777.059C828.697 719.605 939.24 686.452 1042.13 647.599C1151.48 606.346 1261.27 566.293 1371.36 527.44C1483.56 487.837 1596.65 449.734 1707.34 405.781C1845.18 355.677 1982.87 305.423 2120.71 255.319C2242.51 210.916 2364.45 166.663 2486.24 122.259L2730.58 33.3027C2750.37 26.1022 2770.32 18.9016 2790.12 11.5511C2934.56 -40.9529 3078.25 90.907 3038.21 239.268L2921.21 673.551C3348.24 791.91 3661.72 1183.59 3661.72 1648.32L3662.02 1648.47Z"
          fill="#B99353"
        />

        {/* Inner face / dark cabin */}
        <path
          data-part="face"
          d="M1519.25 954.072H2416.35C2942.96 954.072 3370.58 1381.75 3370.58 1908.44V2354.13C3370.58 2721.51 3072.25 3019.88 2704.93 3019.88H1230.67C863.345 3019.88 565.014 2721.51 565.014 2354.13V1908.44C565.014 1381.75 992.636 954.072 1519.25 954.072Z"
          fill="#241C2F"
        />

        {/* Eyes — blink idle, pop excited on hover. Wrapped individually so the
            strain (squint during the lift) layers on top via separate motion.g. */}
        <motion.g
          style={STRAIN_GROUP_STYLE}
          animate={STRAIN_EYES}
          transition={STRAIN_FACE_TRANSITION}
        >
          <motion.path
            data-part="eye-left"
            d="M1250.77 2347.53C1407.5 2347.53 1534.55 2220.46 1534.55 2063.71C1534.55 1906.96 1407.5 1779.88 1250.77 1779.88C1094.04 1779.88 966.989 1906.96 966.989 2063.71C966.989 2220.46 1094.04 2347.53 1250.77 2347.53Z"
            fill="#FDFEFB"
            style={EYE_STYLE}
            animate={excited ? EXCITED_EYES : BLINK_IDLE}
            transition={excited ? EXCITED_EYES_TRANSITION : BLINK_IDLE_TRANSITION}
          />
        </motion.g>

        <motion.g
          style={STRAIN_GROUP_STYLE}
          animate={STRAIN_EYES}
          transition={STRAIN_FACE_TRANSITION}
        >
          <motion.path
            data-part="eye-right"
            d="M2664.88 2347.53C2821.61 2347.53 2948.66 2220.46 2948.66 2063.71C2948.66 1906.96 2821.61 1779.88 2664.88 1779.88C2508.15 1779.88 2381.1 1906.96 2381.1 2063.71C2381.1 2220.46 2508.15 2347.53 2664.88 2347.53Z"
            fill="#FDFEFB"
            style={EYE_STYLE}
            animate={excited ? EXCITED_EYES : BLINK_IDLE}
            transition={excited ? EXCITED_EYES_TRANSITION : BLINK_IDLE_TRANSITION}
          />
        </motion.g>

        {/* Mouth — grins when excited, purses tight during strain. */}
        <motion.g
          style={STRAIN_GROUP_STYLE}
          animate={STRAIN_MOUTH}
          transition={STRAIN_FACE_TRANSITION}
        >
          <motion.path
            data-part="mouth"
            d="M1856.88 2252.87H2067.47C2089.97 2252.87 2108.11 2271.17 2108.11 2293.52C2108.11 2375.73 2041.37 2442.33 1959.32 2442.33C1880.28 2442.33 1816.08 2378.13 1816.08 2299.07V2293.52C1816.08 2271.02 1834.38 2252.87 1856.73 2252.87H1856.88Z"
            fill="#FDFEFB"
            style={MOUTH_STYLE}
            animate={excited ? EXCITED_MOUTH : MOUTH_IDLE}
            transition={excited ? EXCITED_MOUTH_TRANSITION : { duration: 0.4, ease: 'easeOut' }}
          />
        </motion.g>

        {/* Sweat drop — appears at top-right of forehead during the lift,
            then drips downward and fades. Uses brand cream so it reads as a
            light bead on the dark cabin without breaking the brand palette. */}
        <motion.path
          data-part="sweat"
          d="M2920 1320 C2880 1280, 2880 1380, 2920 1430 C2960 1380, 2960 1280, 2920 1320 Z"
          fill="#E5E1DA"
          stroke="rgba(0,0,0,0.12)"
          strokeWidth="6"
          animate={{ opacity: SWEAT_OPACITY, y: SWEAT_TRANSLATE_Y }}
          transition={SWEAT_TRANSITION}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        />

        {/* Right ear / side button (dark) */}
        <path
          data-part="ear-right"
          d="M3662.01 1796.99H3722.01C3821.3 1796.99 3902 1877.69 3902 1977V2188.52C3902 2287.82 3821.3 2368.53 3722.01 2368.53H3662.01V1796.99Z"
          fill="#241C2F"
        />

        {/* Left ear / side button (dark) */}
        <path
          data-part="ear-left"
          d="M239.985 2364.18H179.989C80.6956 2364.18 0.000717163 2283.47 0.000717163 2184.17L0.000717163 1972.65C0.000717163 1873.34 80.6956 1792.64 179.989 1792.64H239.985L239.985 2364.18Z"
          fill="#241C2F"
        />
      </g>

      <defs>
        <clipPath id={clipId}>
          <rect width="3902" height="4637" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}
