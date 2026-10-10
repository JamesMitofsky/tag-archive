<script lang="ts">
	import { onMount } from 'svelte';
	import { DC, frameDistance, paintSky, skyFrame, type SkyFrame } from '$lib/sky/engine';
	import { skyHeadScript, skyHeadStyle } from '$lib/sky/headScript';
	import { SKY_PALETTE } from '$lib/sky/palette';
	import { MAX_STEP_DE, nextRepaintDelay, skyClock } from '$lib/sky/schedule';
	import { SPARKLE_PATH, STARS, starCount } from '$lib/sky/stars';

	// Ambient sky shared across pages: a watercolor-paper backdrop coloured by the
	// sun over Washington, DC ($lib/sky), glowing round the sun's place as it
	// arcs across the screen; stars behind it at night; plus a few soft cloud
	// WebP images drifting very slowly left→right, forever. Negative delays
	// pre-spread them across the viewport so the sky looks full at load instead
	// of empty until the first cloud wanders in. Sits behind all page content.
	//
	// The colour lives in CSS custom properties on <html> (the glow's colours,
	// the sun's place, --sky-clouds and --sky-stars; see paintSky). The inline head
	// script paints the first frame before render; from here on the sky follows
	// the sun live, repainting only as often as the screen perceptibly changes
	// ($lib/sky/schedule). Hidden tabs don't repaint at all; returning to one
	// (or waking the device) catches up with a short fade.
	onMount(() => {
		const root = document.documentElement;
		const clock = skyClock(location.search);
		const frameAt = (ms: number) => skyFrame(ms, SKY_PALETTE, DC.lat, DC.lon);
		const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

		let painted: SkyFrame | null = null;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let fadeTimer: ReturnType<typeof setTimeout> | undefined;

		function paint(frame: SkyFrame) {
			// A jump (the tab was hidden, the device slept) fades over instead of
			// snapping; routine steps are too small to see and paint instantly.
			const jump = painted !== null && frameDistance(painted, frame) > 2 * MAX_STEP_DE;
			if (jump && !reducedMotion.matches) {
				root.classList.add('sky-catch-up');
				clearTimeout(fadeTimer);
				fadeTimer = setTimeout(() => root.classList.remove('sky-catch-up'), 1500);
			}
			paintSky(frame, root);
			painted = frame;
		}

		function tick() {
			const now = clock.now();
			paint(frameAt(now));
			// Sky time → real time; a time-lapse preview never spins faster than 20 fps.
			timer = setTimeout(tick, Math.max(50, nextRepaintDelay(now, frameAt) / clock.speed));
		}

		function onVisibility() {
			clearTimeout(timer);
			if (document.visibilityState === 'visible') tick();
		}

		tick();
		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('pageshow', onVisibility);
		return () => {
			clearTimeout(timer);
			clearTimeout(fadeTimer);
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('pageshow', onVisibility);
		};
	});

	// Cloud widths (vw) are clamped to this range so no cloud dominates or vanishes.
	const CLOUD_MIN_W = 9;
	const CLOUD_MAX_W = 28;

	const clampWidth = (w: number) => Math.min(Math.max(w, CLOUD_MIN_W), CLOUD_MAX_W);

	// Larger clouds read as nearer the viewer, so they drift faster. Duration is
	// inversely proportional to width, so the smallest (most distant) clouds nearly
	// hang still while big ones sweep across. Duration (s) = DRIFT_SCALE / width(vw).
	const DRIFT_SCALE = 10800;
	function driftDuration(width: number): number {
		return Math.round(DRIFT_SCALE / width);
	}

	const clouds = [
		{ src: '/clouds/cloud-1.webp', top: 8, w: 12, delay: -284, op: 0.5 },
		{ src: '/clouds/cloud-3.webp', top: 34, w: 28, delay: -65, op: 0.5 },
		{ src: '/clouds/cloud-1.webp', top: 55, w: 9, delay: -790, op: 0.35 },
		{ src: '/clouds/cloud-3.webp', top: 74, w: 15, delay: -398, op: 0.45 }
	].map((c) => {
		const w = clampWidth(c.w);
		return { ...c, w, dur: driftDuration(w) };
	});

	// The whole sky is one glow round the sun's place (paintSky), out to the
	// screen's farthest corner, so its last colour lands there. Painted from the
	// registered properties rather than the colours themselves, so a catch-up
	// eases its colours and its centre along the sun's way.
	const glow = `radial-gradient(ellipse var(--sky-reach) var(--sky-reach) at var(--sky-x) var(--sky-y), ${Array.from(
		{ length: SKY_PALETTE.glow.stops },
		(_, i) => `var(--sky-glow-${i}) ${((i / (SKY_PALETTE.glow.stops - 1)) * 100).toFixed(2)}%`
	).join(', ')})`;

	// As many stars as the sky's area holds ($lib/sky/stars), measured on the
	// client: none on the server, which can't know the screen, and they fade in
	// once counted rather than a guess being drawn and then redrawn.
	let starsWidth = $state(0);
	let starsHeight = $state(0);
	const stars = $derived(STARS.slice(0, starCount(starsWidth, starsHeight)));

	// Track load state for each cloud image to ensure seamless opacity fade-in
	let loadedMap = $state<Record<number, boolean>>({});
	// Clouds already decoded at mount (cached). The fade only smooths the uncached
	// first paint, so cached clouds skip the transition and appear instantly.
	let cachedMap = $state<Record<number, boolean>>({});

	function checkLoad(node: HTMLImageElement, index: number) {
		if (node.complete) {
			cachedMap[index] = true;
			loadedMap[index] = true;
		}
	}
