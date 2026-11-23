<script lang="ts">
	import AlbumForm from '#lib/components/AlbumForm.svelte';
	import BackButton from '#lib/components/BackButton.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>New album · Cloud Keeper</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<BackButton class="mb-6" />

		<section class="rounded-sm bg-white/95 p-6 shadow-xl ring-1 ring-black/5">
			<h1 class="mb-6 text-2xl font-semibold tracking-tight text-gray-900">New album</h1>
			<AlbumForm {form} action="?/createAlbum" submitLabel="Add to the archive" />
		</section>
	</div>
</main>
