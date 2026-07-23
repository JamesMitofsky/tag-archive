<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import ArrowsMergeIcon from 'phosphor-svelte/lib/ArrowsMergeIcon';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Client-side search over the loaded roster — every list here gets a filter.
	let query = $state('');
	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.people;
		return data.people.filter((p) => p.name.toLowerCase().includes(q));
	});

	const glassInput =
		'w-full rounded-lg border border-white/40 bg-white/25 text-base text-gray-800 shadow-sm backdrop-blur-md placeholder:text-gray-600 focus:border-white/60 focus:bg-white/35 focus:ring-1 focus:ring-white/50 focus:outline-none';
</script>

<svelte:head>
	<title>Contributors · Cloud Keeper · TAG Archive</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8 flex items-start justify-between gap-4">
			<div>
				<h1 class="text-2xl font-semibold tracking-tight text-[#14120f]">Contributors</h1>
				<p class="mt-1 text-sm text-gray-600">
					Everyone in the archive — hosts and provenance alike. Open one to rename it or see its
					events and artefacts.
				</p>
				<Breadcrumbs class="mt-2" />
			</div>
			<a
				href="/keeper/contributors/merge"
				aria-label="Merge contributors"
				title="Merge contributors"
				class="shrink-0 rounded-full border border-white/40 bg-white/25 p-2.5 text-gray-700 shadow-sm backdrop-blur-md transition hover:bg-white/40 hover:text-gray-900"
			>
				<ArrowsMergeIcon size={20} class="-rotate-90" />
			</a>
		</header>

		<!-- Roster -->
		<div class="relative">
			<MagnifyingGlassIcon
				size={18}
				class="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-gray-500"
			/>
			<label class="sr-only" for="contributor-search">Search contributors</label>
			<input
				id="contributor-search"
				type="search"
				bind:value={query}
				class="py-3 pr-3 pl-10 {glassInput}"
			/>
		</div>

		<p class="mt-3 text-sm text-gray-600">
			{filtered.length}
			{filtered.length === 1 ? 'person' : 'people'}{#if query}
				· <span class="text-gray-500">of {data.people.length}</span>{/if}
		</p>

		<section class="mt-4">
			{#if filtered.length === 0}
				<p
					class="mt-3 rounded-lg border border-dashed border-white/60 p-6 text-center text-sm text-gray-700"
				>
					{#if data.people.length === 0}
						No people in the archive yet.
					{:else}
						No contributors match “{query}”.
					{/if}
				</p>
			{:else}
				<ul class="mt-3 space-y-4">
					{#each filtered as item, i (item.id)}
						<li
							class="relative rounded-sm bg-white/95 p-4 text-gray-900 shadow-xl ring-1 ring-black/5 transition hover:shadow-2xl
							{i % 2 === 0 ? '-rotate-[0.35deg]' : 'rotate-[0.4deg]'}"
						>
							<!-- Whole card opens the contributor's events + artefacts (rename lives there). -->
							<div class="flex items-center justify-between gap-3">
								<div class="min-w-0">
									<h3 class="font-medium break-words">
										<a
											href="/keeper/contributors/{item.id}"
											class="after:absolute after:inset-0 after:z-[1]"
										>
											{item.name}
										</a>
									</h3>
									<p class="mt-0.5 text-sm text-gray-500">
										<!-- Counts next to the name, low emphasis, per the pill convention. -->
										{item.artefactCount}
										{item.artefactCount === 1 ? 'artefact' : 'artefacts'} · {item.eventCount}
										{item.eventCount === 1 ? 'event' : 'events'}
									</p>
								</div>
								<CaretRightIcon size={16} class="shrink-0 text-gray-400" />
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</main>
