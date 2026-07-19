<script lang="ts">
	import { enhance } from '$app/forms';
	import BackButton from '$lib/components/BackButton.svelte';
	import ArrowsMergeIcon from 'phosphor-svelte/lib/ArrowsMergeIcon';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Which two people to fold together. `primaryId` survives (posted as keepId),
	// `mergeId` is folded in then deleted (posted as removeId).
	let primaryId = $state<number | null>(null);
	let mergeId = $state<number | null>(null);

	const primaryPerson = $derived(data.people.find((p) => p.id === primaryId) ?? null);
	const mergePerson = $derived(data.people.find((p) => p.id === mergeId) ?? null);
	const ready = $derived(primaryPerson !== null && mergePerson !== null);

	// Client-side search over the roster — narrows the full list in place.
	let query = $state('');
	// When a "Likely duplicates" pair is picked, scope the roster to just those two
	// ids so the admin declares primary/merge among them. Overrides the text search.
	let pairFilter = $state<number[] | null>(null);
	const filtered = $derived.by(() => {
		if (pairFilter) return data.people.filter((p) => pairFilter!.includes(p.id));
		const q = query.trim().toLowerCase();
		if (!q) return data.people;
		return data.people.filter((p) => p.name.toLowerCase().includes(q));
	});

	// Roster anchor so picking a pair scrolls the narrowed list into view.
	let rosterEl = $state<HTMLElement | null>(null);

	function reviewPair(aId: number, bId: number) {
		pairFilter = [aId, bId];
		// Let the admin choose roles fresh for the scoped pair.
		primaryId = null;
		mergeId = null;
		rosterEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function clearPairFilter() {
		pairFilter = null;
	}

	function onSearchInput() {
		// Typing means the admin is browsing the full roster again.
		if (pairFilter) pairFilter = null;
	}

	function makePrimary(id: number) {
		primaryId = id;
		// Can't merge a person into themselves — drop a staged target that's now primary.
		if (mergeId === id) mergeId = null;
	}

	function clearPrimary() {
		primaryId = null;
		mergeId = null;
	}

	function toggleMerge(id: number) {
		mergeId = mergeId === id ? null : id;
	}

	const glassInput =
		'w-full rounded-lg border border-white/40 bg-white/25 text-base text-gray-800 shadow-sm backdrop-blur-md placeholder:text-gray-600 focus:border-white/60 focus:bg-white/35 focus:ring-1 focus:ring-white/50 focus:outline-none';
</script>

<svelte:head>
	<title>Merge contributors · Cloud Keeper · TAG Archive</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8">
			<BackButton href="/contributors" ariaLabel="Back to Contributors" />
			<h1 class="mt-3 text-2xl font-semibold tracking-tight text-[#14120f]">Merge contributors</h1>
			<p class="mt-1 text-sm text-gray-600">
				Fold two entries that are the same person into one. Make one the primary, then merge the
				other into it — its artefacts and events move over, then it's deleted.
			</p>
		</header>

		<!-- Likely duplicates: near-match pairs the roster can't surface itself
		     (names are unique, so dupes differ by accent/order/typo/initials).
		     Picking one scopes the roster below to those two people. -->
		{#if data.duplicates.length > 0}
			<section class="mb-6">
				<h2 class="text-sm font-semibold text-[#14120f]">
					Likely duplicates
					<span class="ml-1 font-normal text-gray-400">{data.duplicates.length}</span>
				</h2>
				<ul class="mt-3 space-y-3">
					{#each data.duplicates as pair (pair.a.id + '-' + pair.b.id)}
						{@const active =
							pairFilter?.includes(pair.a.id) && pairFilter?.includes(pair.b.id)}
						<li
							class="rounded-sm bg-white/95 p-4 text-gray-900 shadow-sm ring-1 transition
							{active ? 'ring-2 ring-amber-500' : 'ring-black/5'}"
						>
							<div class="flex items-center justify-between gap-3">
								<div class="min-w-0">
									<p class="text-sm break-words">
										<span class="font-medium">{pair.a.name}</span>
										<span class="text-gray-400">·</span>
										<span class="font-medium">{pair.b.name}</span>
									</p>
									<p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
										<span
											class="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">{pair.reason}</span
										>
										<span>
											{pair.a.artefactCount + pair.a.eventCount} vs {pair.b.artefactCount +
												pair.b.eventCount} links
										</span>
									</p>
								</div>
								<button
									type="button"
									onclick={() => reviewPair(pair.a.id, pair.b.id)}
									class="shrink-0 rounded-full border px-3 py-1.5 text-sm transition
									{active
										? 'border-amber-500 bg-amber-500 text-white hover:bg-amber-600'
										: 'border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900'}"
								>
									Review pair
								</button>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<!-- Confirm bar: always present so choosing a pair doesn't shift the layout;
		     the submit just enables once both sides are set. -->
		<section
			class="sticky top-4 z-10 mb-6 rounded-sm bg-white/95 p-4 text-gray-900 shadow-xl ring-1 ring-black/5"
		>
			<p class="text-sm {ready ? 'text-gray-700' : 'text-gray-400'}">
				{#if mergePerson && primaryPerson}
					Merge <span class="font-semibold underline">{mergePerson.name}</span> into
					<span class="font-semibold underline">{primaryPerson.name}</span>?
				{:else}
					Declare a primary and a desired-merge to fold two entries into one.
				{/if}
			</p>
			{#if form?.error}
				<p class="mt-2 text-sm text-red-600">{form.error}</p>
			{/if}
			<form method="POST" use:enhance class="mt-3 flex items-center justify-end gap-2">
				<input type="hidden" name="keepId" value={primaryId ?? ''} />
				<input type="hidden" name="removeId" value={mergeId ?? ''} />
				<button
					type="button"
					onclick={() => (mergeId = null)}
					disabled={mergeId === null}
					class="rounded-sm px-3 py-2.5 text-sm text-gray-600 transition hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={!ready}
					class="inline-flex items-center gap-2 rounded-sm bg-[#14120f] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#33302a] disabled:cursor-not-allowed disabled:opacity-40"
				>
					<ArrowsMergeIcon size={18} class="-rotate-90" />
					Merge
				</button>
			</form>
		</section>

		<!-- Roster: one narrowing list for both picks. -->
		<div bind:this={rosterEl} class="relative scroll-mt-4">
			<MagnifyingGlassIcon
				size={18}
				class="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-gray-500"
			/>
			<label class="sr-only" for="merge-search">Search contributors</label>
			<input
				id="merge-search"
				type="search"
				bind:value={query}
				oninput={onSearchInput}
				class="py-3 pr-3 pl-10 {glassInput}"
			/>
		</div>

		<p class="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-600">
			{#if pairFilter}
				<span>Showing 1 duplicate pair</span>
				<button
					type="button"
					onclick={clearPairFilter}
					class="text-gray-500 underline transition hover:text-gray-900"
				>
					clear
				</button>
			{:else}
				<span>
					{filtered.length}
					{filtered.length === 1 ? 'person' : 'people'}{#if query}
						· <span class="text-gray-500">of {data.people.length}</span>{/if}
				</span>
			{/if}
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
						{@const isPrimary = primaryId === item.id}
						{@const isMerge = mergeId === item.id}
						<li
							class="relative rounded-sm bg-white/95 p-4 text-gray-900 shadow-xl ring-1 transition
							{i % 2 === 0 ? '-rotate-[0.35deg]' : 'rotate-[0.4deg]'}
							{isPrimary
								? 'ring-2 ring-[#14120f]'
								: isMerge
									? 'ring-2 ring-amber-500'
									: 'ring-black/5 hover:shadow-2xl'}"
						>
							<div class="flex items-center justify-between gap-3">
								<div class="min-w-0">
									<h3 class="font-medium break-words">{item.name}</h3>
									<p class="mt-0.5 text-sm text-gray-500">
										<!-- Counts next to the name, low emphasis, per the pill convention. -->
										{item.artefactCount}
										{item.artefactCount === 1 ? 'artefact' : 'artefacts'} · {item.eventCount}
										{item.eventCount === 1 ? 'event' : 'events'}
									</p>
								</div>

								<!-- Both buttons always render in the same spot; the fill is the only
								     selected-state signal, so nothing shifts as picks change. -->
								<div class="flex shrink-0 items-center gap-2">
									<button
										type="button"
										onclick={() => (isPrimary ? clearPrimary() : makePrimary(item.id))}
										class="rounded-full border px-3 py-1.5 text-sm transition
										{isPrimary
											? 'border-[#14120f] bg-[#14120f] text-white hover:bg-[#33302a]'
											: 'border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900'}"
									>
										Declare primary
									</button>
									<button
										type="button"
										onclick={() => toggleMerge(item.id)}
										disabled={primaryId === null || isPrimary}
										title={primaryId === null
											? 'Declare a primary first'
											: isPrimary
												? "Can't merge a person into themselves"
												: undefined}
										class="rounded-full border px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40
										{isMerge
											? 'border-amber-500 bg-amber-500 text-white hover:bg-amber-600'
											: 'border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900'}"
									>
										Declare desired-merge
									</button>
								</div>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</main>
