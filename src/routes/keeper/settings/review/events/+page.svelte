<script lang="ts">
	import BackButton from '$lib/components/BackButton.svelte';
	import ReviewActions from '$lib/components/ReviewActions.svelte';
	import { formatDate } from '$lib/formatDate';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Review events · Cloud Keeper · TAG Archive</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8">
			<BackButton href="/keeper/settings/review" ariaLabel="Back to Review" />
			<h1 class="mt-3 text-2xl font-semibold tracking-tight text-[#14120f]">Review events</h1>
			<p class="mt-1 text-sm text-gray-600">
				{data.events.length}
				{data.events.length === 1 ? 'event' : 'events'} awaiting approval.
			</p>
		</header>

		<section>
			{#if data.events.length === 0}
				<p
					class="rounded-lg border border-dashed border-white/60 p-6 text-center text-sm text-gray-700"
				>
					No events awaiting review.
				</p>
			{:else}
				<ul class="space-y-4">
					{#each data.events as item, i (item.id)}
						<li
							class="relative rounded-sm bg-white/95 p-4 text-gray-900 shadow-xl ring-1 ring-black/5
							{i % 2 === 0 ? '-rotate-[0.35deg]' : 'rotate-[0.4deg]'}"
						>
							<h3 class="font-medium break-words">
								<a href="/keeper/events/{item.id}" class="underline-offset-2 hover:underline">
									{item.title}
								</a>
							</h3>
							<p class="mt-0.5 text-sm text-gray-500">
								{#if item.date}{formatDate(
										item.date
									)}{/if}{#if item.time}{' · '}{item.time}{/if}{#if item.series}{' · '}{item.series}{/if}
							</p>
							{#if item.location}
								<p class="mt-0.5 text-sm text-gray-500">{item.location}</p>
							{/if}
							{#if item.description}
								<p class="mt-2 text-sm break-words whitespace-pre-line text-gray-800">
									{item.description}
								</p>
							{/if}
							{#if item.hosts.length > 0}
								<p class="mt-2 text-sm text-gray-500">{item.hosts.join(', ')}</p>
							{/if}
							<ReviewActions id={item.id} />
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</main>
