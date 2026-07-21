<script lang="ts">
	import { untrack } from 'svelte';
	import BackButton from '$lib/components/BackButton.svelte';
	import KeeperList from '$lib/components/KeeperList.svelte';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Derive the row type from the loader so we never import the server module.
	type EventItem = PageData['events'][number];

	// Fixed for the life of the mount (a new page size means a fresh navigation).
	const pageSize = untrack(() => data.pageSize);

	// The full list is `total` rows, but only a page ships with the document; the
	// rest is fetched on scroll. `items` is a sparse array the length of the whole
	// result — a hole (undefined) renders as a skeleton until its page arrives.
	let query = $state(untrack(() => data.q));
	let total = $state(untrack(() => data.total));
	let items = $state<(EventItem | undefined)[]>(untrack(() => seed(data.events, data.total)));

	// Page bookkeeping. Not reactive — only `items`/`total` drive the render.
	const loaded = new Set<number>([0]);
	const loading = new Set<number>();
	// Bumped on every new search so in-flight page fetches from the old query drop.
	let version = 0;

	function seed(rows: EventItem[], count: number): (EventItem | undefined)[] {
		const arr = new Array<EventItem | undefined>(count);
		for (let i = 0; i < rows.length; i++) arr[i] = rows[i];
		return arr;
	}

	// Fetch one page and splice it into the sparse array, unless it's already
	// present/in-flight or the search moved on while we waited.
	async function fetchPage(page: number) {
		const base = page * pageSize;
		if (page < 0 || base >= total || loaded.has(page) || loading.has(page)) return;
		loading.add(page);
		const v = version;
		try {
			const params = new URLSearchParams({
				offset: String(base),
				limit: String(pageSize),
				q: query
			});
			const res = await fetch(`/keeper/events/data?${params}`);
			if (!res.ok || v !== version) return;
			const body: { rows: EventItem[]; total: number } = await res.json();
			if (v !== version) return;
			for (let i = 0; i < body.rows.length; i++) items[base + i] = body.rows[i];
			loaded.add(page);
		} finally {
			loading.delete(page);
		}
	}

	// The list reports the rendered index window; pull in any pages it covers.
	function onVisibleChange(start: number, end: number) {
		const firstPage = Math.floor(start / pageSize);
		const lastPage = Math.floor((end - 1) / pageSize);
		for (let p = firstPage; p <= lastPage; p++) fetchPage(p);
	}

	// Run a fresh search from the top: new total, new sparse array, page cache wiped.
	async function runSearch() {
		version += 1;
		const v = version;
		loading.clear();
		const params = new URLSearchParams({ offset: '0', limit: String(pageSize), q: query });
		const res = await fetch(`/keeper/events/data?${params}`);
		if (!res.ok || v !== version) return;
		const body: { rows: EventItem[]; total: number } = await res.json();
		if (v !== version) return;
		total = body.total;
		items = seed(body.rows, body.total);
		loaded.clear();
		loaded.add(0);
	}

	// Debounce the search box. `lastQuery` starts at the loader's seed so the first
	// run (and a back-nav restore that matches it) doesn't refetch what we have.
	let lastQuery = untrack(() => data.q);
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const q = query;
		if (q === lastQuery) return;
		lastQuery = q;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(runSearch, 250);
	});

	// Persist the search text across back navigation (e.g. open an event, then
	// return). The list rides the page scroll, so native scroll restoration handles
	// position; a restored query different from the seed re-runs the search above.
	export const snapshot = {
		capture: () => query,
		restore: (value: string) => (query = value)
	};

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

	// Frosted glass, borrowed from the keeper searchbar.
	const glassInput =
		'w-full rounded-lg border border-white/40 bg-white/25 text-base text-gray-800 shadow-sm backdrop-blur-md placeholder:text-gray-600 focus:border-white/60 focus:bg-white/35 focus:ring-1 focus:ring-white/50 focus:outline-none';
</script>

