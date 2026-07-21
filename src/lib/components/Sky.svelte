<script lang="ts">
	// Ambient sky shared across pages: watercolor-paper blue backdrop plus a few
	// soft cloud WebP images drifting very slowly left→right, forever. Negative delays
	// pre-spread them across the viewport so the sky looks full at load instead
	// of empty until the first cloud wanders in. Sits behind all page content.
	// Loaded state tracks image decode completion per cloud for smooth CSS fade-in.
	const clouds = [
		{ src: '/clouds/cloud-1.webp', top: 8, w: 20, dur: 300, delay: -20, op: 0.5 },
		{ src: '/clouds/cloud-2.webp', top: 21, w: 13, dur: 420, delay: -95, op: 0.4 },
		{ src: '/clouds/cloud-3.webp', top: 34, w: 26, dur: 240, delay: -70, op: 0.5 },
		{ src: '/clouds/cloud-1.webp', top: 55, w: 11, dur: 470, delay: -150, op: 0.35 },
		{ src: '/clouds/cloud-2.webp', top: 63, w: 23, dur: 270, delay: -120, op: 0.45 },
		{ src: '/clouds/cloud-3.webp', top: 74, w: 16, dur: 370, delay: -50, op: 0.45 }
	];

	// Track load state for each cloud image to ensure seamless opacity fade-in
	let loadedMap = $state<Record<number, boolean>>({});

	function checkLoad(node: HTMLImageElement, index: number) {
		if (node.complete) {
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
		background-color: #8ecbe6;
		background-image:
			/* cloud mottle — soft gradient overlay for watercolor pigment variations */
			radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.25), transparent 60%),
			radial-gradient(circle at 80% 70%, rgba(120, 180, 210, 0.3), transparent 65%),
			/* pre-rendered static paper noise tile (baked low-opacity noise tile) */
			url('/paper-noise.png');
		background-repeat: repeat;
	}
</style>
