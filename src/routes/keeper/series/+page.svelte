<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import KeeperList from '$lib/components/KeeperList.svelte';
	import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRightIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Client-side search over the loaded series — every list here gets a filter.
	let query = $state('');
	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.series;
		return data.series.filter((s) => s.name.toLowerCase().includes(q));
	});

	// Persist the search text across back navigation (e.g. open a series, then
	// return). SvelteKit restores this after the page remounts; the list rides the
	// page scroll, so native scroll restoration handles position.
	export const snapshot = {
		capture: () => query,
		restore: (value: string) => (query = value)
	};

	// Render dates like "Jul 2023"; fall back to raw string if unparseable.
	function formatMonth(value: string | null): string {
		if (!value) return '';
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return value;
		return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', timeZone: 'UTC' });
	}

	// A series runs from its first to last event; collapse to one label when equal.
	function span(first: string | null, last: string | null): string {
		const a = formatMonth(first);
		const b = formatMonth(last);
		if (!a && !b) return '';
		return a === b ? a : `${a} – ${b}`;
	}

	const glassInput =
		'w-full rounded-lg border border-white/40 bg-white/25 text-base text-gray-800 shadow-sm backdrop-blur-md placeholder:text-gray-600 focus:border-white/60 focus:bg-white/35 focus:ring-1 focus:ring-white/50 focus:outline-none';
</script>

<svelte:head>
	<title>Series · Cloud Keeper · TAG Archive</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8 flex items-start justify-between gap-4">
			<div>
				<h1 class="text-2xl font-semibold tracking-tight text-[#14120f]">Series</h1>
				<p class="mt-1 text-sm text-gray-600">Banners under which some events exist.</p>
				<Breadcrumbs class="mt-2" />
			</div>
			<a
				href="/keeper/series/add"
				aria-label="Add series"
				title="Add series"
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
			<label class="sr-only" for="series-search">Search series</label>
			<input
				id="series-search"
				type="search"
				bind:value={query}
				class="py-3 pr-3 pl-10 {glassInput}"
			/>
		</div>

		<p class="mt-3 text-sm text-gray-600">
			{filtered.length}
			{filtered.length === 1 ? 'series' : 'series'}{#if query}
				· <span class="text-gray-500">of {data.series.length}</span>{/if}
		</p>

		<section class="mt-4">
			{#if filtered.length === 0}
				<p
					class="mt-3 rounded-lg border border-dashed border-white/60 p-6 text-center text-sm text-gray-700"
				>
					No series match “{query}”.
				</p>
			{:else}
				<!-- Only visible rows mount; the list rides the page scroll. -->
				<KeeperList items={filtered} estimatedItemHeight={92} getKey={(item) => item.id}>
					{#snippet row(item, i)}
						<!-- py-2 doubles as the inter-card gap (measured), px-2 leaves shadow room. -->
						<div class="px-2 py-2">
							<article
								class="relative rounded-sm bg-white/95 p-4 text-gray-900 shadow-xl ring-1 ring-black/5 transition hover:shadow-2xl
								{i % 2 === 0 ? '-rotate-[0.35deg]' : 'rotate-[0.4deg]'}"
							>
								<div class="flex items-center justify-between gap-3">
									<div class="min-w-0">
										<!-- Stretched link opens the events view filtered to this series. -->
										<h3 class="font-medium break-words">
											<a
												href="/keeper/events?q={encodeURIComponent(item.name)}"
												class="after:absolute after:inset-0 after:z-[1]"
											>
												{item.name}
											</a>
										</h3>
										<p class="mt-0.5 text-sm text-gray-500">
											<!-- Count next to the name, low emphasis, per the pill convention. -->
											{item.eventCount} events{#if span(item.firstDate, item.lastDate)}
												· {span(item.firstDate, item.lastDate)}{/if}
										</p>
									</div>
									<ArrowRightIcon size={18} class="shrink-0 text-gray-400" />
								</div>
							</article>
						</div>
					{/snippet}
				</KeeperList>
			{/if}
		</section>
	</div>
</main>
