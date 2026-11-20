<script lang="ts">
	import type { ArtefactWithEvent } from '#lib/server/db/schema.ts';
	import { loadArtefacts } from '#lib/dataset.ts';
	import { filterArtefacts } from '#lib/search.ts';
	import CardCloud from '#lib/components/CardCloud.svelte';
	import ArtefactCard from '#lib/components/ArtefactCard.svelte';
	import Drawing from '#lib/components/Drawing.svelte';
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
	<ArtefactCard {item} {isOpen} />
{/snippet}
