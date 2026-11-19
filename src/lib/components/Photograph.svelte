<!--
	One photograph as a print: a box with the photograph's own aspect ratio, so the
	box IS the picture. A shadow or rounded corner the caller adds then hugs the
	photograph rather than the empty margin an `object-contain` box would leave,
	and the loading skeleton is already the photograph's shape, so nothing
	changes size when the pixels arrive.

	The caller decides how big the print is, through `class`. Giving it a width is
	enough: the height follows from the ratio. To fit a print inside a box on both
	axes, make that box a size container and use the `--photo-ratio` this
	component exposes, e.g. `w-[min(100cqw,100cqh*var(--photo-ratio))]`.
-->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import OptimizedImage from '#lib/components/OptimizedImage.svelte';
	import Skeleton from '#lib/components/ui/skeleton/skeleton.svelte';
	import { cn } from '#lib/utils.ts';

	interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
		src: string;
		alt: string;
		/** The photograph's intrinsic size; only the ratio between them is used. */
		width: number;
		height: number;
		/** The width the print is displayed at, for the srcset (see OptimizedImage). */
		sizes: string;
		loading?: 'lazy' | 'eager';
		class?: string;
	}

	let {
		src,
		alt,
		width,
		height,
		sizes,
		loading = 'lazy',
		class: className,
		...rest
	}: Props = $props();

	/**
	 * Which source has finished loading, rather than a plain flag: should `src`
	 * ever change under the same instance, the new one starts hidden behind the
	 * skeleton again instead of inheriting the old one's "loaded".
	 */
	let settledSrc = $state<string | null>(null);
	const loaded = $derived(settledSrc === src);

	/**
	 * A print whose pixels are already to hand shows at once, with no skeleton
	 * and no fade. The fade is for a photograph arriving over the network; one
	 * the page is already showing elsewhere (an image set's pile, say, whose
	 * prints are about to spill out as cards of their own) would otherwise blink
	 * out and fade back in, which reads as a different picture taking its place.
	 *
	 * Taking the transition off in the same change as the opacity is what makes
	 * that hold. Clearing the skeleton early is not enough on its own: anything
	 * in the same update that reads layout (a neighbor's exit animation does)
	 * has the browser settle the print at opacity 0 first, and the change to 1
	 * after it would then fade like any other.
	 */
	let readySrc = $state<string | null>(null);
	function settleIfReady(img: HTMLImageElement) {
		if (!img.complete || img.naturalWidth === 0) return;
		readySrc = src;
		settledSrc = src;
	}
</script>

<div
	class={cn('relative overflow-hidden', className)}
	style:--photo-ratio={width / height}
	style:aspect-ratio="{width} / {height}"
	{...rest}
>
	{#if !loaded}
		<Skeleton class="absolute inset-0 rounded-none bg-gray-200" />
	{/if}
	<OptimizedImage
		{src}
		{alt}
		{sizes}
		{loading}
		class={cn(
			'absolute inset-0 h-full w-full object-cover',
			readySrc !== src && 'transition-opacity duration-300 motion-reduce:transition-none',
			loaded ? 'opacity-100' : 'opacity-0'
		)}
		onload={() => (settledSrc = src)}
		onerror={() => (settledSrc = src)}
		{@attach settleIfReady}
	/>
</div>
