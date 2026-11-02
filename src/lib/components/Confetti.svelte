<!--
	A handful of watercolor petals thrown into the air, painted in the washes of
	the six program areas ($lib/programAreas) so a celebration is drawn from the
	same paint box as the rest of the archive.

	It fills its nearest positioned ancestor, clipped to it so nothing it throws
	can widen or lengthen the page, and bursts from (x, y) in that ancestor's
	coordinates. Mount it when the moment comes and unmount it after `duration`.
	Purely decorative: hidden from assistive tech, never in the way of a click,
	and not shown at all under reduced motion.
-->
<script lang="ts">
	import { confetti } from '@neoconfetti/svelte';
	import { PROGRAM_AREAS, PROGRAM_AREA_META } from '$lib/programAreas';

	let {
		x,
		y,
		duration = 3200,
		count = 96
	}: { x: number; y: number; duration?: number; count?: number } = $props();

	const COLORS = PROGRAM_AREAS.map((area) => PROGRAM_AREA_META[area].wash);
	const PETAL_PX = 16;
	// The whole burst fades over its last stretch, so a petal still in view
	// when the library clears them dissolves instead of blinking out.
	const FADE_MS = 700;

	let stage = $state<{ width: number; height: number }>();

	// Size the throw to the screen it lands on: wide enough to scatter across a
	// phone (the library's default stage is 1600px, which flings most of the
	// petals straight off one), and deep enough that every petal falls out past
	// the bottom of the screen rather than coming to rest in view.
	function measure(overlay: HTMLElement) {
		const box = overlay.getBoundingClientRect();
		const fall = window.innerHeight - (box.top + y);
		stage = {
			width: Math.min(box.width * 1.2, 1200),
			height: Math.max(fall, 240) + PETAL_PX * 4
		};
	}
</script>

<div
	class="overlay"
	use:measure
	aria-hidden="true"
	style:--fade-ms="{FADE_MS}ms"
	style:--fade-delay="{duration - FADE_MS}ms"
>
	{#if stage}
		<div class="origin" style:left="{x}px" style:top="{y}px">
			<div
				use:confetti={{
					colors: COLORS,
					duration,
					particleCount: count,
					particleSize: PETAL_PX,
					particleClass: 'petal',
					force: 0.6,
					stageWidth: stage.width,
					stageHeight: stage.height
				}}
			></div>
		</div>
	{/if}
</div>

<style>
	.overlay {
		position: absolute;
		inset: 0;
		z-index: 20;
		overflow: clip;
		pointer-events: none;
		animation: fade-out var(--fade-ms) ease-in var(--fade-delay) forwards;
	}

	@keyframes fade-out {
		to {
			opacity: 0;
		}
	}

	/* A wrapper, because the library sets `position: relative` on the element it
	   is given. */
	.origin {
		position: absolute;
	}

	/* Each particle is three boxes deep (@neoconfetti/core): the outer one drifts
	   sideways, its child falls, and the child's ::before is the painted shape,
	   which tumbles. The `.overlay` prefix outranks the library's own rule for
	   that shape, whose stylesheet it appends to <head> after ours. */

	/* Thin paint, so overlapping petals layer like washes and the sky shows
	   through. */
	.overlay :global(.petal) {
		opacity: 0.85;
	}

	.overlay :global(.petal > div::before) {
		/* Two opposite corners fully rounded: a petal on the library's square
		   particles, a slender leaf on its narrow ones. */
		border-radius: 100% 0;
		/* Watercolor pigment pools at the edge of a stroke as it dries, so each
		   shape is paler in the middle than at its rim. */
		background-image: radial-gradient(
			closest-side,
			color-mix(in oklab, var(--bgc), white 22%),
			var(--bgc) 75%,
			color-mix(in oklab, var(--bgc), black 8%)
		);
		/* Tumble at a third of the library's speed: paper confetti spins, petals
		   drift. */
		animation-duration: calc(var(--rd) * 3);
	}

	/* Every third one is a dab of paint instead: a round blot, a little uneven. */
	.overlay :global(.petal:nth-child(3n) > div::before) {
		border-radius: 55% 45% 50% 50% / 50% 55% 45% 50%;
	}

	@media (prefers-reduced-motion: reduce) {
		.overlay {
			display: none;
		}
	}
</style>
