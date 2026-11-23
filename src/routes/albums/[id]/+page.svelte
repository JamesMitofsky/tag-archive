<!--
	One album's player: its tracks in order, in the same player the garden
	meditation uses (see AlbumPlayer). The album comes from the public dataset
	the album cloud already fetched, so arriving from there costs no request,
	and a shared link fetches it once like any public page.
-->
<script lang="ts">
	import { page } from '$app/state';
	import AlbumPlayer from '#lib/components/AlbumPlayer.svelte';
	import BackButton from '#lib/components/BackButton.svelte';
	import type { PublicAlbum } from '#lib/albums/types.ts';
	import { formatDate } from '#lib/formatDate.ts';
	import { loadAlbums } from '#lib/dataset.ts';

	let album = $state<PublicAlbum | null>(null);
	let status = $state<'loading' | 'ready' | 'missing' | 'failed'>('loading');

	const id = $derived(Number(page.params.id));

	$effect(() => {
		const wanted = id;
		status = 'loading';
		album = null;
		let cancelled = false;
		loadAlbums().then(
			(albums) => {
				if (cancelled) return;
				album = albums.find((a) => a.id === wanted) ?? null;
				status = album ? 'ready' : 'missing';
			},
			() => {
				if (!cancelled) status = 'failed';
			}
		);
		return () => {
			cancelled = true;
		};
	});

	const playerTracks = $derived(
		(album?.tracks ?? []).map((t, i) => ({
			key: t.id,
			number: i + 1,
			title: t.title,
			url: t.url,
			duration: t.duration
		}))
	);
	const details = $derived(
		album ? [album.event, album.date && formatDate(album.date)].filter(Boolean).join(' · ') : ''
	);
</script>

<svelte:head>
	<title>{album ? `${album.title} · TAG Archive` : 'Album · TAG Archive'}</title>
</svelte:head>

<main
	class="mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 px-4 pt-chrome pb-16 md:pt-24"
>
	<BackButton />

	{#if status === 'ready' && album}
		{#key album.id}
			<AlbumPlayer
				title={album.title}
				artist={album.artist}
				tracks={playerTracks}
				storageKey="album:{album.id}:position"
			/>
		{/key}

		{#if details || album.description}
			<section
				aria-label="About this album"
				class="rounded-2xl bg-white/30 px-6 py-4 text-gray-900 shadow-lg ring-1 ring-white/50 backdrop-blur-md"
			>
				{#if details}
					<p class="text-xs text-gray-600">{details}</p>
				{/if}
				{#if album.description}
					<p class="mt-2 text-sm leading-relaxed break-words whitespace-pre-line text-gray-800">
						{album.description}
					</p>
				{/if}
			</section>
		{/if}
	{:else if status === 'missing' || status === 'failed'}
		<p
			class="rounded-2xl bg-white/30 px-6 py-5 text-sm text-gray-800 shadow-lg ring-1 ring-white/50 backdrop-blur-md"
		>
			{status === 'missing'
				? 'This album isn’t in the archive. It may have been removed.'
				: 'The archive could not be reached. Check your connection and try again.'}
		</p>
	{/if}
</main>
