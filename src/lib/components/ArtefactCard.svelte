<!--
	One artefact as a card of the cloud, closed or open: what `/` and a
	listener's page (`/listening`) both draw for each artefact they hold.
-->
<script lang="ts" module>
	import type { ArtefactWithEvent } from '#lib/server/db/schema.ts';

	/** The fields a card draws. */
	export type ArtefactCardItem = Pick<
		ArtefactWithEvent,
		'id' | 'artefact' | 'event' | 'date' | 'description' | 'programArea' | 'provenance' | 'fileUrls'
	>;
</script>

<script lang="ts">
	import { programAreaMeta } from '#lib/programAreas.ts';
	import { formatDate } from '#lib/formatDate.ts';
	import CardSheet from '#lib/components/CardSheet.svelte';
	import ArtefactFilePreview from '#lib/components/ArtefactFilePreview.svelte';

	let { item, isOpen }: { item: ArtefactCardItem; isOpen: boolean } = $props();
</script>

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
