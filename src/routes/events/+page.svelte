<script lang="ts">
	import type { EventItem } from '$lib/events';
	import { formatDate } from '$lib/formatDate';
	import CardCloud from '$lib/components/CardCloud.svelte';
	import Drawing from '$lib/components/Drawing.svelte';
</script>

<CardCloud endpoint="/api/events" ariaLabel="Search events" card={page} {header} />

{#snippet header()}
	<Drawing
		src="/drawing/text/events.webp"
		alt=""
		aria-hidden="true"
		class="mx-auto mb-4 w-[8rem] max-w-full"
	/>
{/snippet}

{#snippet page(item: EventItem)}
	<div
		class="sheet flex h-full flex-col overflow-hidden rounded-sm bg-white/95 p-4 text-gray-900 shadow-xl ring-1 ring-black/5"
	>
		<div class="border-b border-gray-200 pb-2">
			<h2 class="line-clamp-2 text-sm leading-tight font-medium">{item.title}</h2>
			{#if item.date}
				<p class="mt-1 text-[0.65rem] text-gray-500">
					{formatDate(item.date)}{#if item.time}
						· {item.time}{/if}
				</p>
			{/if}
		</div>
		{#if item.description}
			<p class="mt-1.5 line-clamp-5 text-xs leading-relaxed text-gray-800">{item.description}</p>
		{/if}
		{#if item.hosts.length}
			<div class="mt-auto flex flex-wrap gap-1 pt-3">
				{#each item.hosts as host}
					<span class="rounded-full bg-gray-100 px-1.5 py-0.5 text-[0.65rem] text-gray-600"
						>{host}</span
					>
				{/each}
			</div>
		{/if}
	</div>
{/snippet}
