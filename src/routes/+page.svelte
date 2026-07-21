<script lang="ts">
	import type { ArtefactWithEvent } from '$lib/server/db/schema';
	import { programAreaMeta } from '$lib/programAreas';
	import { formatDate } from '$lib/formatDate';
	import CardCloud from '$lib/components/CardCloud.svelte';
</script>

<CardCloud endpoint="/api/search" card={page} {header} />

{#snippet header()}
	<img
		src="/drawing/text/artefacts.png"
		alt=""
		aria-hidden="true"
		class="mx-auto mb-1 w-[12rem] max-w-full"
		style="mix-blend-mode: multiply"
	/>
{/snippet}

{#snippet page(item: ArtefactWithEvent)}
	<div
		class="sheet flex h-full flex-col overflow-hidden rounded-sm bg-white/95 p-4 text-gray-900 shadow-xl ring-1 ring-black/5"
	>
		<div class="border-b border-gray-200 pb-2">
			<h2 class="line-clamp-2 text-sm leading-tight font-medium">{item.artefact}</h2>
			{#if item.event}
				<p class="mt-1 text-[0.65rem] text-gray-500">{item.event}</p>
			{/if}
			{#if item.date}
				<p class="mt-1 text-[0.65rem] text-gray-500">{formatDate(item.date)}</p>
			{/if}
		</div>
		{#if item.description}
			<p class="mt-1.5 line-clamp-5 text-xs leading-relaxed text-gray-800">{item.description}</p>
		{/if}
		{#if item.provenance.length || item.programArea.length}
			<div class="mt-auto flex flex-wrap gap-1 pt-3">
				{#each item.programArea as tag}
					{@const Icon = programAreaMeta(tag).icon}
					<span
						class="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.65rem] {programAreaMeta(
							tag
						).pill}"
					>
						<Icon size={11} weight="fill" />
						{tag}
					</span>
				{/each}
				{#each item.provenance as person}
					<span class="rounded-full bg-gray-100 px-1.5 py-0.5 text-[0.65rem] text-gray-600"
						>{person}</span
					>
				{/each}
			</div>
		{/if}
	</div>
{/snippet}
