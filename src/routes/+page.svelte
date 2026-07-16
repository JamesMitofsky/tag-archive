<script lang="ts">
	import type { Artefact } from '$lib/server/db/schema';

	let query = $state('');
	let results = $state<Artefact[]>([]);
	let loading = $state(false);
	let searched = $state(false);

	let debounce: ReturnType<typeof setTimeout>;
	let requestId = 0;

	async function runSearch(q: string) {
		const trimmed = q.trim();
		if (!trimmed) {
			results = [];
			searched = false;
			loading = false;
			return;
		}

		const id = ++requestId;
		loading = true;
		try {
			const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
			const data = await res.json();
			// Ignore out-of-order responses from earlier keystrokes.
			if (id !== requestId) return;
			results = data.results ?? [];
			searched = true;
		} finally {
			if (id === requestId) loading = false;
		}
	}

	$effect(() => {
		const q = query;
		clearTimeout(debounce);
		debounce = setTimeout(() => runSearch(q), 200);
		return () => clearTimeout(debounce);
	});
</script>

<main
	class="forest flex min-h-screen flex-col items-center p-4"
	class:justify-center={!searched}
	class:pt-16={searched}
>
	<div class="relative w-full max-w-xl">
		<svg
			class="pointer-events-none absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-gray-700"
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			stroke-width="2"
			stroke="currentColor"
			aria-hidden="true"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="m21 21-4.3-4.3m1.8-4.7a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
		</svg>
		<input
			type="search"
			bind:value={query}
			aria-label="Search"
			class="w-full rounded-lg border border-white/40 bg-white/25 py-3 pl-12 pr-4 text-base text-gray-800 shadow-sm backdrop-blur-md placeholder:text-gray-600 focus:border-white/60 focus:bg-white/35 focus:outline-none focus:ring-1 focus:ring-white/50"
		/>
	</div>

	{#if searched}
		<div class="mt-6 w-full max-w-xl">
			<p class="mb-3 text-sm text-gray-700">
				{#if loading}
					Searching…
				{:else}
					{results.length} result{results.length === 1 ? '' : 's'}
				{/if}
			</p>

			<ul class="space-y-3">
				{#each results as item (item.id)}
					<li class="rounded-lg border border-white/40 bg-white/25 p-4 shadow-sm backdrop-blur-md">
						<div class="flex items-baseline justify-between gap-3">
							<h2 class="font-medium text-gray-900">{item.artefact}</h2>
							{#if item.date}
								<span class="shrink-0 text-xs text-gray-600">{item.date}</span>
							{/if}
						</div>
						{#if item.event}
							<p class="mt-0.5 text-sm text-gray-700">{item.event}</p>
						{/if}
						{#if item.description}
							<p class="mt-2 text-sm text-gray-800">{item.description}</p>
						{/if}
						{#if item.provenance.length || item.programArea.length}
							<div class="mt-3 flex flex-wrap gap-1.5">
								{#each item.programArea as tag}
									<span class="rounded-full bg-gray-800/10 px-2 py-0.5 text-xs text-gray-800">{tag}</span>
								{/each}
								{#each item.provenance as person}
									<span class="rounded-full bg-white/40 px-2 py-0.5 text-xs text-gray-700">{person}</span>
								{/each}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</main>

<style>
	.forest {
		background-color: #b7c2a4;
		background-image:
			/* cloud mottle — soft uneven pigment/fiber density (light + dark blotches) */
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='700' height='700'%3E%3Cfilter id='c'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.012' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='linear' slope='0.7' intercept='-0.2'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='700' height='700' filter='url(%23c)' opacity='0.22'/%3E%3C/svg%3E"),
			/* tooth — cold-press speckle grain (white) */
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='260' height='260'%3E%3Cfilter id='t'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.16' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1 0 0 0 0'/%3E%3C/filter%3E%3Crect width='260' height='260' filter='url(%23t)' opacity='0.1'/%3E%3C/svg%3E"),
			/* fine fiber grain (white) */
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1 0 0 0 0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23f)' opacity='0.08'/%3E%3C/svg%3E");
	}
</style>
