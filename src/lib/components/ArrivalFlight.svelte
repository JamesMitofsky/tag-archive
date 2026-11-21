<!--
	A paper plane bringing a new artefact in to /keeper/live: it sweeps in from the
	bottom-left edge of the screen, flies one loop over the stage, and glides
	down onto `target`, drawing a dashed contrail behind it. On touchdown it calls
	`onlanded` (the page unfolds the artefact's sheet there), then fades itself
	and its contrail out and calls `ondone`, so the page can unmount it.

	The same plane and pen as PaperPlaneFlight, at a size that reads across a
	room. One clock drives everything: each frame takes the eased progress,
	places the plane at that point of the path (getPointAtLength), turns its nose
	along the tangent, and reveals the contrail up to the same point. CSS
	offset-path would do the placing, but how browsers anchor a path() to its
	element has differed, and a separate CSS clock for the reveal could drift
	from it; this way the two cannot disagree.

	Never mounted under reduced motion (the page just fades the sheet in), and
	purely decorative: hidden from assistive tech and from clicks.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { PLANE_PATH, INK } from '#lib/components/PaperPlaneFlight.svelte';

	interface Props {
		/** Where to land, in viewport pixels: the center of the stage. */
		target: { x: number; y: number };
		/** The plane has touched down: show what it brought. */
		onlanded: () => void;
		/** The plane and contrail have faded: unmount this. */
		ondone: () => void;
	}

	let { target, onlanded, ondone }: Props = $props();

	/** The flight itself, from off screen to touchdown. */
	const FLIGHT_MS = 2600;
	/** After touchdown, the plane folds away into the sheet. */
	const PLANE_FADE_MS = 220;
	/** And the contrail lingers a little longer behind it. */
	const TRAIL_FADE_MS = 900;
	/** Plane scale over PLANE_PATH's ~16-unit span: about 56px nose to tail. */
	const PLANE_SCALE = 3.5;

	let width = $state(0);
	let height = $state(0);
	let flight = $state('');
	let route = $state<SVGPathElement>();
	let reveal = $state<SVGPathElement>();
	let plane = $state<SVGGElement>();
	let trail = $state<SVGGElement>();

	/**
	 * The route, built for this screen: a sweep up from below the bottom-left
	 * corner, one loop around the target, then a short glide down onto it. The
	 * loop is sized to the smaller side of the screen (so it fits a phone held
	 * either way) and kept to about the stage's own footprint, so it circles the
	 * empty stage rather than crossing the heading above it.
	 */
	function routeFor(w: number, h: number, { x, y }: { x: number; y: number }): string {
		const s = Math.min(w, h) * 0.7;
		const p = (dx: number, dy: number) => `${(x + dx * s).toFixed(1)} ${(y + dy * s).toFixed(1)}`;
		return [
			`M -80 ${(h * 0.9).toFixed(1)}`,
			// In from the left, climbing to the loop's top-left.
			`C ${(w * 0.2).toFixed(1)} ${(h * 0.95).toFixed(1)} ${p(-0.6, 0.05)} ${p(-0.2, -0.16)}`,
			// Over the top and down the right side.
			`C ${p(0.02, -0.3)} ${p(0.32, -0.22)} ${p(0.24, 0.02)}`,
			// Along the bottom and back up the left.
			`C ${p(0.16, 0.24)} ${p(-0.16, 0.22)} ${p(-0.14, 0.02)}`,
			// Out of the loop, settling onto the target.
			`C ${p(-0.12, -0.12)} ${p(-0.02, -0.1)} ${p(0, 0)}`
		].join(' ');
	}

	/** Gentle in, gentle out: the plane picks up speed, then settles. */
	const ease = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

	onMount(() => {
		width = window.innerWidth;
		height = window.innerHeight;
		flight = routeFor(width, height, target);

		let frame = 0;
		let landed = false;
		let finished = false;
		const timers: ReturnType<typeof setTimeout>[] = [];

		const land = () => {
			if (landed) return;
			landed = true;
			onlanded();
			plane?.animate([{ opacity: 1 }, { opacity: 0 }], {
				duration: PLANE_FADE_MS,
				fill: 'forwards'
			});
			trail?.animate([{ opacity: 1 }, { opacity: 0 }], {
				duration: TRAIL_FADE_MS,
				easing: 'ease-out',
				fill: 'forwards'
			});
			timers.push(setTimeout(finish, TRAIL_FADE_MS));
		};
		const finish = () => {
			if (finished) return;
			finished = true;
			ondone();
		};

		// Wait one frame for the path to be in the DOM before measuring it.
		frame = requestAnimationFrame((start) => {
			if (!route || !reveal || !plane) return land();
			const length = route.getTotalLength();
			const step = (now: number) => {
				const t = Math.min(1, (now - start) / FLIGHT_MS);
				const at = ease(t) * length;
				const here = route!.getPointAtLength(at);
				// The heading, from a point just behind: the nose follows the path.
				const behind = route!.getPointAtLength(Math.max(0, at - 1));
				const heading = (Math.atan2(here.y - behind.y, here.x - behind.x) * 180) / Math.PI;
				plane!.setAttribute(
					'transform',
					`translate(${here.x} ${here.y}) rotate(${heading}) scale(${PLANE_SCALE})`
				);
				reveal!.style.strokeDashoffset = String(1 - ease(t));
				if (t < 1) frame = requestAnimationFrame(step);
				else land();
			};
			step(start);
		});

		// A hidden tab stops drawing frames, so a flight that started just before
		// the screen went to sleep would never land. The timer still lands it,
		// so the queue of arrivals behind it can't stall.
		timers.push(setTimeout(land, FLIGHT_MS + 1000));

		return () => {
			cancelAnimationFrame(frame);
			for (const timer of timers) clearTimeout(timer);
		};
	});
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 {width || 1} {height || 1}"
	fill="none"
	stroke={INK}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	class="pointer-events-none fixed inset-0 z-30 h-dvh w-screen overflow-visible"
>
	{#if flight}
		<defs>
			<!-- The contrail is dashed, so its own dash pattern can't also reveal it:
			     a solid copy of the route, drawn up to the plane, masks it. -->
			<mask
				id="arrival-contrail"
				maskUnits="userSpaceOnUse"
				x="-200"
				y="-200"
				width={width + 400}
				height={height + 400}
			>
				<path
					bind:this={reveal}
					d={flight}
					pathLength="1"
					stroke="#fff"
					stroke-width="8"
					stroke-dasharray="1"
					stroke-dashoffset="1"
				/>
			</mask>
		</defs>
		<g bind:this={trail}>
			<path
				bind:this={route}
				d={flight}
				stroke-width="2"
				stroke-dasharray="6 10"
				mask="url(#arrival-contrail)"
			/>
		</g>
		<!-- Parked off screen until the first frame places it. -->
		<g bind:this={plane} transform="translate(-200 -200)">
			<path d={PLANE_PATH} stroke-width="0.45" fill="#fff" />
			<!-- The center fold, so it reads as paper rather than an arrowhead. -->
			<path d="M-3.5 0L8 0" stroke-width="0.35" />
		</g>
	{/if}
</svg>
