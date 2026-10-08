<!--
	The archive's front gate. Without an access pass every page lands here: the
	archive opens to people in the garden, by tapping the tag there with a phone
	(see src/routes/t). Deliberately no link to /keeper — keepers know the way.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';

	// iOS opens a tapped tag's link in a new Safari tab, so this tab may be left
	// behind while the visitor is let in elsewhere. When it comes back into view,
	// re-run the load: with a pass now in hand, it moves on to the archive.
	onMount(() => {
		const recheck = () => {
			if (document.visibilityState === 'visible') invalidateAll();
		};
		document.addEventListener('visibilitychange', recheck);
		return () => document.removeEventListener('visibilitychange', recheck);
	});
</script>

<svelte:head>
	<title>TAG Archive</title>
</svelte:head>

<main class="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
	<div class="relative z-10 max-w-md px-8 py-10 text-center text-gray-900">
		<h1 class="font-friendly text-4xl font-medium tracking-tight text-gray-800">
			Visit the Cube to open the archive
		</h1>
	</div>
</main>
