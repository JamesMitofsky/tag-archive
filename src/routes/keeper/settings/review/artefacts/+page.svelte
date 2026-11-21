<script lang="ts">
	import PaperclipIcon from 'phosphor-svelte/lib/PaperclipIcon';
	import BackButton from '#lib/components/BackButton.svelte';
	import OptimizedImage from '#lib/components/OptimizedImage.svelte';
	import ReviewActions from '#lib/components/ReviewActions.svelte';
	import { isImageUrl } from '#lib/fileType.ts';
	import { formatArtefactDate } from '#lib/formatDate.ts';
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
			<BackButton class="mt-2" />
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
								<a href="/keeper/artefacts/{item.id}" class="underline-offset-2 hover:underline">
									{item.artefact}
								</a>
							</h3>
							<p class="mt-0.5 text-sm text-gray-500">
								{formatArtefactDate(item.date)}{#if item.event}
									·
									{item.event}{/if}
							</p>
							{#if item.description}
								<p class="mt-2 text-sm break-words whitespace-pre-line text-gray-800">
									{item.description}
								</p>
							{/if}
							{#if item.fileUrls.length > 0}
								<!-- The scans themselves, at the card's full width: what is being
								     approved has to be legible here, without a trip to the artefact's
								     page. Each opens its original for a closer look. -->
								<div class="mt-3 space-y-3">
									{#each item.fileUrls as url, index (url)}
										{#if isImageUrl(url)}
											<a href={url} target="_blank" rel="noopener" class="block">
												<OptimizedImage
													src={url}
													alt={item.fileUrls.length > 1
														? `${item.artefact} (${index + 1} of ${item.fileUrls.length})`
														: item.artefact}
													sizes="(min-width: 768px) 40rem, 100vw"
													class="w-full rounded-sm bg-gray-100 ring-1 ring-black/5"
												/>
											</a>
										{:else}
											<a
												href={url}
												target="_blank"
												rel="noopener"
												class="inline-flex items-center gap-1 text-sm text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline"
											>
												<PaperclipIcon size={14} />
												Open file
											</a>
										{/if}
									{/each}
								</div>
							{/if}
							{#if item.provenance.length > 0}
								<p class="mt-2 text-sm text-gray-500">{item.provenance.join(', ')}</p>
							{/if}
							<!-- Who it came from: an anonymous submission has no creator. -->
							<p class="mt-2 text-xs text-gray-500">
								{item.createdBy
									? 'From a signed-in contributor'
									: 'From the public'}{#if !item.location}
									· <span class="text-amber-700">No location yet</span>{/if}
							</p>
							<ReviewActions id={item.id} />
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</main>
