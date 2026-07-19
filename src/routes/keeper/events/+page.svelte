<script lang="ts">
	import { untrack } from 'svelte';
	import BackButton from '$lib/components/BackButton.svelte';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Client-side search over the loaded events — 1317 rows is too many to scan by
	// eye, and every list here gets a built-in text filter. Seeded from ?q= so a
	// series card can deep-link straight to its events.
	let query = $state(untrack(() => data.q));
	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.events;
		return data.events.filter((e) =>
			[e.title, e.series, e.description, e.location, e.date, e.hosts.join(' ')]
				.filter(Boolean)
				.some((field) => field!.toLowerCase().includes(q))
		);
	});

	// Persist the search text across back navigation (e.g. open an event, then
	// return). Restored after remount, overriding the ?q= seed only on back-nav.
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
				<BackButton href="/keeper" />
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

		<!-- Search filters the loaded set in-place. -->
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
			{filtered.length}
			{filtered.length === 1 ? 'event' : 'events'}{#if query}
				· <span class="text-gray-500">of {data.events.length}</span>{/if}
		</p>

		<section class="mt-4">
			{#if filtered.length === 0}
				<p
					class="mt-3 rounded-lg border border-dashed border-white/60 p-6 text-center text-sm text-gray-700"
				>
					No events match “{query}”.
				</p>
			{:else}
				<!-- Each event is a card, scattered ever so slightly like loose paper. -->
				<ul class="mt-3 space-y-4">
					{#each filtered as item, i (item.id)}
						<li
							class="relative rounded-sm bg-white/95 p-4 text-gray-900 shadow-xl ring-1 ring-black/5 transition hover:shadow-2xl
							{i % 2 === 0 ? '-rotate-[0.35deg]' : 'rotate-[0.4deg]'}"
						>
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0">
									<h3 class="font-medium break-words">{item.title}</h3>
									<p class="mt-0.5 text-sm text-gray-500">
										{formatDate(item.date)}{#if item.time}{' · '}{item.time}{/if}{#if item.location}{' · '}{item.location}{/if}
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
											Hosted by {item.hosts.join(', ')}
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
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</main>
