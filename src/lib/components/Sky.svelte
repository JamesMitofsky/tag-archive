<script lang="ts">
	// Ambient sky shared across pages: watercolor-paper blue backdrop plus a few
	// soft cloud WebP images drifting very slowly left→right, forever. Negative delays
	// pre-spread them across the viewport so the sky looks full at load instead
	// of empty until the first cloud wanders in. Sits behind all page content.
	// Loaded state tracks image decode completion per cloud for smooth CSS fade-in.
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

<!-- Watercolor paper backdrop, pinned behind everything. -->
<div class="paper pointer-events-none fixed inset-0 -z-10" aria-hidden="true"></div>

<!-- Cloud layer: above the paper, below page content. -->
<div class="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
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
		transition: opacity 100ms ease-in-out;
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

	.paper {
		background-color: #94cae7;
		background-image:
			/* pre-rendered static paper noise tile (baked low-opacity noise tile) */ url('/paper-noise.png');
		background-repeat: repeat;
	}
</style>
