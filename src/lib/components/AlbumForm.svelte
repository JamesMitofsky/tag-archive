<script lang="ts">
	import { enhance } from '$app/forms';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import AsyncComboField from '#lib/components/AsyncComboField.svelte';
	import DateField from '#lib/components/DateField.svelte';
	import FieldError from '#lib/components/FieldError.svelte';
	import TrackUploader from '#lib/components/TrackUploader.svelte';
	import UnsavedChangesGuard from '#lib/components/UnsavedChangesGuard.svelte';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Textarea } from '#lib/components/ui/textarea/index.ts';
	import type { UploadedTrack } from '#lib/albums/types.ts';
	import { dateFieldValue } from '#lib/partialDate.ts';
	import { createValidator } from '#lib/validation/client.svelte.ts';
	import { createAlbumSuite, parseAlbumForm, type AlbumFormValues } from '#lib/validation/album.ts';

	// The album form, shared by /keeper/albums/new and an album's edit page.
	// Each page posts to its own action, which decides what becomes of the
	// album; this only collects and validates the fields. Tracks upload as soon
	// as they are picked (see TrackUploader), which writes the track fields;
	// the rest is the album's own particulars.
	let {
		form,
		action,
		initial = null,
		initialTracks = [],
		version,
		submitLabel,
		guard = true,
		busy = false
	}: {
		/** The page's action data, for any error and echoed values from a failed submit. */
		form: Record<string, unknown> | null | undefined;
		/** The action this form posts to, e.g. `?/createAlbum`. */
		action: string;
		/** The saved album's fields (edit), or null for a new album. */
		initial?: {
			title: string;
			artist: string | null;
			description: string | null;
			event: string | null;
			eventId: number | null;
			date: string | null;
		} | null;
		/** Tracks already in the album (edit). */
		initialTracks?: UploadedTrack[];
		/** The album's version as the edit page loaded it (see `updateAlbum`). */
		version?: number;
		submitLabel: string;
		/** Whether leaving with unsaved changes asks first; off while the page deletes. */
		guard?: boolean;
		/** Something else on the page is writing (a delete): hold the submit. */
		busy?: boolean;
	} = $props();

	// Kit flattens the action-data union, so restore the echoed values' shape.
	// svelte-ignore state_referenced_locally
	const echoed =
		form && 'values' in form && form.values ? (form.values as AlbumFormValues) : undefined;
	const errors = $derived(
		form && 'errors' in form && form.errors ? (form.errors as Record<string, string[]>) : {}
	);
	const albumError = $derived(
		form && 'albumError' in form ? (form.albumError as string | undefined) : undefined
	);

	// Isomorphic validation: same vest suite here (live, per-field) and on the server.
	const validator = createValidator(createAlbumSuite(), () => errors);
	let formEl = $state<HTMLFormElement>();
	function revalidate() {
		if (formEl) validator.run(parseAlbumForm(new FormData(formEl)));
	}
	function markTouched(event: FocusEvent) {
		const target = event.target as HTMLInputElement | null;
		if (target?.name) validator.touch(target.name === 'trackTitles' ? 'tracks' : target.name);
		revalidate();
	}

	// Seeded once, from a failed submit's echo first, else the saved album.
	// svelte-ignore state_referenced_locally
	const start = {
		title: echoed?.title ?? initial?.title ?? '',
		artist: echoed?.artist ?? initial?.artist ?? '',
		description: echoed?.description ?? initial?.description ?? '',
		event: echoed?.event ?? initial?.event ?? '',
		eventId: echoed ? echoed.eventId : (initial?.eventId ?? null),
		date: echoed?.date ?? (initial ? dateFieldValue(initial.date) : '')
	};
	// Bound, so a refusal that echoes nothing can't reset what was typed.
	let title = $state(start.title);
	let artist = $state(start.artist);
	let description = $state(start.description);
	let formDate = $state(start.date);

	// svelte-ignore state_referenced_locally
	let trackIds = $state<number[]>(initialTracks.map((t) => t.id));
	// True while any track is still uploading.
	let uploading = $state(false);
	// How many tracks failed to upload, waiting to be tried again or removed.
	let failedUploads = $state(0);
	let submitting = $state(false);

	// Hold the submit until a track is in and every one has arrived: an album
	// saved mid-upload, or past a failed one, would quietly leave those out.
	const canSubmit = $derived(
		trackIds.length > 0 && !uploading && failedUploads === 0 && title.trim().length > 0
	);

	// The uploader and the date picker change state without a bubbling input
	// event (the uploader's hidden fields render after it reports), so
	// re-validate whenever either changes.
	$effect(() => {
		void [trackIds, formDate];
		revalidate();
	});

	// Ink button, same graphite tone as the landing handwriting.
	const inkButton = 'bg-[#14120f] text-white transition hover:bg-[#33302a]';
