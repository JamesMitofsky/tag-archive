<!--
	A shower of watercolor petals falling from the top of the screen, painted in
	the washes of the six program areas ($lib/programAreas) so a celebration is
	drawn from the same paint box as the rest of the archive.

	It covers the viewport, clipped to it so nothing it drops can widen or
	lengthen the page. Mount it when the moment comes and unmount it after
	`duration`, by which time every petal has fallen out past the bottom.
	Purely decorative: hidden from assistive tech, never in the way of a click,
	and not shown at all under reduced motion.
-->
<script lang="ts">
	import { PROGRAM_AREAS, PROGRAM_AREA_META } from '$lib/programAreas';

	let { duration = 4000 }: { duration?: number } = $props();

	const COLORS = PROGRAM_AREAS.map((area) => PROGRAM_AREA_META[area].wash);

	interface Petal {
		left: number; // % of the screen's width
		width: number; // px
		height: number; // px
		shape: 'petal' | 'leaf' | 'dab';
		color: string;
		delay: number; // ms before it starts to fall
		fall: number; // ms from above the top to below the bottom
		sway: number; // px either side of its line
		swayFor: number; // ms per swing
		swayAt: number; // ms into its swing at the start (a negative delay)
		axis: string; // `rotate` axis it tumbles around
		tumbleFor: number; // ms per turn, negative to turn the other way
		tumbleAt: number; // ms into its turn at the start (a negative delay)
	}

	let petals = $state<Petal[]>([]);

	const between = (min: number, max: number) => min + Math.random() * (max - min);

	// Petals are made on the client, once the screen can be measured: roughly
	// one per 5px of width, so a phone gets a light shower and a desktop the
	// same density rather than the same handful spread thin.
	function scatter(overlay: HTMLElement) {
		const count = Math.round(Math.min(160, Math.max(60, overlay.clientWidth / 5)));
		petals = Array.from({ length: count }, (_, i) => {
			const size = between(12, 18);
			const shape = (['petal', 'leaf', 'dab'] as const)[i % 3];
			const fall = between(0.45, 0.65) * duration;
			const swayFor = between(900, 1700);
			const tumbleFor = between(1400, 3000);
			return {
				left: between(-2, 102),
				width: shape === 'leaf' ? size * 0.45 : shape === 'dab' ? size * 0.8 : size,
				height: shape === 'leaf' ? size * 1.1 : shape === 'dab' ? size * 0.8 : size * 0.75,
				shape,
				color: COLORS[i % COLORS.length],
				// Squaring the random number bunches the starts toward the beginning,
				// so the shower arrives at once and thins out, and every petal is
				// gone by `duration`.
				delay: Math.random() ** 2 * (duration - fall),
				fall,
				sway: between(8, 28),
				swayFor,
				swayAt: -Math.random() * swayFor,
				axis: `${between(-1, 1).toFixed(2)} ${between(-1, 1).toFixed(2)} ${between(0.4, 1).toFixed(2)}`,
				tumbleFor: tumbleFor * (Math.random() < 0.5 ? -1 : 1),
				tumbleAt: -Math.random() * tumbleFor
			};
		});
	}
</script>

<div class="overlay" use:scatter aria-hidden="true">
	{#each petals as p, i (i)}
		<!-- Three boxes per petal, one motion each: falling, swaying, tumbling. -->
		<span
			class="fall"
			style:left="{p.left}%"
			style:--delay="{p.delay}ms"
			style:--fall-for="{p.fall}ms"
		>
			<span
				class="sway"
				style:--sway="{p.sway}px"
				style:--sway-for="{p.swayFor}ms"
				style:--sway-at="{p.swayAt}ms"
			>
				<span
					class="paint {p.shape}"
					style:width="{p.width}px"
					style:height="{p.height}px"
					style:--color={p.color}
					style:--axis={p.axis}
					style:--tumble-for="{Math.abs(p.tumbleFor)}ms"
					style:--tumble-at="{p.tumbleAt}ms"
					style:animation-direction={p.tumbleFor < 0 ? 'reverse' : 'normal'}
				></span>
			</span>
		</span>
	{/each}
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 20;
		overflow: clip;
		pointer-events: none;
		/* So a petal can fall exactly the overlay's height (cqh), whatever the
		   screen. */
		container-type: size;
	}

	.fall {
		position: absolute;
		top: 0;
		animation: fall var(--fall-for) cubic-bezier(0.3, 0, 0.7, 1) var(--delay) both;
	}

	/* From just above the top edge to just below the bottom one. */
	@keyframes fall {
		from {
			translate: 0 -2rem;
		}
		to {
			translate: 0 calc(100cqh + 2rem);
		}
	}

	.sway {
		display: block;
		/* The negative delays start each petal partway through its swing and its
		   turn, so no two move in step. */
		animation: sway var(--sway-for) var(--ease-in-out-sine) var(--sway-at) infinite alternate;
	}

	@keyframes sway {
		from {
			translate: calc(var(--sway) * -1) 0;
		}
		to {
			translate: var(--sway) 0;
		}
	}

	.paint {
		display: block;
		/* Thin paint, so overlapping petals layer like washes and the sky shows
		   through. */
		opacity: 0.85;
		/* Watercolor pigment pools at the edge of a stroke as it dries, so each
		   shape is paler in the middle than at its rim. */
		background: radial-gradient(
			closest-side,
			color-mix(in oklab, var(--color), white 22%),
			var(--color) 75%,
			color-mix(in oklab, var(--color), black 8%)
		);
		animation: tumble var(--tumble-for) linear var(--tumble-at) infinite;
	}

	@keyframes tumble {
		from {
			rotate: var(--axis) 0deg;
		}
		to {
			rotate: var(--axis) 360deg;
		}
	}

	/* Two opposite corners fully rounded: a petal on the wider shapes, a slender
	   leaf on the narrow ones. */
	.petal,
	.leaf {
		border-radius: 100% 0;
	}

	/* A dab of paint: a round blot, a little uneven. */
	.dab {
		border-radius: 55% 45% 50% 50% / 50% 55% 45% 50%;
	}

	@media (prefers-reduced-motion: reduce) {
		.overlay {
			display: none;
		}
	}
</style>
