<script lang="ts">
	import { enhance } from '$app/forms';
	import ArrowsMergeIcon from 'phosphor-svelte/lib/ArrowsMergeIcon';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';

	type Person = { id: number; name: string; artefactCount: number; eventCount: number };

	// `people` is whatever roster this picker works over — the full contributor list
	// on the manual merge page, or a single proposed duplicate group on review. The
	// behaviour is identical either way. `error` surfaces the host action's failure.
	let { people, error }: { people: Person[]; error?: string } = $props();

	// Which two people to fold together. `primaryId` survives (posted as keepId),
	// `mergeId` is folded in then deleted (posted as removeId). Both opt-in.
	let primaryId = $state<number | null>(null);
	let mergeId = $state<number | null>(null);
	let submitting = $state(false);

	const primaryPerson = $derived(people.find((p) => p.id === primaryId) ?? null);
	const mergePerson = $derived(people.find((p) => p.id === mergeId) ?? null);
	const ready = $derived(primaryPerson !== null && mergePerson !== null);

	// Client-side search over the roster — narrows the list in place.
	let query = $state('');
	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return people;
		return people.filter((p) => p.name.toLowerCase().includes(q));
	});

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
	{#if error}
		<p class="mt-2 text-sm text-red-600">{error}</p>
	{/if}
	<form
		method="POST"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
			};
		}}
		class="mt-3 flex items-center justify-end gap-2"
	>
		<input type="hidden" name="keepId" value={primaryId ?? ''} />
		<input type="hidden" name="removeId" value={mergeId ?? ''} />
		<button
			type="button"
			onclick={() => (mergeId = null)}
			disabled={mergeId === null || submitting}
			class="rounded-sm px-3 py-2.5 text-sm text-gray-600 transition hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
		>
			Cancel
		</button>
		<button
			type="submit"
			disabled={!ready || submitting}
			aria-busy={submitting}
			class="inline-flex items-center gap-2 rounded-sm bg-[#14120f] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#33302a] disabled:cursor-not-allowed disabled:opacity-40"
		>
			{#if submitting}
				<CircleNotchIcon size={18} class="shrink-0 animate-spin" />
			{:else}
				<ArrowsMergeIcon size={18} class="-rotate-90" />
			{/if}
			Merge
		</button>
	</form>
</section>

<!-- Roster: one narrowing list for both picks. -->
<div class="relative">
	<MagnifyingGlassIcon
		size={18}
		class="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-gray-500"
	/>
	<label class="sr-only" for="merge-search">Search contributors</label>
	<input id="merge-search" type="search" bind:value={query} class="py-3 pr-3 pl-10 {glassInput}" />
</div>

<p class="mt-3 text-sm text-gray-600">
	{filtered.length}
	{filtered.length === 1 ? 'person' : 'people'}{#if query}
		· <span class="text-gray-500">of {people.length}</span>{/if}
</p>

<section class="mt-4">
	{#if filtered.length === 0}
		<p
			class="mt-3 rounded-lg border border-dashed border-white/60 p-6 text-center text-sm text-gray-700"
		>
			{#if people.length === 0}
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
