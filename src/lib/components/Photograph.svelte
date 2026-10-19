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
	import OptimizedImage from '$lib/components/OptimizedImage.svelte';
	import Skeleton from '$lib/components/ui/skeleton/skeleton.svelte';
	import { cn } from '$lib/utils';

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
			'absolute inset-0 h-full w-full object-cover transition-opacity duration-300 motion-reduce:transition-none',
			loaded ? 'opacity-100' : 'opacity-0'
		)}
		onload={() => (settledSrc = src)}
		onerror={() => (settledSrc = src)}
	/>
</div>
