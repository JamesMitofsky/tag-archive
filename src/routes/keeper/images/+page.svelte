<script lang="ts">
	import BackButton from '$lib/components/BackButton.svelte';
	import KeeperList from '$lib/components/KeeperList.svelte';
	import OptimizedImage from '$lib/components/OptimizedImage.svelte';
	import ImageSquareIcon from 'phosphor-svelte/lib/ImageSquareIcon';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import { imageSetLabel } from '$lib/images/label';
	import { morphVar } from '$lib/transitions.svelte';
	import { formatSetMeta, withoutTitleLine } from './format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * What a row prints. A set has no title, so its label borrows the event, the
	 * description's first line or the count (see imageSetLabel); whichever it
	 * borrowed isn't printed a second time beneath it.
	 */
	const rows = $derived(
		data.sets.map((set) => {
			const label = imageSetLabel(set);
			return {
				...set,
				label,
				meta: formatSetMeta(set, label),
				blurb: withoutTitleLine(set.description, label)
			};
		})
	);

	// Client-side search over the loaded sets — every list here gets a filter.
	let query = $state('');
	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return rows;
		return rows.filter((row) =>
			[row.label, row.meta, row.description, row.date]
				.filter(Boolean)
				.some((field) => field!.toLowerCase().includes(q))
		);
	});

	// Persist the search text across back navigation (e.g. open a set, then
	// return). SvelteKit restores this after the page remounts; the list rides the
	// page scroll, so native scroll restoration handles position.
	export const snapshot = {
		capture: () => query,
		restore: (value: string) => (query = value)
	};

	// Frosted glass, borrowed from the keeper searchbar.
	const glassInput =
		'w-full rounded-lg border border-white/40 bg-white/25 text-base text-gray-800 shadow-sm backdrop-blur-md placeholder:text-gray-600 focus:border-white/60 focus:bg-white/35 focus:ring-1 focus:ring-white/50 focus:outline-none';
</script>

<svelte:head>
	<title>Images · Cloud Keeper · TAG Archive</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8 flex items-start justify-between gap-4">
			<div>
				<h1 class="text-2xl font-semibold tracking-tight text-[#14120f]">Images</h1>
				<BackButton class="mt-2" />
			</div>
			<a
				href="/contribute/images"
				aria-label="Add photographs"
				title="Add photographs"
				class="rounded-full border border-white/40 bg-white/25 p-2.5 text-gray-700 shadow-sm backdrop-blur-md transition hover:bg-white/40 hover:text-gray-900"
			>
				<PlusIcon size={20} />
			</a>
		</header>

		<!-- Search filters the loaded sets in place. -->
		<div class="relative">
			<MagnifyingGlassIcon
				size={18}
				class="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-gray-500"
			/>
			<label class="sr-only" for="image-search">Search images</label>
			<input
				id="image-search"
				type="search"
				bind:value={query}
				class="py-3 pr-3 pl-10 {glassInput}"
			/>
		</div>

		<section class="mt-4">
			{#if data.sets.length === 0}
				<p
					class="mt-3 rounded-lg border border-dashed border-white/60 p-6 text-center text-sm text-gray-700"
				>
					No photographs yet — add the first ones above.
				</p>
			{:else if filtered.length === 0}
				<p
					class="mt-3 rounded-lg border border-dashed border-white/60 p-6 text-center text-sm text-gray-700"
				>
					No images match “{query}”.
				</p>
			{:else}
				<!-- Only visible rows mount; the list rides the page scroll. -->
				<KeeperList items={filtered} estimatedItemHeight={130} getKey={(item) => item.id}>
					{#snippet row(item, i)}
						<!-- KeeperList can render a row index the search just filtered away, for
						     one frame before it re-counts; there is nothing to show for it. -->
						{#if item}
							<!-- py-2 doubles as the inter-card gap (measured), px-2 leaves shadow room. -->
							<div class="px-2 py-2">
								<!-- Each set is its own page, scattered ever so slightly like loose paper. -->
								<article
									style:view-transition-name={morphVar('image', item.id)}
									class="relative flex items-start gap-4 rounded-sm bg-white/95 p-4 text-gray-900 shadow-xl ring-1 ring-black/5 transition hover:shadow-2xl
								{i % 2 === 0 ? '-rotate-[0.35deg]' : 'rotate-[0.4deg]'}"
								>
									<!-- The first photograph stands in for the set, cropped square so rows line up. -->
									{#if item.cover}
										<OptimizedImage
											src={item.cover.url}
											alt=""
											width={item.cover.width}
											height={item.cover.height}
											sizes="5rem"
											widths={[80, 160, 240]}
											class="size-20 shrink-0 rounded-sm bg-gray-100 object-cover ring-1 ring-black/5"
										/>
									{:else}
										<div
											class="flex size-20 shrink-0 items-center justify-center rounded-sm bg-gray-50 text-gray-400 ring-1 ring-black/5"
										>
											<ImageSquareIcon size={28} />
										</div>
									{/if}

									<div class="min-w-0 flex-1">
										<div class="flex items-start justify-between gap-3">
											<!-- Stretched link: the ::after overlay makes the whole card open the set. -->
											<h3 class="min-w-0 font-medium break-words">
												<a
													href="/keeper/images/{item.id}"
													class="after:absolute after:inset-0 after:z-[1]"
												>
													{item.label}
												</a>
											</h3>
											{#if item.proposedAddition}
												<!-- Contributor submission awaiting a keeper's vetting; amber flags attention. -->
												<span
													class="relative z-[2] shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-amber-800 ring-1 ring-amber-200"
												>
													Proposed addition
												</span>
											{/if}
										</div>
										<p
											style:view-transition-name={morphVar('image', item.id, 'meta')}
											class="mt-0.5 text-sm text-gray-500"
										>
											{item.meta}
										</p>
										{#if item.blurb}
											<p
												class="mt-2 line-clamp-2 text-sm break-words whitespace-pre-line text-gray-800"
											>
												{item.blurb}
											</p>
										{/if}
									</div>
								</article>
							</div>
						{/if}
					{/snippet}
				</KeeperList>
			{/if}
		</section>
	</div>
</main>
