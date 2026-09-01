<script lang="ts">
	import type { ArtefactWithEvent } from '$lib/server/db/schema';
	import { programAreaMeta } from '$lib/programAreas';
	import { formatDate } from '$lib/formatDate';
	import { loadArtefacts } from '$lib/dataset';
	import { filterArtefacts } from '$lib/search';
	import { isImageUrl } from '$lib/fileType';
	import CardCloud from '$lib/components/CardCloud.svelte';
	import CardSheet from '$lib/components/CardSheet.svelte';
	import ArtefactFilePreview from '$lib/components/ArtefactFilePreview.svelte';
	import ArtefactPdfLink from '$lib/components/ArtefactPdfLink.svelte';
	import Drawing from '$lib/components/Drawing.svelte';

	// The opened card shows only the first scan; a multi-scan artefact is worth
	// carrying away as one document, so it gets a PDF download. A single image
	// doesn't — that is just the picture on screen.
	const imageCount = (item: ArtefactWithEvent) => item.fileUrls.filter(isImageUrl).length;
</script>

<CardCloud load={loadArtefacts} filter={filterArtefacts} card={page} {placeholderMark} />

{#snippet placeholderMark()}
	<Drawing
		src="/drawing/text/artefacts.webp"
		alt=""
		aria-hidden="true"
		width="516"
		height="207"
		class="h-7 w-auto"
	/>
{/snippet}

{#snippet page(item: ArtefactWithEvent, isOpen: boolean)}
	<!-- Declared here rather than inside <CardSheet>, where Svelte would also hand
	     it over as an implicit prop; it is only wanted through `actions`, and only
	     on the opened page (the closed card is a button — no nested links). -->
	{#snippet pdfAction()}
		<ArtefactPdfLink
			artefactId={item.id}
			artefactName={item.artefact}
			imageCount={imageCount(item)}
			label
			class="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-200 hover:text-gray-900"
		/>
	{/snippet}
	<CardSheet
		title={item.artefact}
		meta={[item.event, item.date && formatDate(item.date)]}
		description={item.description}
		lines={3}
		tags={[
			...item.programArea.map((tag) => {
				const meta = programAreaMeta(tag);
				return { label: tag, class: meta.pill, icon: meta.icon };
			}),
			...item.provenance.map((person) => ({ label: person }))
		]}
		actions={isOpen && imageCount(item) > 1 ? pdfAction : undefined}
	>
		{#snippet media()}
			{#if item.fileUrls && item.fileUrls.length > 0}
				<ArtefactFilePreview
					fileUrls={item.fileUrls}
					artefactName={item.artefact}
					sizes={isOpen ? '(max-width: 640px) 90vw, 576px' : '192px'}
				/>
			{/if}
		{/snippet}
	</CardSheet>
{/snippet}