</script>

<UnsavedChangesGuard form={formEl} enabled={guard} dirty={uploading} />
<!-- novalidate: every error is revealed at once on submit, not the browser's first bubble. -->
<form
	class="space-y-5"
	method="POST"
	{action}
	novalidate
	bind:this={formEl}
	oninput={revalidate}
	onfocusout={markTouched}
	use:enhance={({ formData, cancel }) => {
		// The button waits for uploads, but an Enter key press in a field doesn't ask it.
		if (uploading || failedUploads > 0 || busy) {
			cancel();
			return;
		}
		validator.revealAll();
		if (!validator.run(parseAlbumForm(formData))) {
			cancel();
			return;
		}
		submitting = true;
		return async ({ update }) => {
			await update();
			submitting = false;
		};
	}}
>
	{#if version !== undefined}
		<!-- The version of the album this page shows: the save is refused once it
		     has moved on, rather than undo what this page never showed. -->
		<input type="hidden" name="version" value={version} />
	{/if}

	<!-- Removing a track already in the album only takes effect on save, when
	     the server deletes it; until then leaving undoes it. -->
	<div>
		<TrackUploader
			label="Tracks"
			required
			initial={initialTracks}
			bind:pending={uploading}
			bind:failed={failedUploads}
			onChange={(ids) => {
				trackIds = ids;
				validator.touch('tracks');
			}}
		/>
		<FieldError message={validator.error('tracks')} />
	</div>

	<div>
		<label for="album-title" class="block text-sm font-medium text-gray-700">
			Title <span class="text-red-600" title="Required" aria-label="required">*</span>
		</label>
		<Input
			id="album-title"
			name="title"
			type="text"
			required
			maxlength={200}
			autocomplete="off"
			bind:value={title}
			placeholder="Songs from the Garden"
			class="mt-1.5"
		/>
		<FieldError message={validator.error('title')} />
	</div>

	<div>
		<label for="album-artist" class="block text-sm font-medium text-gray-700">Artist</label>
		<Input
			id="album-artist"
			name="artist"
			type="text"
			maxlength={200}
			autocomplete="off"
			bind:value={artist}
			placeholder="Who performed it, as the recording credits them"
			class="mt-1.5"
		/>
		<FieldError message={validator.error('artist')} />
	</div>

	<div>
		<AsyncComboField
			name="event"
			label="Event"
			placeholder="Search events"
			date={formDate}
			value={start.event}
			eventId={start.eventId}
		/>
		<FieldError message={validator.error('event')} />
	</div>

	<div>
		<DateField
			name="date"
			label="Date"
			required
			allowPartial
			allowUndated
			value={start.date}
			onChange={(iso) => {
				formDate = iso;
				validator.touch('date');
			}}
		/>
		<FieldError message={validator.error('date')} />
	</div>

	<div>
		<label for="album-description" class="block text-sm font-medium text-gray-700">
			Description
		</label>
		<Textarea
			id="album-description"
			name="description"
			rows={3}
			maxlength={2000}
			placeholder="Recorded live at the summer solstice"
			bind:value={description}
			class="mt-1.5"
		/>
		<FieldError message={validator.error('description')} />
	</div>

	{#if albumError && Object.keys(errors).length === 0}
		<FieldError message={albumError} class="mt-0" />
	{/if}

	<!-- Why the button is held, beside it: the uploader's rows may be scrolled
	     well out of view. -->
	{#if failedUploads > 0}
		<p id="failed-uploads" class="font-friendly text-sm text-gray-700">
			{failedUploads === 1
				? '1 track wasn’t uploaded. Try it again, or remove it,'
				: `${failedUploads} tracks weren’t uploaded. Try them again, or remove them,`}
			before saving.
		</p>
	{:else if uploading}
		<p class="font-friendly text-sm text-gray-700">
			Tracks are still uploading. You can fill in the rest meanwhile.
		</p>
	{/if}

	<button
		type="submit"
		disabled={!canSubmit || submitting || busy}
		aria-busy={submitting}
		aria-describedby={failedUploads > 0 ? 'failed-uploads' : undefined}
		class="flex w-full items-center justify-center gap-2 rounded-sm py-3 text-base font-medium disabled:cursor-not-allowed disabled:opacity-50 {inkButton}"
	>
		{#if submitting}
			<CircleNotchIcon size={18} class="shrink-0 animate-spin" />
		{:else if version !== undefined}
			<CheckIcon size={18} />
		{:else}
			<PlusIcon size={18} />
		{/if}
		{submitLabel}
	</button>
</form>
