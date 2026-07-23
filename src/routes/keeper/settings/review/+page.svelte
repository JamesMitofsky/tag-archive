<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import ArchiveIcon from 'phosphor-svelte/lib/ArchiveIcon';
	import CalendarBlankIcon from 'phosphor-svelte/lib/CalendarBlankIcon';
	import StackIcon from 'phosphor-svelte/lib/StackIcon';
	import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRightIcon';
	import type { Component } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// One row per reviewable kind, with its pending tally shown low-emphasis.
	const sections: { href: string; label: string; icon: Component; count: number }[] = $derived([
		{
			href: '/keeper/settings/review/artefacts',
			label: 'Artefacts',
			icon: ArchiveIcon,
			count: data.pending.artefacts
		},
		{
			href: '/keeper/settings/review/events',
			label: 'Events',
			icon: CalendarBlankIcon,
			count: data.pending.events
		},
		{
			href: '/keeper/settings/review/series',
			label: 'Series',
			icon: StackIcon,
			count: data.pending.series
		}
	]);

	const total = $derived(data.pending.artefacts + data.pending.events + data.pending.series);
</script>

<svelte:head>
	<title>Review · Cloud Keeper · TAG Archive</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8">
			<h1 class="text-2xl font-semibold tracking-tight text-[#14120f]">Review</h1>
			<p class="mt-1 text-sm text-gray-600">
				Contributor submissions awaiting a keeper's approval. Approve to add them to the archive, or
				reject to discard.
			</p>
			<Breadcrumbs class="mt-2" />
		</header>

		<article class="rounded-sm bg-white/95 p-6 text-gray-900 shadow-xl ring-1 ring-black/5 sm:p-8">
			{#if total === 0}
				<p class="text-sm text-gray-600">Nothing awaiting review. All caught up.</p>
			{/if}
			<div class="space-y-3">
				{#each sections as section (section.href)}
					{@const Icon = section.icon}
					<a
						href={section.href}
						class="flex items-center justify-between gap-3 rounded-sm border border-gray-200 px-4 py-3 text-sm text-gray-800 transition hover:bg-gray-50"
					>
						<span class="flex items-center gap-2">
							<Icon size={18} />
							{section.label}
							<!-- Pending count next to the label, low emphasis per the pill convention. -->
							{#if section.count > 0}
								<span
									class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200"
								>
									{section.count}
								</span>
							{:else}
								<span class="text-xs text-gray-400">0</span>
							{/if}
						</span>
						<ArrowRightIcon size={18} class="text-gray-400" />
					</a>
				{/each}
			</div>
		</article>
	</div>
</main>
