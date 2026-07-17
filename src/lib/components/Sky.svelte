<script lang="ts">
	// Ambient sky shared across pages: watercolor-paper blue backdrop plus a few
	// soft cloud PNGs drifting very slowly left→right, forever. Negative delays
	// pre-spread them across the viewport so the sky looks full at load instead
	// of empty until the first cloud wanders in. Sits behind all page content.
	// Widths vary and run generally smaller; smaller clouds drift slower (longer
	// dur), with a wide slow↔fast gap. All durations slow overall.
	const clouds = [
		{ src: '/clouds/cloud-1.png', top: 8, w: 20, dur: 300, delay: -20, op: 0.5 },
		{ src: '/clouds/cloud-2.png', top: 21, w: 13, dur: 420, delay: -95, op: 0.4 },
		{ src: '/clouds/cloud-3.png', top: 34, w: 26, dur: 240, delay: -70, op: 0.5 },
		{ src: '/clouds/cloud-1.png', top: 55, w: 11, dur: 470, delay: -150, op: 0.35 },
		{ src: '/clouds/cloud-2.png', top: 63, w: 23, dur: 270, delay: -120, op: 0.45 },
		{ src: '/clouds/cloud-3.png', top: 74, w: 16, dur: 370, delay: -50, op: 0.45 }
	];
</script>

<!-- Watercolor paper backdrop, pinned behind everything. -->
<div class="paper pointer-events-none fixed inset-0 -z-10" aria-hidden="true"></div>

<!-- Cloud layer: above the paper, below page content. -->
<div class="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
	{#each clouds as c, i (i)}
		<img
			class="cloud"
			src={c.src}
			alt=""
			style="top: {c.top}vh; width: {c.w}vw; opacity: {c.op}; --dur: {c.dur}s; --delay: {c.delay}s"
		/>
	{/each}
</div>

<style>
	.cloud {
		position: absolute;
		left: 0;
		height: auto;
		will-change: transform;
		animation: cloud-drift var(--dur, 180s) linear var(--delay, 0s) infinite;
	}

	@keyframes cloud-drift {
		from {
			transform: translateX(-45vw);
		}
		to {
			transform: translateX(145vw);
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
			/* cloud mottle — soft uneven pigment/fiber density (light + dark blotches) */
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='700' height='700'%3E%3Cfilter id='c'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.012' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='linear' slope='0.7' intercept='-0.2'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='700' height='700' filter='url(%23c)' opacity='0.22'/%3E%3C/svg%3E"),
			/* tooth — cold-press speckle grain (white) */
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='260' height='260'%3E%3Cfilter id='t'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.16' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1 0 0 0 0'/%3E%3C/filter%3E%3Crect width='260' height='260' filter='url(%23t)' opacity='0.1'/%3E%3C/svg%3E"),
			/* fine fiber grain (white) */
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1 0 0 0 0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23f)' opacity='0.08'/%3E%3C/svg%3E");
	}
</style>
