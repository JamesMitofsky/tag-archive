<script lang="ts">
	import type { ArtefactWithEvent } from '$lib/server/db/schema';
	import { programAreaMeta } from '$lib/programAreas';
	import { formatDate } from '$lib/formatDate';
	import { loadArtefacts } from '$lib/dataset';
	import { filterArtefacts } from '$lib/search';
	import CardCloud from '$lib/components/CardCloud.svelte';
	import CardSheet from '$lib/components/CardSheet.svelte';
	import ArtefactFilePreview from '$lib/components/ArtefactFilePreview.svelte';
	import Drawing from '$lib/components/Drawing.svelte';
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
