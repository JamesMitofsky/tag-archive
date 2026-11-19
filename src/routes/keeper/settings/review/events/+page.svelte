<script lang="ts">
	import BackButton from '$lib/components/BackButton.svelte';
	import ReviewActions from '$lib/components/ReviewActions.svelte';
	import OptimizedImage from '$lib/components/OptimizedImage.svelte';
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
			<h1 class="text-2xl font-semibold tracking-tight text-[#14120f]">Review events</h1>
			<p class="mt-1 text-sm text-gray-600">
				{data.events.length}
				{data.events.length === 1 ? 'event' : 'events'} awaiting approval.
			</p>
			<BackButton class="mt-2" />
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
								{#if item.date}{formatDate(item.date)}{/if}{#if item.time}
									· {item.time}{/if}{#if item.series}
									· {item.series}{/if}
							</p>
							{#if item.location}
								<p class="mt-0.5 text-sm text-gray-500">{item.location}</p>
							{/if}
							{#if item.featureImage}
								{@const feature = item.featureImage}
								<figure class="mt-3">
									<OptimizedImage
										src={feature.url}
										alt={item.title}
										width={feature.width ?? undefined}
										height={feature.height ?? undefined}
										sizes="(max-width: 672px) calc(100vw - 4rem), 576px"
										class="max-h-64 w-full rounded-sm bg-gray-50 object-contain"
									/>
									<figcaption class="mt-1.5 text-xs text-gray-500">
										Feature image from
										<a
											href={feature.source.kind === 'artefact'
												? `/keeper/artefacts/${feature.source.artefactId}`
												: `/keeper/images/${feature.source.setId}`}
											class="underline-offset-2 hover:text-gray-900 hover:underline"
											>{feature.source.kind === 'artefact' ? 'the artefact' : 'the photographs'}
											“{feature.source.label}”</a
										>{#if feature.source.proposed}<span class="text-amber-700"
												>, which is awaiting review too. The image shows publicly only once that is
												approved as well.</span
											>{/if}
									</figcaption>
								</figure>
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
