<script lang="ts">
	import { filterArtefacts } from '#lib/search.ts';
	import CardCloud from '#lib/components/CardCloud.svelte';
	import ArtefactCard, { type ArtefactCardItem } from '#lib/components/ArtefactCard.svelte';
	import Drawing from '#lib/components/Drawing.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The cloud loads its own list; here it is already in the page's data.
	const load = async () => data.artefacts;
</script>

<svelte:head>
	<title>Listening · TAG Archive</title>
</svelte:head>

{#if data.artefacts.length > 0}
	<CardCloud {load} filter={filterArtefacts} card={page} {placeholderMark} />
{:else}
	<main class="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
		<div class="relative z-10 max-w-md px-8 py-10 text-center text-gray-900">
			<h1 class="font-friendly text-4xl font-medium tracking-tight text-gray-800">
				Nothing here yet
			</h1>
			<p class="mt-4 text-gray-700">
				When artefacts are chosen for your account, you’ll find them here.
			</p>
		</div>
	</main>
{/if}

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

{#snippet page(item: ArtefactCardItem, isOpen: boolean)}
	<ArtefactCard {item} {isOpen} />
{/snippet}
