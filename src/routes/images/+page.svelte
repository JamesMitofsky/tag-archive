<script lang="ts">
	import type { PublicImageSet } from '$lib/images/types';
	import { imageSetLabel } from '$lib/images/label';
	import { loadImageSets } from '$lib/dataset';
	import { filterImageSets } from '$lib/search';
	import CardCloud from '$lib/components/CardCloud.svelte';
	import ImageStack from '$lib/components/ImageStack.svelte';
	import ImageSetGallery from '$lib/components/ImageSetGallery.svelte';
	import Drawing from '$lib/components/Drawing.svelte';
</script>

<CardCloud
	load={loadImageSets}
	filter={filterImageSets}
	ariaLabel="Search images"
	card={page}
	{placeholderMark}
/>

{#snippet placeholderMark()}
	<!-- The art isn't drawn yet; until it is, its word stands in for it. -->
	<Drawing
		src="/drawing/text/images.webp"
		text="Images"
		alt=""
		aria-hidden="true"
		class="h-6 w-auto"
		textClass="text-base"
	/>
{/snippet}

<!-- No sheet of paper here, unlike the other clouds: a set is its photographs.
     Closed, it floats as a pile of prints; opened, it shows every photograph. -->
{#snippet page(item: PublicImageSet, isOpen: boolean)}
	{@const label = imageSetLabel(item)}
	{#if isOpen}
		<ImageSetGallery images={item.images} {label} description={item.description} />
	{:else}
		<ImageStack images={item.images} alt={label} />
	{/if}
{/snippet}
