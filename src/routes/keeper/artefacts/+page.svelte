<script lang="ts">
	import BackButton from '$lib/components/BackButton.svelte';
	import KeeperList from '$lib/components/KeeperList.svelte';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import { programAreaMeta } from '$lib/programAreas';
	import { morphName } from '$lib/transitions.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Client-side search over the loaded artefacts — every list here gets a filter.
	let query = $state('');
	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.artefacts;
		return data.artefacts.filter((a) =>
			[a.artefact, a.description, a.event, a.date, a.provenance.join(' '), a.programArea.join(' ')]
				.filter(Boolean)
				.some((field) => field!.toLowerCase().includes(q))
		);
	});

	// Persist the search text across back navigation (e.g. open an artefact, then
	// return). SvelteKit restores this after the page remounts; the list rides the
	// page scroll, so native scroll restoration handles position.
	export const snapshot = {
		capture: () => query,
		restore: (value: string) => (query = value)
	};

	// Frosted glass, borrowed from the keeper searchbar.
	const glassInput =
		'w-full rounded-lg border border-white/40 bg-white/25 text-base text-gray-800 shadow-sm backdrop-blur-md placeholder:text-gray-600 focus:border-white/60 focus:bg-white/35 focus:ring-1 focus:ring-white/50 focus:outline-none';

	// Render dates like "July 4, 2023"; fall back to raw string if unparseable.
	function formatDate(value: string): string {
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return value;
		return parsed.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}
</script>

<svelte:head>
	<title>Artefacts · Cloud Keeper · TAG Archive</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8 flex items-start justify-between gap-4">
			<div>
				<BackButton />
				<h1 class="mt-3 text-2xl font-semibold tracking-tight text-[#14120f]">Artefacts</h1>
			</div>
			<a
				href="/keeper/add"
				aria-label="Add artefact"
				title="Add artefact"
				class="rounded-full border border-white/40 bg-white/25 p-2.5 text-gray-700 shadow-sm backdrop-blur-md transition hover:bg-white/40 hover:text-gray-900"
			>
				<PlusIcon size={20} />
			</a>
		</header>

		<!-- Search filters the loaded set in-place. -->
		<div class="relative">
			<MagnifyingGlassIcon
				size={18}
				class="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-gray-500"
			/>
			<label class="sr-only" for="artefact-search">Search artefacts</label>
			<input
				id="artefact-search"
				type="search"
				bind:value={query}
				class="py-3 pr-3 pl-10 {glassInput}"
			/>
		</div>

		<p class="mt-3 text-sm text-gray-600">
			{filtered.length}
			{filtered.length === 1 ? 'artefact' : 'artefacts'}{#if query}
				· <span class="text-gray-500">of {data.artefacts.length}</span>{/if}
		</p>

		<section class="mt-4">
			{#if data.artefacts.length === 0}
				<p
					class="mt-3 rounded-lg border border-dashed border-white/60 p-6 text-center text-sm text-gray-700"
				>
					Nothing archived yet — add the first one above.
				</p>
			{:else if filtered.length === 0}
				<p
					class="mt-3 rounded-lg border border-dashed border-white/60 p-6 text-center text-sm text-gray-700"
				>
					No artefacts match “{query}”.
				</p>
			{:else}
				<!-- Only visible rows mount; the list rides the page scroll. -->
				<KeeperList items={filtered} estimatedItemHeight={150} getKey={(item) => item.id}>
					{#snippet row(item, i)}
						<!-- py-2 doubles as the inter-card gap (measured), px-2 leaves shadow room. -->
						<div class="px-2 py-2">
							<!-- Each artefact is its own page, scattered ever so slightly like loose paper. -->
							<article
								data-vt-id={morphName('artefact', item.id)}
								class="relative rounded-sm bg-white/95 p-4 text-gray-900 shadow-xl ring-1 ring-black/5 transition hover:shadow-2xl
								{i % 2 === 0 ? '-rotate-[0.35deg]' : 'rotate-[0.4deg]'}"
							>
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<!-- Stretched link: the ::after overlay makes the whole card open the artefact page. -->
										<h3 data-vt-part="title" class="font-medium break-words">
											<a href="/keeper/{item.id}" class="after:absolute after:inset-0 after:z-[1]">
												{item.artefact}
											</a>
										</h3>
										<p data-vt-part="meta" class="mt-0.5 text-sm text-gray-500">
											{#if item.date}{formatDate(item.date)}{/if}{#if item.event}{#if item.date}
													·
												{/if}{item.event}{/if}
										</p>
									</div>
									{#if item.proposedAddition}
										<!-- Contributor submission awaiting a keeper's vetting; amber flags attention. -->
										<span
											class="relative z-[2] shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-amber-800 ring-1 ring-amber-200"
										>
											Proposed addition
										</span>
									{/if}
								</div>
								{#if item.description}
									<p class="mt-2 text-sm break-words whitespace-pre-line text-gray-800">
										{item.description}
									</p>
								{/if}
								{#if item.programArea.length > 0 || item.provenance.length > 0}
									<div
										data-vt-part="tags"
										class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5"
									>
										{#each item.programArea as area (area)}
											{@const Icon = programAreaMeta(area).icon}
											<span
												class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs {programAreaMeta(
													area
												).pill}"
											>
												<Icon size={13} weight="fill" />
												{area}
											</span>
										{/each}
										{#if item.provenance.length > 0}
											<span class="text-sm text-gray-500">
												{item.provenance.join(', ')}
											</span>
										{/if}
									</div>
								{/if}
							</article>
						</div>
					{/snippet}
				</KeeperList>
			{/if}
		</section>
	</div>
</main>
