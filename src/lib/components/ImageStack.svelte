<!--
	A set of photographs as a small pile of prints: the first photograph on top,
	and up to two more of the set's own photographs tucked underneath it, turned
	a few degrees either way, so a set reads as more than one picture before it
	is opened. A set of one is just the print, with no pile.

	Purely a picture: it takes no pointer input of its own, so whatever it sits
	in (a card's button) stays the single click target. The prints under the
	top one are decorative; the top one carries the set's name as its alt text.

	Fills its parent, and fits each print inside it on both axes.
-->
<script lang="ts">
	import type { PublicImage } from '$lib/images/types';
	import Photograph from '$lib/components/Photograph.svelte';

	type StackImage = Pick<PublicImage, 'id' | 'url' | 'width' | 'height'>;

	interface Props {
		/** In display order; the first is the print on top. */
		images: StackImage[];
		/** The top print's alt text: what the set is. */
		alt: string;
		/** Display width of the top print, for its srcset. */
		sizes?: string;
	}

	let { images, alt, sizes = '192px' }: Props = $props();

	/**
	 * How each print under the top one lies, nearest the top first. Turned in
	 * opposite directions so their corners show on both sides, and a little
	 * smaller and off-centre so they peek out from behind even when every
	 * photograph has the same shape. Literal class strings, so Tailwind sees them.
	 */
	const POSES = [
		'-rotate-6 scale-[0.94] -translate-x-[3%] translate-y-[1.5%]',
		'rotate-5 scale-[0.9] translate-x-[4%] -translate-y-[2%]'
	];

	const top = $derived(images[0]);
	/** Drawn deepest first, so the DOM order is the paint order. */
	const under = $derived(
		images
			.slice(1, 1 + POSES.length)
			.map((image, i) => ({ image, pose: POSES[i] }))
			.reverse()
	);

	/**
	 * Fits a print inside the container on both axes, the way `object-contain`
	 * would, but on the print's own box so its shadow hugs the photograph. Every
	 * print shares the one grid cell, centred, so they pile on each other.
	 */
	const PRINT = 'col-start-1 row-start-1 w-[min(100cqw,100cqh*var(--photo-ratio))]';
</script>

<!-- The pile is inset from the card's edges so the turned prints' corners stay
     inside it; a lone print needs only room for its shadow. Padding lives on
     this outer box, not the container, because `cq` units measure the
     container's content box and padding there would shrink the unit itself. -->
<div class={['pointer-events-none h-full w-full', under.length ? 'p-[9%]' : 'p-[4%]']}>
	<div class="[container-type:size] grid h-full w-full place-items-center">
		{#each under as { image, pose } (image.id)}
			<!-- Mostly hidden under the top print, so it asks for a smaller raster. -->
			<Photograph
				src={image.url}
				width={image.width}
				height={image.height}
				alt=""
				aria-hidden="true"
				sizes="128px"
				class="{PRINT} {pose} rounded-[2px] shadow-md"
			/>
		{/each}
		{#if top}
			<Photograph
				src={top.url}
				width={top.width}
				height={top.height}
				{alt}
				{sizes}
				class="{PRINT} rounded-[2px] shadow-lg"
			/>
		{/if}
	</div>
</div>
