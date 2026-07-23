<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import PaperclipIcon from 'phosphor-svelte/lib/PaperclipIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import { programAreaMeta } from '$lib/programAreas';
	import { morphName } from '$lib/transitions.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const item = $derived(data.artefact);

	// Render each file by extension (ignoring any query string); images embed,
	// anything else falls back to a plain link.
	function fileExt(url: string): string {
		const path = url.split('?')[0].split('#')[0];
		return path.slice(path.lastIndexOf('.') + 1).toLowerCase();
	}
	const isImage = (url: string) =>
		['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'].includes(fileExt(url));

	// Render dates like "July 4, 2023"; fall back to raw string if unparseable.
	function formatDate(value: string): string {
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return value;
		return parsed.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}
</script>

<svelte:head>
	<title>{item.artefact} · Cloud Keeper</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8 flex items-start justify-end gap-4">
			{#if data.user.role === 'admin'}
				<a
					href="/keeper/{item.id}/edit"
					aria-label="Edit {item.artefact}"
					title="Edit artefact"
					class="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/25 px-3 py-2 text-sm text-gray-700 shadow-sm backdrop-blur-md transition hover:bg-white/40 hover:text-gray-900"
				>
					<PencilSimpleIcon size={18} />
					Edit
				</a>
			{/if}
		</header>

		<Breadcrumbs class="mb-6" />

		<!-- The artefact as its own sheet of paper, matching the create form. -->
		<article
			style="view-transition-name:{morphName('artefact', item.id)}"
			class="rounded-sm bg-white/95 p-6 text-gray-900 shadow-xl ring-1 ring-black/5 sm:p-8"
		>
			<h1
				style="view-transition-name:{morphName('artefact', item.id)}-title"
				class="text-2xl font-semibold tracking-tight break-words"
			>
				{item.artefact}
			</h1>

			<p
				style="view-transition-name:{morphName('artefact', item.id)}-meta"
				class="mt-1 text-sm text-gray-500"
			>
				{#if item.date}{formatDate(item.date)}{/if}{#if item.event}{#if item.date}
						·
					{/if}{item.event}{/if}
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
							<img
								src={url}
								alt={item.fileUrls.length > 1
									? `${item.artefact} (${i + 1} of ${item.fileUrls.length})`
									: item.artefact}
								class="w-full rounded-sm ring-1 ring-black/5"
								loading="lazy"
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
