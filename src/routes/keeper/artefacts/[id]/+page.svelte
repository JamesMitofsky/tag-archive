<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { formatArtefactDate } from '$lib/formatDate';
	import ArtefactId from '$lib/components/ArtefactId.svelte';
	import BackButton from '$lib/components/BackButton.svelte';
	import CopyButton from '$lib/components/CopyButton.svelte';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import PaperclipIcon from 'phosphor-svelte/lib/PaperclipIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import OptimizedImage from '$lib/components/OptimizedImage.svelte';
	import { isImageUrl } from '$lib/fileType';
	import { programAreaMeta } from '$lib/programAreas';
	import { morphName } from '$lib/transitions.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const item = $derived(data.artefact);

	// Until a keeper confirms the archive number is written on the physical item,
	// the page keeps asking — however they arrived, and however long ago it was
	// added. The create form lands here with `?created`, item still in hand.
	const needsNumber = $derived(item.numberConfirmedAt === null);
	const justCreated = $derived(page.url.searchParams.has('created'));

	let confirming = $state(false);

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
			{#if needsNumber}
				<!-- A label to copy onto the item: dashed like a tag, number oversized so it
				     reads from arm's length while writing. It stays until someone confirms. -->
				<section
					aria-labelledby="number-heading"
					class="mb-6 rounded-sm border border-dashed border-gray-400 p-4"
				>
					<h2 id="number-heading" class="text-sm font-medium">
						{justCreated ? 'Added to the archive.' : 'Archive number not yet on the item.'}
					</h2>
					<p class="mt-0.5 text-sm text-gray-600">
						Write this number on the item so the two can be matched up again, then confirm.
					</p>
					<div class="mt-3 flex items-center gap-3">
						<ArtefactId id={item.id} class="text-4xl font-semibold text-[#14120f]" />
						<CopyButton text={String(item.id)} label="Copy archive number" />
					</div>
					<form
						method="POST"
						action="?/confirmNumber"
						class="mt-4"
						use:enhance={() => {
							confirming = true;
							return async ({ update }) => {
								await update();
								confirming = false;
							};
						}}
					>
						{#if form?.confirmError}
							<p class="mb-2 text-sm text-red-600" role="alert">{form.confirmError}</p>
						{/if}
						<button
							type="submit"
							disabled={confirming}
							aria-busy={confirming}
							class="flex w-full items-center justify-center gap-2 rounded-sm bg-[#14120f] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#33302a] disabled:opacity-50 sm:w-auto"
						>
							{#if confirming}
								<CircleNotchIcon size={18} class="shrink-0 animate-spin" />
							{:else}
								<CheckIcon size={18} class="shrink-0" />
							{/if}
							I've written #{item.id} on the item
						</button>
					</form>
				</section>
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
