<script lang="ts">
	import { page } from '$app/state';
	import { formatArtefactDate } from '#lib/formatDate.ts';
	import ArtefactId from '#lib/components/ArtefactId.svelte';
	import BackButton from '#lib/components/BackButton.svelte';
	import ArchiveNumber from '#lib/components/ArchiveNumber.svelte';
	import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon';
	import PaperclipIcon from 'phosphor-svelte/lib/PaperclipIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import OptimizedImage from '#lib/components/OptimizedImage.svelte';
	import { isImageUrl } from '#lib/fileType.ts';
	import { programAreaMeta } from '#lib/programAreas.ts';
	import { morphName } from '#lib/transitions.svelte.ts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const item = $derived(data.artefact);

	// The create form redirects here with `?created`: the keeper has the physical
	// item in hand and needs its archive number to write on it.
	const justCreated = $derived(page.url.searchParams.has('created'));

	// Images embed; anything else falls back to a plain link.
	const isImage = isImageUrl;
</script>

<svelte:head>
	<title>{item.artefact} · Cloud Keeper</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8 flex items-start justify-between gap-4">
			<div>
				<h1 class="text-2xl font-semibold tracking-tight break-words text-[#14120f]">
					{item.artefact}
				</h1>
				<BackButton class="mt-2" />
			</div>
			{#if data.user.role === 'admin'}
				<a
					href="/keeper/artefacts/{item.id}/edit"
					aria-label="Edit {item.artefact}"
					title="Edit artefact"
					class="inline-flex shrink-0 items-center rounded-full border border-white/40 bg-white/25 p-2 text-sm text-gray-700 shadow-sm backdrop-blur-md transition hover:bg-white/40 hover:text-gray-900"
				>
					<PencilSimpleIcon size={18} />
				</a>
			{/if}
		</header>

		<!-- The artefact as its own sheet of paper, matching the create form. -->
		<article
			style="view-transition-name:{morphName('artefact', item.id)}"
			class="rounded-sm bg-white/95 p-6 text-gray-900 shadow-xl ring-1 ring-black/5 sm:p-8"
		>
			{#if justCreated}
				<ArchiveNumber id={item.id}>
					<p class="text-sm font-medium">Added to the archive.</p>
					<p class="mt-0.5 text-sm text-gray-600">
						Write this number on the item so the two can be matched up again.
					</p>
				</ArchiveNumber>
				<!-- The next item is usually already in hand: straight to a fresh form. -->
				<a
					href="/keeper/artefacts/new"
					class="mt-3 mb-6 flex w-full items-center justify-center gap-2 rounded-sm bg-[#14120f] py-3 text-base font-medium text-white transition hover:bg-[#33302a]"
				>
					<ArrowCounterClockwiseIcon size={18} />
					Submit another
				</a>
			{/if}

			<p
				style="view-transition-name:{morphName('artefact', item.id)}-meta"
				class="text-sm text-gray-500"
			>
				<ArtefactId id={item.id} />
				· {formatArtefactDate(item.date)}{#if item.event}
					· {item.event}{/if}
			</p>

			{#if item.programArea.length > 0}
				<div
					style="view-transition-name:{morphName('artefact', item.id)}-tags"
					class="mt-4 flex flex-wrap gap-1.5"
				>
					{#each item.programArea as area (area)}
						{@const Icon = programAreaMeta(area).icon}
						<span
							class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs {programAreaMeta(
								area
							).pill}"
						>
							<Icon size={13} weight="fill" />
							{area}
						</span>
					{/each}
				</div>
			{/if}

			{#if item.description}
				<p class="mt-5 text-base break-words whitespace-pre-line text-gray-800">
					{item.description}
				</p>
			{/if}

			{#if item.fileUrls.length > 0}
				<div class="mt-6 space-y-4">
					{#each item.fileUrls as url, i (url)}
						{#if isImage(url)}
							<OptimizedImage
								src={url}
								alt={item.fileUrls.length > 1
									? `${item.artefact} (${i + 1} of ${item.fileUrls.length})`
									: item.artefact}
								sizes="(min-width: 768px) 42rem, 100vw"
								class="w-full rounded-sm ring-1 ring-black/5"
							/>
						{:else}
							<a
								href={url}
								target="_blank"
								rel="noopener"
								class="inline-flex items-center gap-1 text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline"
							>
								<PaperclipIcon size={14} />
								Open file
							</a>
						{/if}
					{/each}
				</div>
			{/if}

			<dl class="mt-6 space-y-3 border-t border-gray-200 pt-5 text-sm">
				{#if item.provenance.length > 0}
					<div class="flex flex-wrap gap-x-2">
						<dt class="font-medium text-gray-500">Provenance</dt>
						<dd class="text-gray-800">{item.provenance.join(', ')}</dd>
					</div>
				{/if}
				{#if item.location}
					<div class="flex flex-wrap gap-x-2">
						<dt class="font-medium text-gray-500">Location</dt>
						<dd class="text-gray-800">{item.location}</dd>
					</div>
				{/if}
			</dl>
		</article>
	</div>
</main>
