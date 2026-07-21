<script lang="ts">
	import BackButton from '$lib/components/BackButton.svelte';
	import ReviewActions from '$lib/components/ReviewActions.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Review series · Cloud Keeper · TAG Archive</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8">
			<BackButton />
			<h1 class="mt-3 text-2xl font-semibold tracking-tight text-[#14120f]">Review series</h1>
			<p class="mt-1 text-sm text-gray-600">
				{data.series.length}
				{data.series.length === 1 ? 'series' : 'series'} awaiting approval.
			</p>
		</header>

		<section>
			{#if data.series.length === 0}
				<p
					class="rounded-lg border border-dashed border-white/60 p-6 text-center text-sm text-gray-700"
				>
					No series awaiting review.
				</p>
			{:else}
				<ul class="space-y-4">
					{#each data.series as item, i (item.id)}
						<li
							class="relative rounded-sm bg-white/95 p-4 text-gray-900 shadow-xl ring-1 ring-black/5
							{i % 2 === 0 ? '-rotate-[0.35deg]' : 'rotate-[0.4deg]'}"
						>
							<h3 class="font-medium break-words">{item.name}</h3>
							{#if item.frequency || item.defaultDayOfWeek || item.defaultTime}
								<p class="mt-0.5 text-sm text-gray-500">
									{[item.frequency, item.defaultDayOfWeek, item.defaultTime]
										.filter(Boolean)
										.join(' · ')}
								</p>
							{/if}
							{#if item.description}
								<p class="mt-2 text-sm break-words whitespace-pre-line text-gray-800">
									{item.description}
								</p>
							{/if}
							<ReviewActions id={item.id} />
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</main>
