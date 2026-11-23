<script lang="ts">
	import { enhance } from '$app/forms';
	import AlbumForm from '#lib/components/AlbumForm.svelte';
	import BackButton from '#lib/components/BackButton.svelte';
	import FieldError from '#lib/components/FieldError.svelte';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import { trackCount } from '#lib/albums/format.ts';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// The album's version as this page loaded it, read once: both forms act on
	// what the page shows, and a later reload of `data` must not quietly move
	// them onto an album nobody has looked at.
	// svelte-ignore state_referenced_locally
	const loadedVersion = data.album.version;

	let deleting = $state(false);
	// A refused delete answers with the same `albumError` the save form shows;
	// said beside the delete button instead when it came from there.
	let deleteError = $state<string | undefined>();
</script>

<svelte:head>
	<title>Edit {data.album.title} · Cloud Keeper</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<BackButton class="mb-6" />

		<section class="rounded-sm bg-white/95 p-6 shadow-xl ring-1 ring-black/5">
			<h1 class="mb-6 text-2xl font-semibold tracking-tight text-gray-900">Edit album</h1>
			<AlbumForm
				form={deleteError ? null : form}
				action="?/updateAlbum"
				initial={data.album}
				initialTracks={data.album.tracks}
				version={loadedVersion}
				submitLabel="Save changes"
				guard={!deleting}
				busy={deleting}
			/>

			<!-- Delete lives on the edit view only; its own form so it doesn't submit the edits. -->
			<div class="mt-6 flex flex-col items-end gap-2 border-t border-gray-200 pt-5">
				<form
					method="POST"
					action="?/deleteAlbum"
					use:enhance={({ cancel }) => {
						const what = `"${data.album.title}" and its ${trackCount(data.album.tracks.length)}`;
						if (!confirm(`Delete ${what}? This cannot be undone.`)) {
							cancel();
							return;
						}
						deleting = true;
						deleteError = undefined;
						return async ({ result, update }) => {
							if (result.type === 'failure') {
								deleteError = String(result.data?.albumError ?? 'The album could not be deleted.');
								deleting = false;
								return;
							}
							await update();
							deleting = false;
						};
					}}
				>
					<!-- Deletes only the album as this page shows it (see the save form's version). -->
					<input type="hidden" name="version" value={loadedVersion} />
					<button
						type="submit"
						disabled={deleting}
						aria-busy={deleting}
						aria-label="Delete {data.album.title}"
						title="Delete album"
						class="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-2 text-sm text-gray-500 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if deleting}
							<CircleNotchIcon size={18} class="shrink-0 animate-spin" />
						{:else}
							<TrashIcon size={18} />
						{/if}
						Delete
					</button>
				</form>
				{#if deleteError}
					<FieldError message={deleteError} class="mt-0" />
				{/if}
			</div>
		</section>
	</div>
</main>
