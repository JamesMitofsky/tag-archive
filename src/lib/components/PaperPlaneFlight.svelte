<script lang="ts" module>
	/**
	 * A paper plane in the drawings' pen, nose toward +x and centered on the
	 * origin, so it can ride a motion path or be turned to any heading.
	 */
	export const PLANE_PATH = 'M-7 -5.5Q0.5 -3 8 0Q0.5 3 -7 5.5Q-5 2.5 -3.5 0Q-5 -2.5 -7 -5.5Z';
	/** Ink sampled from the hand-drawn assets under static/drawing. */
	export const INK = '#0d0b0a';
</script>

<script lang="ts">
	// The plane leaving the send button: it climbs up and to the right, flies one
	// loop and heads off, drawing a dashed contrail behind it, then starts again
	// for as long as this is mounted. Mount it while the send is pending.
	//
	// It is a 1px SVG with visible overflow, pinned to the center of its nearest
	// positioned ancestor, so the origin of the flight is wherever the resting
	// plane icon sits and nothing around it moves to make room.
	//
	// The motion is SMIL rather than CSS: the plane, the contrail's reveal and the
	// fade share one clock that starts when the SVG is inserted, and
	// <animateMotion> keeps the nose on the path's tangent. SMIL does not hear
	// prefers-reduced-motion, so the whole thing is not displayed under it (the
	// caller shows a spinner instead).

	// Up and right out of the button, one loop, then away.
	const FLIGHT =
		'M0 0C14 -14 34 -22 36 -38C38 -52 20 -56 16 -44C12 -30 34 -34 46 -52C52 -62 56 -74 58 -92';
	const DURATION = '1.4s';
	// The flight takes the first 85% of each cycle; the rest is the fade.
	const KEY_TIMES = '0;0.85;1';
	const KEY_SPLINES = '0.3 0 0.7 1;0 0 1 1';
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 1 1"
	fill="none"
	stroke={INK}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	class="pointer-events-none absolute top-1/2 left-1/2 h-px w-px overflow-visible motion-reduce:hidden"
>
	<defs>
		<!-- The contrail is dashed, so its own dash pattern can't also reveal it.
		     A solid copy of the path, drawn as the plane advances, masks it. -->
		<mask id="plane-contrail" maskUnits="userSpaceOnUse" x="-12" y="-104" width="84" height="116">
			<path
				d={FLIGHT}
				pathLength="1"
				stroke="#fff"
				stroke-width="5"
				stroke-dasharray="1"
				stroke-dashoffset="1"
			>
				<animate
					attributeName="stroke-dashoffset"
					values="1;0;0"
					keyTimes={KEY_TIMES}
					calcMode="spline"
					keySplines={KEY_SPLINES}
					dur={DURATION}
					repeatCount="indefinite"
				/>
			</path>
		</mask>
	</defs>
	<g>
		<animate
			attributeName="opacity"
			values="1;1;0"
			keyTimes="0;0.8;1"
			dur={DURATION}
			repeatCount="indefinite"
		/>
		<path d={FLIGHT} stroke-width="1.25" stroke-dasharray="2.5 4" mask="url(#plane-contrail)" />
		<path d={PLANE_PATH} stroke-width="1.5" fill="#fff">
			<animateMotion
				path={FLIGHT}
				rotate="auto"
				keyPoints="0;1;1"
				keyTimes={KEY_TIMES}
				calcMode="spline"
				keySplines={KEY_SPLINES}
				dur={DURATION}
				repeatCount="indefinite"
			/>
		</path>
	</g>
</svg>
