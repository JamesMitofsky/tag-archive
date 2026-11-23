<script lang="ts">
	import { snapshot } from '$app/navigation';
	import BackButton from '#lib/components/BackButton.svelte';
	import KeeperList from '#lib/components/KeeperList.svelte';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import VinylRecordIcon from 'phosphor-svelte/lib/VinylRecordIcon';
	import { albumParticulars } from '#lib/albums/format.ts';
	import { morphVar } from '#lib/transitions.svelte.ts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const rows = $derived(data.albums.map((album) => ({ ...album, meta: albumParticulars(album) })));

	// Client-side search over the loaded albums — every list here gets a filter.
	// Track titles count, so a keeper can find an album by a song on it.
	let query = $state('');
	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return rows;
		return rows.filter((row) =>
			[
				row.title,
				row.artist,
				row.meta,
				row.description,
				row.date,
				...row.tracks.map((t) => t.title)
			]
				.filter(Boolean)
				.some((field) => field!.toLowerCase().includes(q))
		);
	});

	// Persist the search text across back navigation, as the other keeper lists do.
	snapshot({
		id: 'keeper-albums-query',
		capture: () => query,
		restore: (value) => (query = value)
	});

	// Frosted glass, borrowed from the keeper searchbar.
	const glassInput =
		'w-full rounded-lg border border-white/40 bg-white/25 text-base text-gray-800 shadow-sm backdrop-blur-md placeholder:text-gray-600 focus:border-white/60 focus:bg-white/35 focus:ring-1 focus:ring-white/50 focus:outline-none';
</script>

<svelte:head>
	<title>Albums · Cloud Keeper · TAG Archive</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8 flex items-start justify-between gap-4">
			<div>
				<h1 class="text-2xl font-semibold tracking-tight text-[#14120f]">Albums</h1>
				<BackButton class="mt-2" />
			</div>
			<a
				href="/keeper/albums/new"
				aria-label="Add an album"
				title="Add an album"
				class="rounded-full border border-white/40 bg-white/25 p-2.5 text-gray-700 shadow-sm backdrop-blur-md transition hover:bg-white/40 hover:text-gray-900"
			>
				<PlusIcon size={20} />
			</a>
		</header>

		<div class="relative">
			<MagnifyingGlassIcon
				size={18}
				class="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-gray-500"
			/>
			<label class="sr-only" for="album-search">Search albums</label>
			<input
				id="album-search"
				type="search"
				bind:value={query}
				class="py-3 pr-3 pl-10 {glassInput}"
			/>
		</div>

		<section class="mt-4">
			{#if data.albums.length === 0}
				<p
					class="mt-3 rounded-lg border border-dashed border-white/60 p-6 text-center text-sm text-gray-700"
				>
					No albums yet — add the first one above.
				</p>
			{:else if filtered.length === 0}
				<p
					class="mt-3 rounded-lg border border-dashed border-white/60 p-6 text-center text-sm text-gray-700"
				>
					No albums match “{query}”.
				</p>
			{:else}
				<KeeperList items={filtered} estimatedItemHeight={130} getKey={(item) => item.id}>
					{#snippet row(item, i)}
						<div class="px-2 py-2">
							<article
								style:view-transition-name={morphVar('album', item.id)}
								class="relative flex items-start gap-4 rounded-sm bg-white/95 p-4 text-gray-900 shadow-xl ring-1 ring-black/5 transition hover:shadow-2xl
							{i % 2 === 0 ? '-rotate-[0.35deg]' : 'rotate-[0.4deg]'}"
							>
								<div
									class="flex size-20 shrink-0 items-center justify-center rounded-sm bg-gray-50 text-gray-500 ring-1 ring-black/5"
								>
									<VinylRecordIcon size={36} />
								</div>

								<div class="min-w-0 flex-1">
									<div class="flex items-start justify-between gap-3">
										<!-- Stretched link: the ::after overlay makes the whole card open the album. -->
										<h3 class="min-w-0 font-medium break-words">
											<a
												href="/keeper/albums/{item.id}"
												class="after:absolute after:inset-0 after:z-[1]"
											>
												{item.title}
											</a>
										</h3>
										{#if item.proposedAddition}
											<span
												class="relative z-[2] shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-amber-800 ring-1 ring-amber-200"
											>
												Proposed addition
											</span>
										{/if}
									</div>
									{#if item.artist}
										<p class="mt-0.5 text-sm break-words text-gray-700">{item.artist}</p>
									{/if}
									<p
										style:view-transition-name={morphVar('album', item.id, 'meta')}
										class="mt-0.5 text-sm text-gray-500"
									>
										{item.meta}
									</p>
									{#if item.description}
										<p
											class="mt-2 line-clamp-2 text-sm break-words whitespace-pre-line text-gray-800"
										>
											{item.description}
										</p>
									{/if}
								</div>
							</article>
						</div>
					{/snippet}
				</KeeperList>
			{/if}
		</section>
	</div>
</main>