<svelte:head>
	<title>Events · Cloud Keeper · TAG Archive</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8 flex items-start justify-between gap-4">
			<div>
				<BackButton />
				<h1 class="mt-3 text-2xl font-semibold tracking-tight text-[#14120f]">Events</h1>
			</div>
			<a
				href="/keeper/events/add"
				aria-label="Add event"
				title="Add event"
				class="rounded-full border border-white/40 bg-white/25 p-2.5 text-gray-700 shadow-sm backdrop-blur-md transition hover:bg-white/40 hover:text-gray-900"
			>
				<PlusIcon size={20} />
			</a>
		</header>

		<!-- Search runs on the server; results page in as you scroll. -->
		<div class="relative">
			<MagnifyingGlassIcon
				size={18}
				class="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-gray-500"
			/>
			<label class="sr-only" for="event-search">Search events</label>
			<input
				id="event-search"
				type="search"
				bind:value={query}
				class="py-3 pr-3 pl-10 {glassInput}"
			/>
		</div>

		<p class="mt-3 text-sm text-gray-600">
			{total}
			{total === 1 ? 'event' : 'events'}
		</p>

		<section class="mt-4">
			{#if total === 0}
				<p
					class="mt-3 rounded-lg border border-dashed border-white/60 p-6 text-center text-sm text-gray-700"
				>
					{#if query}No events match “{query}”.{:else}Nothing archived yet.{/if}
				</p>
			{:else}
				<!-- Only visible rows mount; the list rides the page scroll. Holes in the
				     sparse array render as skeletons until their page loads in. -->
				<KeeperList {items} estimatedItemHeight={150} {onVisibleChange}>
					{#snippet row(item, i)}
						<!-- py-2 doubles as the inter-card gap (measured), px-2 leaves shadow room. -->
						<div class="px-2 py-2">
							{#if item}
								<!-- Each event is a card, scattered ever so slightly like loose paper. -->
								<article
									class="relative rounded-sm bg-white/95 p-4 text-gray-900 shadow-xl ring-1 ring-black/5 transition hover:shadow-2xl
									{i % 2 === 0 ? '-rotate-[0.35deg]' : 'rotate-[0.4deg]'}"
								>
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0">
											<!-- Stretched link: the ::after overlay makes the whole card open the event page. -->
											<h3 class="font-medium break-words">
												<a
													href="/keeper/events/{item.id}"
													class="after:absolute after:inset-0 after:z-[1]"
												>
													{item.title}
												</a>
											</h3>
											<p class="mt-0.5 text-sm text-gray-500">
												{formatDate(
													item.date
												)}{#if item.time}{' · '}{item.time}{/if}{#if item.location}{' · '}{item.location}{/if}
											</p>
										</div>
										{#if item.series}
											<!-- Series banner: low emphasis, marks this as one of several connected events. -->
											<span
												class="inline-flex shrink-0 items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600"
												title="Part of the “{item.series}” series"
											>
												{item.series}
											</span>
										{/if}
									</div>
									{#if item.description}
										<p class="mt-2 text-sm break-words whitespace-pre-line text-gray-800">
											{item.description}
										</p>
									{/if}
									{#if item.hosts.length > 0 || item.mayHaveException}
										<div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
											{#if item.hosts.length > 0}
												<span class="text-sm text-gray-500">
													{item.hosts.join(', ')}
												</span>
											{/if}
											{#if item.mayHaveException}
												<span
													class="inline-flex items-center gap-1 text-xs text-amber-700"
													title={item.possibleExceptionDescription ?? 'Flagged for review'}
												>
													<WarningIcon size={13} weight="fill" />
													Needs review
												</span>
											{/if}
										</div>
									{/if}
								</article>
							{:else}
								<!-- Placeholder while this row's page is still loading. -->
								<article
									aria-hidden="true"
									class="relative rounded-sm bg-white/95 p-4 shadow-xl ring-1 ring-black/5
									{i % 2 === 0 ? '-rotate-[0.35deg]' : 'rotate-[0.4deg]'}"
								>
									<div class="animate-pulse space-y-2.5">
										<div class="h-4 w-2/3 rounded bg-gray-200"></div>
										<div class="h-3 w-1/3 rounded bg-gray-100"></div>
										<div class="h-3 w-full rounded bg-gray-100"></div>
										<div class="h-3 w-4/5 rounded bg-gray-100"></div>
									</div>
								</article>
							{/if}
						</div>
					{/snippet}
				</KeeperList>
			{/if}
		</section>
	</div>
</main>
