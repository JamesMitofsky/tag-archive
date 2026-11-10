<!--
	Every photograph in a set, one under another at the full width of its box,
	with a light caption above them naming the set. No sheet behind it: the
	photographs float on whatever the box sits over (the card cloud's dimmed
	backdrop), so the caption is white with a soft shadow to read on any sky.

	Fills its parent and scrolls inside it. `overscroll-contain` keeps a scroll
	that reaches either end from carrying on into the page behind. A set short
	enough to fit is centred in the box instead of hanging from its top.

	Sizes are relative to the box, never fixed, because the card cloud lays the
	opened card out at every size between the closed card and the open one while
	it grows.
-->
<script lang="ts">
	import type { PublicImage } from '$lib/images/types';
	import { withoutTitleLine } from '$lib/images/label';
	import Photograph from '$lib/components/Photograph.svelte';

	type GalleryImage = Pick<PublicImage, 'id' | 'url' | 'width' | 'height'>;

	interface Props {
		/** In display order. */
		images: GalleryImage[];
		/** What the set is (see imageSetLabel): the caption, and each photograph's alt text. */
		label: string;
		description?: string | null;
		/** Display width of each photograph, for its srcset. */
		sizes?: string;
	}

	let {
		images,
		label,
		description = null,
		sizes = '(max-width: 640px) 90vw, 576px'
	}: Props = $props();

	/** The description, less a first line the label already shows. */
	const caption = $derived(withoutTitleLine(description, label));

	function altText(index: number): string {
		return images.length === 1 ? label : `${label}, photograph ${index + 1} of ${images.length}`;
	}
</script>

<div class="h-full w-full [scrollbar-width:thin] overflow-y-auto overscroll-contain">
	<!-- Inset on every side so the photographs' shadows aren't cut off: a scroll
	     container clips both axes, not only the one it scrolls. -->
	<figure class="flex min-h-full flex-col justify-center gap-3 px-[3%] py-4">
		<figcaption class="text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.5)]">
			<p class="text-sm leading-snug font-medium">{label}</p>
			{#if caption}
				<p class="mt-1 text-xs leading-relaxed whitespace-pre-line text-white/85">{caption}</p>
			{/if}
		</figcaption>
		{#each images as image, i (image.id)}
			<!-- The first two are on screen the moment the set opens; the rest wait
			     until they are scrolled near. -->
			<Photograph
				src={image.url}
				width={image.width}
				height={image.height}
				alt={altText(i)}
				{sizes}
				loading={i < 2 ? 'eager' : 'lazy'}
				class="w-full shrink-0 rounded-[2px] shadow-lg"
			/>
		{/each}
	</figure>
</div>
