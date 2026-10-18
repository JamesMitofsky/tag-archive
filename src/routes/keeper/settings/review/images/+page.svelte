<script lang="ts">
	import BackButton from '$lib/components/BackButton.svelte';
	import OptimizedImage from '$lib/components/OptimizedImage.svelte';
	import ReviewActions from '$lib/components/ReviewActions.svelte';
	import { imageSetLabel } from '$lib/images/label';
	// The keeper image pages' own wording, so a set reads the same here.
	import { formatSetMeta, withoutTitleLine } from '../../../images/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Review images · Cloud Keeper · TAG Archive</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8">
			<h1 class="text-2xl font-semibold tracking-tight text-[#14120f]">Review images</h1>
			<p class="mt-1 text-sm text-gray-600">
				{data.sets.length}
				{data.sets.length === 1 ? 'image set' : 'image sets'} awaiting approval.
			</p>
			<BackButton class="mt-2" />
		</header>

		<section>
			{#if data.sets.length === 0}
				<p
					class="rounded-lg border border-dashed border-white/60 p-6 text-center text-sm text-gray-700"
				>
					No images awaiting review.
				</p>
			{:else}
				<ul class="space-y-4">
					{#each data.sets as item, i (item.id)}
						{@const label = imageSetLabel(item)}
						{@const description = withoutTitleLine(item.description, label)}
						{@const contact = [item.contactName, item.contactEmail].filter(Boolean).join(', ')}
						<li
							class="relative rounded-sm bg-white/95 p-4 text-gray-900 shadow-xl ring-1 ring-black/5
							{i % 2 === 0 ? '-rotate-[0.35deg]' : 'rotate-[0.4deg]'}"
						>
							<h3 class="font-medium break-words">
								<a href="/keeper/images/{item.id}" class="underline-offset-2 hover:underline">
									{label}
								</a>
							</h3>
							<p class="mt-0.5 text-sm text-gray-500">
								{formatSetMeta(item, label)}
							</p>
							{#if description}
								<p class="mt-2 text-sm break-words whitespace-pre-line text-gray-800">
									{description}
								</p>
							{/if}
							{#if item.thumbnails.length > 0}
								<!-- A glance at the photographs; the set's page has them all, full size. -->
								<div class="mt-3 flex flex-wrap items-center gap-2">
									{#each item.thumbnails as thumbnail, index (thumbnail.id)}
										<OptimizedImage
											src={thumbnail.url}
											alt="Photograph {index + 1}"
											width={thumbnail.width}
											height={thumbnail.height}
											sizes="4rem"
											widths={[64, 128, 192]}
											class="size-16 rounded-sm bg-gray-100 object-cover ring-1 ring-black/5"
										/>
									{/each}
									{#if item.count > item.thumbnails.length}
										<span class="text-xs text-gray-500">
											+{item.count - item.thumbnails.length} more
										</span>
									{/if}
								</div>
							{/if}
							<!-- Who it came from: an anonymous submission has no creator. Joined
							     here, since a block would drop the space before its first word. -->
							<p class="mt-2 text-xs text-gray-500">
								{[
									item.fromKeeper ? 'From a signed-in contributor' : 'From the public',
									contact && `Contact: ${contact}`
								]
									.filter(Boolean)
									.join(' · ')}
							</p>
							<ReviewActions id={item.id} />
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</main>
