<!--
	Unlisted audio player for the garden meditation: its chapters, served as
	static files (see ./tracks), through the same player every album in the
	archive uses (see AlbumPlayer).
-->
<script lang="ts">
	import AlbumPlayer from '#lib/components/AlbumPlayer.svelte';
	import { playerTracks } from './tracks';

	const PAGE_TITLE = 'Garden Meditation';
</script>

<svelte:head>
	<title>{PAGE_TITLE}</title>
	<meta name="robots" content="noindex, nofollow, noarchive" />
</svelte:head>

<main class="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pt-chrome pb-16 md:pt-24">
	<!-- The key is the one this page saved the listener's place under before the
	     player was shared, so nobody loses their place. -->
	<AlbumPlayer
		title={PAGE_TITLE}
		tracks={playerTracks}
		storageKey="meditation-walk:position"
		unit="chapter"
		interludeLabel="Sound bath"
	/>
</main>
