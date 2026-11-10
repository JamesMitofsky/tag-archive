<script lang="ts">
	import { page } from '$app/state';
	import BackButton from '$lib/components/BackButton.svelte';
	import OptimizedImage from '$lib/components/OptimizedImage.svelte';
	import DownloadSimpleIcon from 'phosphor-svelte/lib/DownloadSimpleIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import { imageSetLabel, withoutTitleLine } from '$lib/images/label';
	import { morphName } from '$lib/transitions.svelte';
	import { formatCapturedAt, formatFileSize, formatImageType, formatSetMeta } from '../format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const set = $derived(data.set);
	// A set has no title of its own; see imageSetLabel.
	const label = $derived(imageSetLabel(set));
	// The same line the list prints, so the two morph into each other.
	const meta = $derived(formatSetMeta({ ...set, count: set.images.length }, label));
	const description = $derived(withoutTitleLine(set.description, label));

	// The photograph form redirects here with `?created`. Nothing to write on a
	// photograph, unlike an artefact's number: just say it landed, and whether
	// it still has a review ahead of it.
	const justCreated = $derived(page.url.searchParams.has('created'));

	/** Stored metadata, indented for reading. */
	const pretty = (value: unknown) => JSON.stringify(value, null, 2);
</script>

<svelte:head>
	<title>{label} · Cloud Keeper</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8 flex items-start justify-between gap-4">
			<div class="min-w-0">
				<h1 class="text-2xl font-semibold tracking-tight break-words text-[#14120f]">
					{label}
				</h1>
				<BackButton class="mt-2" />
			</div>
			{#if data.user.role === 'admin'}
				<a
					href="/keeper/images/{set.id}/edit"
					aria-label="Edit {label}"
					title="Edit image set"
					class="inline-flex shrink-0 items-center rounded-full border border-white/40 bg-white/25 p-2 text-sm text-gray-700 shadow-sm backdrop-blur-md transition hover:bg-white/40 hover:text-gray-900"
				>
					<PencilSimpleIcon size={18} />
				</a>
			{/if}
		</header>

		<!-- The set as its own sheet of paper, matching the artefact page. -->
		<article
			style="view-transition-name:{morphName('image', set.id)}"
			class="rounded-sm bg-white/95 p-6 text-gray-900 shadow-xl ring-1 ring-black/5 sm:p-8"
		>
			{#if justCreated}
				<!-- Dashed like a tag, as the artefact page's "write this number" note. -->
				<div role="status" class="mb-6 rounded-sm border border-dashed border-gray-400 p-4">
					<p class="text-sm font-medium">Added to the archive.</p>
					<p class="mt-0.5 text-sm text-gray-600">
						{#if set.proposedAddition}
							It awaits a keeper's approval before it appears in the public archive.
						{:else}
							It now appears in the public archive.
						{/if}
					</p>
				</div>
			{/if}

			<div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
				<p
					style="view-transition-name:{morphName('image', set.id)}-meta"
					class="text-sm text-gray-500"
				>
					{meta}
				</p>
				{#if set.proposedAddition}
					<!-- Contributor submission awaiting a keeper's vetting; amber flags attention. -->
					<span
						class="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-amber-800 ring-1 ring-amber-200"
					>
						Proposed addition
					</span>
				{/if}
			</div>

			{#if description}
				<p class="mt-5 text-base break-words whitespace-pre-line text-gray-800">
					{description}
				</p>
			{/if}

			{#if set.images.length > 0}
				<ol class="mt-6 space-y-8">
					{#each set.images as image, i (image.id)}
						<li>
							<figure>
								<!-- width/height reserve the box before the photograph loads. -->
								<OptimizedImage
									src={image.url}
									alt={set.images.length > 1
										? `${label} (${i + 1} of ${set.images.length})`
										: label}
									width={image.width}
									height={image.height}
									sizes="(min-width: 768px) 42rem, 100vw"
									class="h-auto w-full rounded-sm bg-gray-100 ring-1 ring-black/5"
								/>
								<figcaption class="mt-3 space-y-1 text-sm">
									<p class="text-gray-800">
										{#if image.capturedAt}
											Taken {formatCapturedAt(image.capturedAt, image.capturedOffset)}
										{:else}
											<span class="text-gray-500">Date taken not recorded</span>
										{/if}
									</p>
									<p class="text-xs break-words text-gray-500">
										Original: {[
											formatImageType(image.originalType),
											formatFileSize(image.originalBytes),
											image.originalName
										]
											.filter(Boolean)
											.join(' · ')}
									</p>
									<p class="text-xs text-gray-500">
										Display copy: {image.width} × {image.height}
									</p>
									<div class="flex flex-col items-start gap-1.5 pt-1">
										<a
											href={image.originalUrl}
											target="_blank"
											rel="noopener"
											class="inline-flex items-center gap-1 text-xs text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline"
										>
											<DownloadSimpleIcon size={14} />
											Download original
										</a>
										{#if image.metadata}
											<details class="w-full text-xs text-gray-600">
												<summary class="cursor-pointer select-none hover:text-gray-900">
													Photo metadata
												</summary>
												<!-- Keepers only: it can carry GPS and device details. -->
												<pre
													class="mt-2 max-h-80 overflow-auto rounded-sm bg-gray-50 p-3 font-mono text-[11px] leading-snug text-gray-700 ring-1 ring-black/5">{pretty(
														image.metadata
													)}</pre>
											</details>
										{:else}
											<p class="text-xs text-gray-400">No photo metadata recorded</p>
										{/if}
									</div>
								</figcaption>
							</figure>
						</li>
					{/each}
				</ol>
			{/if}
		</article>
	</div>
</main>
