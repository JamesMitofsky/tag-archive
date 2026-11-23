<script lang="ts">
	import type { PublicAlbum } from '#lib/albums/types.ts';
	import { formatClock, formatTotal, totalDuration, trackCount } from '#lib/albums/format.ts';
	import { formatDate } from '#lib/formatDate.ts';
	import { loadAlbums } from '#lib/dataset.ts';
	import { filterAlbums } from '#lib/search.ts';
	import CardCloud from '#lib/components/CardCloud.svelte';
	import CardSheet from '#lib/components/CardSheet.svelte';
	import Drawing from '#lib/components/Drawing.svelte';
	import PlayIcon from 'phosphor-svelte/lib/PlayIcon';

	/** Track titles a closed card has room for; opened, it lists them all. */
	const CLOSED_TRACKS = 4;

	function particulars(album: PublicAlbum): string {
		const total = totalDuration(album.tracks.map((t) => t.duration));
		return [trackCount(album.tracks.length), total != null ? formatTotal(total) : null]
			.filter(Boolean)
			.join(' · ');
	}
</script>

<CardCloud
	load={loadAlbums}
	filter={filterAlbums}
	dateOf={(item) => item.date}
	ariaLabel="Search albums"
	card={sheet}
	{placeholderMark}
/>

{#snippet placeholderMark()}
	<!-- Typeset until its drawing is added at this path (see Drawing). -->
	<Drawing
		src="/drawing/text/albums.webp"
		alt=""
		aria-hidden="true"
		text="Albums"
		textClass="text-xl text-gray-600"
		class="h-7 w-auto"
	/>
{/snippet}

<!-- An album is a sheet of paper like an artefact: its title, who and when, and
     its tracklist where an artefact has its first page. Opened, it lists every
     track and leads on to the player. -->
{#snippet sheet(item: PublicAlbum, isOpen: boolean)}
	<CardSheet
		title={item.title}
		meta={[item.artist, item.event, item.date && formatDate(item.date), particulars(item)]}
		description={item.description}
		lines={isOpen ? 6 : 2}
	>
		{#snippet media()}
			<div
				class="my-2 flex min-h-0 flex-1 flex-col text-[clamp(0.5625rem,5.42cqi,0.7rem)] text-gray-700"
			>
				{#if isOpen}
					<!-- Only while open: a closed card is itself a button. -->
					<a
						href="/albums/{item.id}"
						class="mb-2 inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-gray-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-gray-700"
					>
						<PlayIcon size={14} weight="fill" /> Listen
					</a>
				{/if}
				<ol class="min-h-0 flex-1 space-y-0.5 {isOpen ? 'overflow-y-auto' : 'overflow-hidden'}">
					{#each isOpen ? item.tracks : item.tracks.slice(0, CLOSED_TRACKS) as t, i (t.id)}
						<li class="flex gap-1.5">
							<span class="w-[2.5ch] shrink-0 text-right text-gray-400 tabular-nums">{i + 1}</span>
							<span class="min-w-0 flex-1 truncate">{t.title}</span>
							{#if isOpen && t.duration != null}
								<span class="shrink-0 text-gray-400 tabular-nums">{formatClock(t.duration)}</span>
							{/if}
						</li>
					{/each}
				</ol>
				{#if !isOpen && item.tracks.length > CLOSED_TRACKS}
					<p class="mt-0.5 shrink-0 text-gray-400">
						+{item.tracks.length - CLOSED_TRACKS} more
					</p>
				{/if}
			</div>
		{/snippet}
	</CardSheet>
{/snippet}
