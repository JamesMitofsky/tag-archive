<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import ReviewActions from '$lib/components/ReviewActions.svelte';
	import { formatDate } from '$lib/formatDate';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Review artefacts · Cloud Keeper · TAG Archive</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8">
			<h1 class="text-2xl font-semibold tracking-tight text-[#14120f]">Review artefacts</h1>
			<p class="mt-1 text-sm text-gray-600">
				{data.artefacts.length}
				{data.artefacts.length === 1 ? 'artefact' : 'artefacts'} awaiting approval.
			</p>
			<Breadcrumbs class="mt-2" />
		</header>

		<section>
			{#if data.artefacts.length === 0}
				<p
					class="rounded-lg border border-dashed border-white/60 p-6 text-center text-sm text-gray-700"
				>
					No artefacts awaiting review.
				</p>
			{:else}
				<ul class="space-y-4">
					{#each data.artefacts as item, i (item.id)}
						<li
							class="relative rounded-sm bg-white/95 p-4 text-gray-900 shadow-xl ring-1 ring-black/5
							{i % 2 === 0 ? '-rotate-[0.35deg]' : 'rotate-[0.4deg]'}"
						>
							<h3 class="font-medium break-words">
								<a href="/keeper/{item.id}" class="underline-offset-2 hover:underline">
									{item.artefact}
								</a>
							</h3>
							<p class="mt-0.5 text-sm text-gray-500">
								{#if item.date}{formatDate(item.date)}{/if}{#if item.event}{#if item.date}
										·
									{/if}{item.event}{/if}
							</p>
							{#if item.description}
								<p class="mt-2 text-sm break-words whitespace-pre-line text-gray-800">
									{item.description}
								</p>
							{/if}
							{#if item.provenance.length > 0}
								<p class="mt-2 text-sm text-gray-500">{item.provenance.join(', ')}</p>
							{/if}
							<ReviewActions id={item.id} />
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</main>
