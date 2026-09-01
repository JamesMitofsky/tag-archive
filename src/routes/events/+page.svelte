<script lang="ts">
	import type { EventItem } from '$lib/events';
	import { formatDate } from '$lib/formatDate';
	import { loadEvents } from '$lib/dataset';
	import { filterEvents } from '$lib/search';
	import CardCloud from '$lib/components/CardCloud.svelte';
	import CardSheet from '$lib/components/CardSheet.svelte';
	import Drawing from '$lib/components/Drawing.svelte';
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

{#snippet page(item: EventItem)}
	<CardSheet
		title={item.title}
		meta={[item.date && `${formatDate(item.date)}${item.time ? ` · ${item.time}` : ''}`]}
		description={item.description}
		lines={5}
		tags={item.hosts.map((host) => ({ label: host }))}
	/>
{/snippet}
