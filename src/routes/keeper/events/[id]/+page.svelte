<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import LinkIcon from 'phosphor-svelte/lib/LinkIcon';
	import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
	import { morphName } from '$lib/transitions.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const item = $derived(data.event);

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
	<title>{item.title} · Cloud Keeper</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8 flex items-start justify-end gap-4">
			{#if data.user.role === 'admin'}
				<a
					href="/keeper/events/{item.id}/edit"
					aria-label="Edit {item.title}"
					title="Edit event"
					class="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/25 px-3 py-2 text-sm text-gray-700 shadow-sm backdrop-blur-md transition hover:bg-white/40 hover:text-gray-900"
				>
					<PencilSimpleIcon size={18} />
					Edit
				</a>
			{/if}
		</header>

		<Breadcrumbs class="mb-6" />

		<!-- The event as its own sheet of paper, matching the artefact page. -->
		<article
			style="view-transition-name:{morphName('event', item.id)}"
			class="rounded-sm bg-white/95 p-6 text-gray-900 shadow-xl ring-1 ring-black/5 sm:p-8"
		>
			<div class="flex items-start justify-between gap-3">
				<h1
					style="view-transition-name:{morphName('event', item.id)}-title"
					class="text-2xl font-semibold tracking-tight break-words"
				>
					{item.title}
				</h1>
				{#if item.series}
					<!-- Series banner: low emphasis, marks this as one of several connected events. -->
					<a
						href="/keeper/series/{item.seriesId}"
						style="view-transition-name:{morphName('event', item.id)}-tags"
						class="inline-flex shrink-0 items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600 transition hover:bg-gray-200"
						title="Part of the “{item.series}” series"
					>
						{item.series}
					</a>
				{/if}
			</div>

			<p
				style="view-transition-name:{morphName('event', item.id)}-meta"
				class="mt-1 text-sm text-gray-500"
			>
				{formatDate(item.date)}{#if item.time}
					· {item.time}{/if}{#if item.location}
					· {item.location}{/if}
			</p>

			{#if item.mayHaveException}
				<div class="mt-4 flex items-start gap-1.5 text-sm text-amber-700">
					<WarningIcon size={16} weight="fill" class="mt-0.5 shrink-0" />
					<span>{item.possibleExceptionDescription ?? 'Flagged for review'}</span>
				</div>
			{/if}

			{#if item.description}
				<p class="mt-5 text-base break-words whitespace-pre-line text-gray-800">
					{item.description}
				</p>
			{/if}

			<dl class="mt-6 space-y-3 border-t border-gray-200 pt-5 text-sm">
				{#if item.hosts.length > 0}
					<div class="flex flex-wrap gap-x-2">
						<dd class="text-gray-800">{item.hosts.join(', ')}</dd>
					</div>
				{/if}
				{#if item.url}
					<div class="flex flex-wrap gap-x-2">
						<dt class="font-medium text-gray-500">Source</dt>
						<dd>
							<a
								href={item.url}
								target="_blank"
								rel="noopener"
								class="inline-flex items-center gap-1 text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline"
							>
								<LinkIcon size={14} />
								Open link
							</a>
						</dd>
					</div>
				{/if}
			</dl>
		</article>
	</div>
</main>
