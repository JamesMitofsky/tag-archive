<script lang="ts">
	import { enhance } from '$app/forms';
	import BackButton from '$lib/components/BackButton.svelte';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import ArrowsMergeIcon from 'phosphor-svelte/lib/ArrowsMergeIcon';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Client-side search over the loaded roster — every list here gets a filter.
	let query = $state('');
	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.people;
		return data.people.filter((p) => p.name.toLowerCase().includes(q));
	});

	// Merge picker state: which two people to fold together.
	let keepId = $state<number | null>(null);
	let removeId = $state<number | null>(null);
	let keepQuery = $state('');
	let removeQuery = $state('');

	const keepMatches = $derived.by(() => matchesFor(keepQuery, removeId));
	const removeMatches = $derived.by(() => matchesFor(removeQuery, keepId));
	const keepPerson = $derived(data.people.find((p) => p.id === keepId) ?? null);
	const removePerson = $derived(data.people.find((p) => p.id === removeId) ?? null);

	// People matching a picker's search, excluding the id already chosen on the
	// other side (can't merge someone into themselves).
	function matchesFor(q: string, excludeId: number | null) {
		const needle = q.trim().toLowerCase();
		return data.people
			.filter((p) => p.id !== excludeId && p.name.toLowerCase().includes(needle))
			.slice(0, 8);
	}

	const glassInput =
		'w-full rounded-lg border border-white/40 bg-white/25 text-base text-gray-800 shadow-sm backdrop-blur-md placeholder:text-gray-600 focus:border-white/60 focus:bg-white/35 focus:ring-1 focus:ring-white/50 focus:outline-none';
</script>

<svelte:head>
	<title>Contributors · Cloud Keeper · TAG Archive</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8">
			<BackButton href="/settings" />
			<h1 class="mt-3 text-2xl font-semibold tracking-tight text-[#14120f]">Contributors</h1>
			<p class="mt-1 text-sm text-gray-600">
				Everyone in the archive — hosts and provenance alike. Rename an entry, or merge two that are
				the same person.
			</p>
		</header>

		<!-- Merge card: fold two entries into one canonical id. -->
		<section class="rounded-sm bg-white/95 p-5 text-gray-900 shadow-xl ring-1 ring-black/5">
			<h2 class="flex items-center gap-2 text-base font-semibold">
				<ArrowsMergeIcon size={18} />
				Merge two contributors
			</h2>
			<p class="mt-1 text-sm text-gray-500">
				All artefacts and events on the removed entry move to the kept one, then it's deleted.
			</p>

			<form
				method="POST"
				action="?/merge"
				use:enhance={() => {
					return async ({ result, update }) => {
						await update();
						if (result.type === 'success') {
							keepId = removeId = null;
							keepQuery = removeQuery = '';
						}
					};
				}}
				class="mt-4 grid gap-4 sm:grid-cols-2"
			>
				<input type="hidden" name="keepId" value={keepId ?? ''} />
				<input type="hidden" name="removeId" value={removeId ?? ''} />

				<!-- Keep picker -->
				<div>
					<span class="block text-xs font-medium tracking-wide text-gray-500 uppercase">Keep</span>
					{#if keepPerson}
						<button
							type="button"
							onclick={() => (keepId = null)}
							class="mt-1 flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm"
						>
							<span class="truncate">{keepPerson.name}</span>
							<span class="text-xs text-gray-400">change</span>
						</button>
					{:else}
						<input
							type="search"
							placeholder="Search…"
							bind:value={keepQuery}
							class="mt-1 py-2 pr-3 pl-3 {glassInput} text-sm"
						/>
						{#if keepQuery.trim()}
							<ul class="mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white">
								{#each keepMatches as p (p.id)}
									<li>
										<button
											type="button"
											onclick={() => {
												keepId = p.id;
												keepQuery = '';
											}}
											class="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
										>
											{p.name}
										</button>
									</li>
								{:else}
									<li class="px-3 py-2 text-sm text-gray-400">No matches.</li>
								{/each}
							</ul>
						{/if}
					{/if}
				</div>

				<!-- Remove picker -->
				<div>
					<span class="block text-xs font-medium tracking-wide text-gray-500 uppercase">Remove</span>
					{#if removePerson}
						<button
							type="button"
							onclick={() => (removeId = null)}
							class="mt-1 flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm"
						>
							<span class="truncate">{removePerson.name}</span>
							<span class="text-xs text-gray-400">change</span>
						</button>
					{:else}
						<input
							type="search"
							placeholder="Search…"
							bind:value={removeQuery}
							class="mt-1 py-2 pr-3 pl-3 {glassInput} text-sm"
						/>
						{#if removeQuery.trim()}
							<ul class="mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white">
								{#each removeMatches as p (p.id)}
									<li>
										<button
											type="button"
											onclick={() => {
												removeId = p.id;
												removeQuery = '';
											}}
											class="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
										>
											{p.name}
										</button>
									</li>
								{:else}
									<li class="px-3 py-2 text-sm text-gray-400">No matches.</li>
								{/each}
							</ul>
						{/if}
					{/if}
				</div>

				<div class="sm:col-span-2">
					{#if form?.action === 'merge' && form.error}
						<p class="mb-2 text-sm text-red-600">{form.error}</p>
					{/if}
					<button
						type="submit"
						disabled={keepId === null || removeId === null}
						class="inline-flex items-center gap-2 rounded-sm bg-[#14120f] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#33302a] disabled:cursor-not-allowed disabled:opacity-40"
					>
						<ArrowsMergeIcon size={18} />
						{#if keepPerson && removePerson}
							Merge “{removePerson.name}” into “{keepPerson.name}”
						{:else}
							Merge
						{/if}
					</button>
				</div>
			</form>
		</section>

		<!-- Roster -->
		<div class="relative mt-8">
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
							class="rounded-sm bg-white/95 p-4 text-gray-900 shadow-xl ring-1 ring-black/5
							{i % 2 === 0 ? '-rotate-[0.35deg]' : 'rotate-[0.4deg]'}"
						>
							<!-- Inline rename; submit only sends this row's id + new name. -->
							<form method="POST" action="?/rename" use:enhance class="flex items-center gap-2">
								<input type="hidden" name="id" value={item.id} />
								<input
									name="name"
									value={item.name}
									aria-label="Contributor name"
									class="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 font-medium text-gray-900 hover:border-gray-200 focus:border-gray-300 focus:bg-white focus:ring-1 focus:ring-gray-200 focus:outline-none"
								/>
								<button
									type="submit"
									aria-label="Save name"
									title="Save name"
									class="shrink-0 rounded-full border border-gray-200 p-2 text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
								>
									<CheckIcon size={16} />
								</button>
							</form>
							<div class="mt-1 flex items-center justify-between gap-3 px-2">
								<p class="text-sm text-gray-500">
									<!-- Counts next to the name, low emphasis, per the pill convention. -->
									{item.artefactCount}
									{item.artefactCount === 1 ? 'artefact' : 'artefacts'} · {item.eventCount}
									{item.eventCount === 1 ? 'event' : 'events'}
								</p>
								{#if form?.action === 'rename' && form.id === item.id && form.error}
									<p class="text-sm text-red-600">{form.error}</p>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</main>
