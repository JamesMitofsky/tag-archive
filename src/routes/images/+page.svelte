<script lang="ts">
	import type { PublicImageSet } from '$lib/images/types';
	import { imageSetLabel } from '$lib/images/label';
	import { formatDate } from '$lib/formatDate';
	import { loadImageSets } from '$lib/dataset';
	import { filterImageSets } from '$lib/search';
	import CardCloud from '$lib/components/CardCloud.svelte';
	import CardSheet from '$lib/components/CardSheet.svelte';
	import ArtefactFilePreview from '$lib/components/ArtefactFilePreview.svelte';
	import Drawing from '$lib/components/Drawing.svelte';

	/**
	 * A set has no title of its own: its label borrows the event, else the first
	 * line of the description, else the photograph count (see imageSetLabel). So
	 * the sheet never prints the borrowed words a second time under the title.
	 */
	function sheet(item: PublicImageSet) {
		const title = imageSetLabel(item);
		return {
			title,
			meta: [
				item.event?.trim(),
				item.date && formatDate(item.date),
				imageSetLabel({ count: item.images.length })
			].filter((line) => line !== title),
			description: withoutTitleLine(item.description, title)
		};
	}

	/**
	 * The description less its first line when that line is the title. A first
	 * line too long for a title is shortened there, so it no longer matches and
	 * the description keeps it, in full.
	 */
	function withoutTitleLine(description: string | null, title: string): string | null {
		if (!description) return null;
		const lines = description.split(/\r?\n/);
		const first = lines.findIndex((line) => line.trim());
		// Blank throughout: nothing to print, rather than an empty paragraph.
		if (first === -1) return null;
		if (lines[first].trim() !== title) return description;
		return (
			lines
				.slice(first + 1)
				.join('\n')
				.trim() || null
		);
	}
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

{#snippet page(item: PublicImageSet, isOpen: boolean)}
	{@const { title, meta, description } = sheet(item)}
	<CardSheet {title} {meta} {description} lines={3}>
		{#snippet media()}
			{#if item.images.length > 0}
				<ArtefactFilePreview
					fileUrls={item.images.map((image) => image.url)}
					artefactName={title}
					sizes={isOpen ? '(max-width: 640px) 90vw, 576px' : '192px'}
				/>
			{/if}
		{/snippet}
	</CardSheet>
{/snippet}
