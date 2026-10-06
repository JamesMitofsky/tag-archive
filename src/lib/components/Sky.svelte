<script lang="ts">
	import { onMount } from 'svelte';
	import { DC, frameDistance, paintSky, skyFrame, type SkyFrame } from '$lib/sky/engine';
	import { skyHeadScript } from '$lib/sky/headScript';
	import { SKY_PALETTE } from '$lib/sky/palette';
	import { MAX_STEP_DE, nextRepaintDelay, skyClock } from '$lib/sky/schedule';

	// Ambient sky shared across pages: a watercolor-paper backdrop coloured by the
	// sun over Washington, DC ($lib/sky), plus a few soft cloud WebP images
	// drifting very slowly left→right, forever. Negative delays pre-spread them
	// across the viewport so the sky looks full at load instead of empty until
	// the first cloud wanders in. Sits behind all page content.
	//
	// The colour lives in CSS custom properties on <html> (--sky-0…2, the
	// gradient top to bottom, and --sky-clouds). The inline head script paints
	// the first frame before render; from here on the sky follows the sun live,
	// repainting only as often as the colour perceptibly moves
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
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- static, build-time script; no user input -->
	{@html skyHeadScript}
</svelte:head>

<!-- Watercolor paper backdrop, pinned behind everything.

     Both sky layers sit at a NEGATIVE z-index, and that is load-bearing on iOS
     26 Safari. Safari looks for fixed elements at the top and bottom edges of
     the screen; a viewport-sized one counts as page chrome — Safari then paints
     an opaque bar in its colour over the status bar and the toolbar, hiding
     whatever scrolls beneath — unless its z-index is negative, which is how
     WebKit tells a backdrop from a header (`LocalFrameView::fixedContainerEdges`,
     the `NegativeZIndex` case). At z-0 the cloud layer alone was enough to get
     both bars. -->
<div class="paper pointer-events-none fixed inset-0 -z-10" aria-hidden="true"></div>

<!-- Cloud layer: above the paper, below page content (negative z: see the
     paper, above). Fades in with the rest of
     the chrome (.load-fade, layout.css). The fade lives on the layer, not the
     individual clouds: one composited group instead of four, and it leaves each
     cloud's own animation shorthand — the endless drift — untouched, so a cloud
     that decodes late never restarts its drift mid-flight. The per-image
     transition below still smooths that late decode. -->
<div
	class="cloud-layer load-fade pointer-events-none fixed inset-0 -z-5 overflow-hidden"
	aria-hidden="true"
>
	{#each clouds as c, i (i)}
		{@const isLoaded = loadedMap[i]}
		<img
			use:checkLoad={i}
			class="cloud"
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
	.cloud {
		position: absolute;
		left: 0;
		height: auto;
		opacity: 0;
		will-change: transform, opacity;
		transform: translate3d(-45vw, 0, 0);
		/* Same duration + curve as .load-fade, so a cloud that decodes after the layer
		   fade has already finished still arrives at the pace of everything else. */
		transition: opacity var(--load-fade-duration) var(--load-fade-ease);
		animation: cloud-drift var(--dur, 180s) linear var(--delay, 0s) infinite;
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

	@media (prefers-reduced-motion: reduce) {
		.cloud {
			animation: none;
		}
	}

	/* Clouds fade toward night (--sky-clouds). Opacity only: the layer is one
	   composited group, so this never repaints the clouds themselves. */
	.cloud-layer {
		opacity: var(--sky-clouds);
	}

	/* The stop positions (0 / 60% / 100%) must match the palette's `positions`
	   — the palette spec checks that they still do. */
	.paper {
		background-color: var(--sky-2);
		background-image:
			/* pre-rendered static paper noise tile (baked low-opacity noise tile) */
			url('/paper-noise.png'),
			linear-gradient(to bottom, var(--sky-0), var(--sky-1) 60%, var(--sky-2));
		background-repeat: repeat, no-repeat;
	}
</style>