</script>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- static, build-time style; no user input -->
	{@html skyHeadStyle}
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- static, build-time script; no user input -->
	{@html skyHeadScript}
</svelte:head>

<!-- Watercolor paper backdrop, pinned behind everything.

     Every sky layer sits at a NEGATIVE z-index, and that is load-bearing on iOS
     26 Safari. Safari probes the middle of the top and bottom screen edges for a
     fixed or sticky element; when it finds a large one it treats it as page
     chrome and paints an opaque bar in its colour over the status bar and
     behind the toolbar, hiding whatever scrolls beneath
     (`LocalFrameView::fixedContainerEdges`). The probe walks the page in paint
     order and stops at the first hit, and in-flow page content is hit before
     any negative-z layer, so below zero the sky is never reached. Later WebKit
     also exempts a viewport-sized fixed element with a negative z-index outright
     (the `NegativeZIndex` case). At z-0 the cloud layer alone produced both
     bars. Any new viewport-sized fixed element at z ≥ 0 or z-index: auto
     brings them back. -->
<div class="paper pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
	<div class="layer" style:background-image={glow}></div>
	<div class="layer grain"></div>
</div>

<!-- The stars as light added to the sky: drawn over black and screened onto
     the paper, where black adds nothing. Each cloud drifts through it as a
     black cover, in step with the cloud drawn over it, taking out the light of
     every star behind it — which the cloud itself, translucent, could not
     hide. Over the large viewport, as the clouds' `vh` are, so a phone's
     toolbar sliding away neither moves the stars nor changes how many there
     are. Each star's outer element fades with the sky and the inner one
     twinkles, so neither's opacity overrides the other's. Hidden, and the
     twinkling stopped, while the sky has no stars (`sky-starry`, paintSky);
     the covers keep drifting so they stay in step with their clouds.
     Negative z, like the paper: see above. -->
<div
	class="stars pointer-events-none fixed top-0 left-0 -z-8 overflow-hidden"
	aria-hidden="true"
	bind:clientWidth={starsWidth}
	bind:clientHeight={starsHeight}
