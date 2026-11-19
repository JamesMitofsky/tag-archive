<!--
	Picks an event's feature image: one photograph or one artefact page that the
	archive already holds. Owns the hidden input the form submits (see
	`encodeFeatureRef`), so a form needs nothing but a `name` for it; an empty
	value submits "no feature image".

	The dialog leads with the artefacts and image sets linked to the event
	(`linked`, from the page's load), then searches the rest of the archive on
	demand (src/routes/keeper/events/feature-images), so the page never ships
	every photograph. An event still being created has no id and nothing linked.
-->
<script module lang="ts">
	import type { FeatureCandidate } from '$lib/featureImage';

	/** The current choice, with the label of what it came from. */
	export type FeatureSelection = FeatureCandidate & { label: string };
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import OptimizedImage from '$lib/components/OptimizedImage.svelte';
	import { formatPartialDate } from '$lib/partialDate';
	import type { FeatureCandidateGroup } from '$lib/featureImage';
	import ImageIcon from 'phosphor-svelte/lib/ImageIcon';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';

	let {
		name,
		value = $bindable(null),
		linked,
		eventId,
		error
	}: {
		name: string;
		value?: FeatureSelection | null;
		linked: FeatureCandidateGroup[];
		/** The event being edited; null on the add form, where nothing is linked yet. */
		eventId: number | null;
		error?: string;
	} = $props();

	let open = $state(false);
	let query = $state('');
	let results = $state<FeatureCandidateGroup[] | null>(null);
	let truncated = $state(false);
	let searching = $state(false);
	let searchFailed = $state(false);

	// Bumped on every search so a slow, older answer can't overwrite a newer one.
	let version = 0;
	async function search(q: string) {
		const v = ++version;
		searching = true;
		searchFailed = false;
		try {
			const params = new URLSearchParams(eventId === null ? { q } : { q, event: String(eventId) });
			const res = await fetch(`/keeper/events/feature-images?${params}`);
			if (v !== version) return;
			if (!res.ok) throw new Error(`search failed: ${res.status}`);
			const body: { groups: FeatureCandidateGroup[]; truncated: boolean } = await res.json();
			if (v !== version) return;
			results = body.groups;
			truncated = body.truncated;
		} catch {
			if (v === version) searchFailed = true;
		} finally {
			if (v === version) searching = false;
		}
	}

	// Search when the dialog opens, then again as the query settles. Only `open`
	// and `query` drive it: were `results` tracked too, every answer would set off
	// another search.
	$effect(() => {
		if (!open) return;
		const q = query;
		const delay = untrack(() => results === null) ? 0 : 250;
		const timer = setTimeout(() => search(q), delay);
		return () => clearTimeout(timer);
	});

	function choose(group: FeatureCandidateGroup, candidate: FeatureCandidate) {
		value = { ...candidate, label: group.label };
		open = false;
	}

	/** What kind of source a group is, and when it is from. */
	function groupMeta(group: FeatureCandidateGroup): string {
		const kind = group.kind === 'artefact' ? `Artefact #${group.id}` : 'Photographs';
		return group.date ? `${kind} · ${formatPartialDate(group.date)}` : kind;
	}

	function describe(group: FeatureCandidateGroup, index: number): string {
		const noun = group.kind === 'artefact' ? 'page' : 'photograph';
		return group.images.length === 1 ? group.label : `${group.label}, ${noun} ${index + 1}`;
	}
</script>

<input type="hidden" {name} value={value?.ref ?? ''} />

<div>
	<span class="block text-sm font-medium text-gray-700">Feature image</span>
	{#if value}
		<div class="mt-1.5 flex items-start gap-3">
			<OptimizedImage
				src={value.url}
				alt={value.label}
				sizes="128px"
				widths={[128, 192, 240]}
				class="h-24 w-32 shrink-0 rounded-sm bg-gray-50 object-contain ring-1 ring-black/5"
			/>
			<div class="min-w-0 text-sm">
				<p class="break-words text-gray-700">{value.label}</p>
				<div class="mt-2 flex flex-wrap gap-2">
					<button
						type="button"
						onclick={() => (open = true)}
						aria-label="Change feature image"
						class="rounded-full border border-gray-200 px-3 py-1 text-gray-700 transition hover:bg-gray-50"
					>
						Change
					</button>
					<button
						type="button"
						onclick={() => (value = null)}
						aria-label="Remove feature image"
						class="rounded-full border border-gray-200 px-3 py-1 text-gray-500 transition hover:bg-red-50 hover:text-red-600"
					>
						Remove
					</button>
				</div>
			</div>
		</div>
	{:else}
		<button
			type="button"
			onclick={() => (open = true)}
			class="mt-1.5 flex w-full items-center justify-center gap-2 rounded-sm border border-dashed border-gray-300 py-4 text-sm text-gray-600 transition hover:border-gray-400 hover:bg-gray-50"
		>
			<ImageIcon size={18} />
			Choose a photograph or artefact page
		</button>
	{/if}
	{#if error}
		<p class="mt-1 text-xs text-red-600" role="alert">{error}</p>
	{/if}
</div>

<Dialog.Root bind:open>
	<Dialog.Content class="flex max-h-[85dvh] flex-col sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Choose a feature image</Dialog.Title>
			<Dialog.Description>
				Any photograph or artefact page in the archive. One still awaiting review shows publicly
				once it is approved.
			</Dialog.Description>
		</Dialog.Header>

		<div class="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
			{#if linked.length > 0}
				<h3 class="mb-2 text-xs font-medium tracking-wide text-gray-500 uppercase">
					Linked to this event
				</h3>
				{@render groups(linked)}
			{/if}

			<h3
				class="mb-2 text-xs font-medium tracking-wide text-gray-500 uppercase {linked.length > 0
					? 'mt-6'
					: ''}"
			>
				{linked.length > 0 ? 'Elsewhere in the archive' : 'From the archive'}
			</h3>
			<label class="relative mb-3 block">
				<span class="sr-only">Search artefacts and photographs</span>
				<MagnifyingGlassIcon
					size={16}
					class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
				/>
				<input
					type="search"
					bind:value={query}
					placeholder="Search by title, description, event or artefact number"
					class="w-full rounded-md border border-gray-200 py-2 pr-3 pl-9 text-base focus:border-gray-400 focus:ring-0 focus:outline-none sm:text-sm"
				/>
			</label>

			{#if searchFailed}
				<p class="py-4 text-sm text-red-600" role="alert">
					Couldn't search the archive. Check the connection and try again.
				</p>
			{:else if results === null}
				<p class="flex items-center gap-2 py-4 text-sm text-gray-500">
					<CircleNotchIcon size={16} class="animate-spin" /> Loading…
				</p>
			{:else if results.length === 0}
				<p class="py-4 text-sm text-gray-500">
					{query.trim() ? 'Nothing matches that search.' : 'No other images in the archive yet.'}
				</p>
			{:else}
				<div class={searching ? 'opacity-60 transition-opacity' : ''} aria-busy={searching}>
					{@render groups(results)}
				</div>
				{#if truncated}
					<p class="mt-2 mb-1 text-xs text-gray-500">
						Showing the most recent matches. Search to narrow them down.
					</p>
				{/if}
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>

{#snippet groups(list: FeatureCandidateGroup[])}
	<ul class="space-y-4">
		{#each list as group (`${group.kind}:${group.id}`)}
			<li>
				<p class="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-sm">
					<span class="font-medium break-words text-gray-800">{group.label}</span>
					<span class="text-xs text-gray-500">{groupMeta(group)}</span>
					{#if group.proposed}
						<span class="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
							Awaiting review
						</span>
					{/if}
				</p>
				<div class="grid grid-cols-3 gap-2 sm:grid-cols-5">
					{#each group.images as candidate, i (candidate.ref)}
						{@const selected = value?.ref === candidate.ref}
						<button
							type="button"
							onclick={() => choose(group, candidate)}
							aria-pressed={selected}
							aria-label="Feature {describe(group, i)}"
							class="relative aspect-square overflow-hidden rounded-sm bg-gray-50 ring-1 ring-black/5 transition hover:ring-2 hover:ring-gray-400 focus-visible:ring-2 focus-visible:ring-gray-700 focus-visible:outline-none {selected
								? 'ring-2 ring-[#14120f]'
								: ''}"
						>
							<OptimizedImage
								src={candidate.url}
								alt=""
								sizes="128px"
								widths={[128, 192, 240]}
								class="h-full w-full object-cover"
							/>
							{#if selected}
								<span
									class="absolute top-1 right-1 rounded-full bg-[#14120f] p-0.5 text-white shadow"
								>
									<CheckIcon size={12} weight="bold" />
								</span>
							{/if}
						</button>
					{/each}
				</div>
			</li>
		{/each}
	</ul>
{/snippet}
