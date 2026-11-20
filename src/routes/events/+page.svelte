<script lang="ts">
	import type { EventItem } from '#lib/events.ts';
	import { formatDate } from '#lib/formatDate.ts';
	import { loadEvents } from '#lib/dataset.ts';
	import { filterEvents } from '#lib/search.ts';
	import CardCloud from '#lib/components/CardCloud.svelte';
	import CardSheet from '#lib/components/CardSheet.svelte';
	import Drawing from '#lib/components/Drawing.svelte';
	import OptimizedImage from '#lib/components/OptimizedImage.svelte';
</script>

<CardCloud
	load={loadEvents}
	filter={filterEvents}
	ariaLabel="Search events"
	card={page}
	{placeholderMark}
/>

{#snippet placeholderMark()}
	<Drawing
		src="/drawing/text/events.webp"
		alt=""
		aria-hidden="true"
		width="250"
		height="98"
		class="h-5 w-auto"
	/>
{/snippet}

{#snippet page(item: EventItem, isOpen: boolean)}
	{@const feature = item.featureImage}
	<CardSheet
		title={item.title}
		meta={[item.date && `${formatDate(item.date)}${item.time ? ` · ${item.time}` : ''}`]}
		description={item.description}
		lines={feature ? 3 : 5}
		tags={item.hosts.map((host) => ({ label: host }))}
	>
		{#snippet media()}
			{#if feature}
				<!-- Sized like an artefact's first page (ArtefactFilePreview), so both clouds read alike. -->
				<div class="relative my-2 flex min-h-0 flex-1 items-center justify-center overflow-hidden">
					<OptimizedImage
						src={feature.url}
						alt={item.title}
						width={feature.width ?? undefined}
						height={feature.height ?? undefined}
						sizes={isOpen ? '(max-width: 640px) 90vw, 576px' : '192px'}
						class="h-full w-full rounded-sm object-contain"
					/>
				</div>
			{/if}
		{/snippet}
	</CardSheet>
{/snippet}