>
	{#each stars as star, i (i)}
		<div
			class="star"
			class:sparkle={star.sparkle}
			style:left="{star.left}%"
			style:top="{star.top}%"
			style:color={star.tint}
			style:--size="{star.size}px"
			style:--brightness={star.brightness}
		>
			<div
				class="twinkle"
				style:--twinkle="{star.twinkle}s"
				style:--phase="{-star.twinkle * star.phase}s"
			>
				{#if star.sparkle}
					<svg viewBox="-1 -1 2 2"><path d={SPARKLE_PATH} /></svg>
				{/if}
			</div>
		</div>
	{/each}
	{#each clouds as c, i (i)}
		<img
			class="drift cover"
			src={c.src}
			alt=""
			loading="lazy"
			decoding="async"
			style="top: {c.top}vh; width: {c.w}vw; --dur: {c.dur}s; --delay: {c.delay}s"
		/>
	{/each}
</div>

<!-- Cloud layer: above the paper, below page content (negative z: see the
     paper, above). Fades in with the rest of the chrome (.load-fade,
     layout.css). The fade lives on the layer, not the individual clouds: one
     composited group instead of four, and it leaves each cloud's own animation
     shorthand — the endless drift — untouched, so a cloud that decodes late
     never restarts its drift mid-flight. The per-image transition below still
     smooths that late decode. -->
<div
	class="cloud-layer load-fade pointer-events-none fixed inset-0 -z-5 overflow-hidden"
	aria-hidden="true"
>
	{#each clouds as c, i (i)}
		{@const isLoaded = loadedMap[i]}
		<img
			use:checkLoad={i}
			class="drift cloud"
			class:loaded={isLoaded}
			class:instant={cachedMap[i]}
			src={c.src}
			alt=""
			loading="lazy"
			decoding="async"
			onload={() => (loadedMap[i] = true)}
			style="top: {c.top}vh; width: {c.w}vw; --target-op: {c.op}; --dur: {c.dur}s; --delay: {c.delay}s"
		/>
	{/each}
</div>

<style>
	/* A cloud, or its cover among the stars. Both are created in the same frame
	   with the same timing, so each cover keeps exactly to its cloud. */
	.drift {
		position: absolute;
		left: 0;
		height: auto;
		will-change: transform;
		transform: translate3d(-45vw, 0, 0);
		animation: cloud-drift var(--dur, 180s) linear var(--delay, 0s) infinite;
	}

	.cloud {
		opacity: 0;
		will-change: transform, opacity;
		/* Same duration + curve as .load-fade, so a cloud that decodes after the layer
		   fade has already finished still arrives at the pace of everything else. */
		transition: opacity var(--load-fade-duration) var(--load-fade-ease);
	}

	.cloud.loaded {
		opacity: var(--target-op, 0.5);
	}

	/* Cached at mount: no fade, appear at target opacity instantly. */
	.cloud.instant {
		transition: none;
	}

	@keyframes cloud-drift {
		from {
			transform: translate3d(-45vw, 0, 0);
		}
		to {
			transform: translate3d(145vw, 0, 0);
		}
	}

	/* Clouds fade toward night (--sky-clouds). Opacity only: the layer is one
	   composited group, so this never repaints the clouds themselves. */
	.cloud-layer {
		opacity: var(--sky-clouds);
	}

	.layer {
		position: absolute;
		inset: 0;
	}

	/* The sky behind the middle of the screen, under the glow. */
	.paper {
		background-color: var(--sky-1);
	}

	/* pre-rendered static paper noise tile (baked low-opacity noise tile), over
	   the glow */
	.grain {
		background-image: url('/paper-noise.png');
	}

	.stars {
		width: 100%;
		height: 100vh;
		background: #000;
		mix-blend-mode: screen;
	}

	:global(:root:not(.sky-starry)) .stars {
		visibility: hidden;
	}

	/* A cloud's shape in black, at its full alpha rather than the cloud's
	   opacity: a star behind its body is gone, one under its soft edge dimmed. */
	.cover {
		filter: brightness(0);
	}

	/* Centred on its place, and dimmed with the sky. */
	.star {
		position: absolute;
		width: var(--size);
		height: var(--size);
		margin: calc(var(--size) / -2) 0 0 calc(var(--size) / -2);
		opacity: calc(var(--brightness) * var(--sky-stars));
		transition: opacity var(--load-fade-duration) var(--load-fade-ease);
	}

	/* A star counted in after the sky appeared fades in, rather than popping in
	   at its brightness. */
	@starting-style {
		.star {
			opacity: 0;
		}
	}

	/* A dot: a point of light with a soft halo, flickering. */
	.twinkle {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		background: currentColor;
		box-shadow: 0 0 var(--size) color-mix(in srgb, currentColor 60%, transparent);
		animation: twinkle var(--twinkle) ease-in-out var(--phase) infinite;
	}

	/* A sparkle: its rays over a faint glow, flaring and shrinking. */
	.sparkle .twinkle {
		background: radial-gradient(
			circle closest-side,
			color-mix(in srgb, currentColor 40%, transparent),
			transparent
		);
		box-shadow: none;
		animation-name: sparkle;
	}

	.twinkle svg {
		display: block;
		width: 100%;
		height: 100%;
		fill: currentColor;
		filter: drop-shadow(0 0 1px currentColor);
	}

	:global(:root:not(.sky-starry)) .twinkle {
		animation-play-state: paused;
	}

	/* Uneven, as a star's light is through moving air: it dims and recovers by
	   different amounts at different times, never winking out. */
	@keyframes twinkle {
		0%,
		100% {
			opacity: 1;
		}
		18% {
			opacity: 0.5;
		}
		30% {
			opacity: 0.9;
		}
		52% {
			opacity: 0.65;
		}
		70% {
			opacity: 1;
		}
		84% {
			opacity: 0.4;
		}
	}

	/* As it dims, a sparkle's rays draw in and turn a little; as it brightens
	   they flare past their length. */
	@keyframes sparkle {
		0%,
		100% {
			opacity: 1;
			transform: scale(1) rotate(0deg);
		}
		25% {
			opacity: 0.55;
			transform: scale(0.55) rotate(12deg);
		}
		45% {
			opacity: 0.95;
			transform: scale(1.1) rotate(-4deg);
		}
		70% {
			opacity: 0.7;
			transform: scale(0.75) rotate(6deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		/* Paused rather than removed, so each cloud holds the frame its delay put
		   it at — removing the animation would leave every one parked off-screen
		   at the start of its drift — and each cover holds over its cloud. */
		.drift {
			animation-play-state: paused;
		}
		.star {
			transition: none;
		}
		/* Removed rather than paused, so every star holds at full brightness
		   instead of whatever point of its twinkle it was frozen at. */
		.twinkle {
			animation: none;
		}
	}
</style>
