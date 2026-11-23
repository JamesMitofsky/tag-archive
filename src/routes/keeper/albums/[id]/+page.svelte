<script lang="ts">
	import { page } from '$app/state';
	import AlbumPlayer from '#lib/components/AlbumPlayer.svelte';
	import BackButton from '#lib/components/BackButton.svelte';
	import ReviewActions from '#lib/components/ReviewActions.svelte';
	import DownloadSimpleIcon from 'phosphor-svelte/lib/DownloadSimpleIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import { albumParticulars, formatClock } from '#lib/albums/format.ts';
	import { AUDIO_TYPE_NAMES } from '#lib/audioType.ts';
	import { formatFileSize } from '#lib/fileSize.ts';
	import { morphName } from '#lib/transitions.svelte.ts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const album = $derived(data.album);
	const meta = $derived(albumParticulars(album));
	const justCreated = $derived(page.url.searchParams.has('created'));
	const isAdmin = $derived(data.user.role === 'admin');

	// Keyed on the album: the player reads its tracks once, when it mounts.
	const playerTracks = $derived(
		album.tracks.map((t, i) => ({
			key: t.id,
			number: i + 1,
			title: t.title,
			url: t.url,
			duration: t.duration
		}))
	);
</script>

<svelte:head>
	<title>{album.title} · Cloud Keeper</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8 flex items-start justify-between gap-4">
			<div class="min-w-0">
				<h1 class="text-2xl font-semibold tracking-tight break-words text-[#14120f]">
					{album.title}
				</h1>
				<BackButton class="mt-2" />
			</div>
			{#if isAdmin}
				<a
					href="/keeper/albums/{album.id}/edit"
					aria-label="Edit {album.title}"
					title="Edit album"
					class="inline-flex shrink-0 items-center rounded-full border border-white/40 bg-white/25 p-2 text-sm text-gray-700 shadow-sm backdrop-blur-md transition hover:bg-white/40 hover:text-gray-900"
				>
					<PencilSimpleIcon size={18} />
				</a>
			{/if}
		</header>

		<article
			style="view-transition-name:{morphName('album', album.id)}"
			class="rounded-sm bg-white/95 p-6 text-gray-900 shadow-xl ring-1 ring-black/5 sm:p-8"
		>
			{#if justCreated}
				<div role="status" class="mb-6 rounded-sm border border-dashed border-gray-400 p-4">
					<p class="text-sm font-medium">Added to the archive.</p>
					<p class="mt-0.5 text-sm text-gray-600">
						{#if album.proposedAddition}
							It awaits a keeper's approval before it appears in the public archive.
						{:else}
							It now appears in the public archive.
						{/if}
					</p>
				</div>
			{/if}

			<div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
				<div class="min-w-0">
					{#if album.artist}
						<p class="text-base break-words text-gray-800">{album.artist}</p>
					{/if}
					<p
						style="view-transition-name:{morphName('album', album.id)}-meta"
						class="text-sm text-gray-500"
					>
						{meta}
					</p>
				</div>
				{#if album.proposedAddition}
					<span
						class="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-amber-800 ring-1 ring-amber-200"
					>
						Proposed addition
					</span>
				{/if}
			</div>

			{#if album.proposedAddition && isAdmin}
				<ReviewActions id={album.id} />
			{/if}

			{#if album.description}
				<p class="mt-5 text-base break-words whitespace-pre-line text-gray-800">
					{album.description}
				</p>
			{/if}

			<h2 class="mt-8 text-sm font-medium text-gray-700">Files</h2>
			<ol class="mt-2 divide-y divide-gray-100 text-sm">
				{#each album.tracks as t, i (t.id)}
					<li class="flex items-start gap-3 py-2">
						<span class="w-6 shrink-0 text-right text-xs text-gray-500 tabular-nums">{i + 1}</span>
						<div class="min-w-0 flex-1">
							<p class="break-words text-gray-900">{t.title}</p>
							<p class="text-xs break-words text-gray-500">
								{[
									t.duration != null ? formatClock(t.duration) : null,
									AUDIO_TYPE_NAMES[t.type],
									formatFileSize(t.bytes),
									t.originalName
								]
									.filter(Boolean)
									.join(' · ')}
							</p>
						</div>
						<a
							href={t.url}
							target="_blank"
							rel="noopener"
							title="Download {t.title}"
							aria-label="Download {t.title}"
							class="shrink-0 rounded-sm p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
						>
							<DownloadSimpleIcon size={16} />
						</a>
					</li>
				{/each}
			</ol>
		</article>

		<!-- Listen as visitors will, whether or not it is public yet. -->
		<div class="mt-8">
			{#key album.id}
				<AlbumPlayer
					title={album.title}
					artist={album.artist}
					tracks={playerTracks}
					storageKey="keeper-album:{album.id}:position"
				/>
			{/key}
		</div>
	</div>
</main>
