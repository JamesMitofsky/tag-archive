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
	<!-- h-8, a step taller than the others: the tall capital leaves the lowercase
	     a smaller share of the drawing, and h-8 brings it level with theirs. -->
	<Drawing
		src="/drawing/text/images.webp"
		alt=""
		aria-hidden="true"
		width="429"
		height="226"
		class="h-8 w-auto"
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
