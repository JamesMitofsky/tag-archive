<script lang="ts">
	import { enhance } from '$app/forms';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import AsyncComboField from '#lib/components/AsyncComboField.svelte';
	import ImageUploader from '#lib/components/ImageUploader.svelte';
	import { Textarea } from '#lib/components/ui/textarea/index.ts';
	import {
		createImageSetSuite,
		parseImageSetForm,
		type ImageSetCreateValues
	} from '#lib/validation/imageSet.ts';
	import { createValidator } from '#lib/validation/client.svelte.ts';
	import FieldError from '#lib/components/FieldError.svelte';
	import UnsavedChangesGuard from '#lib/components/UnsavedChangesGuard.svelte';

	// The new-image-set form, shared by the public /contribute/images page and
	// the keeper-only /keeper/images/new. Each page posts to its own
	// `?/createImageSet` action, which decides what becomes of the submission;
	// this component only collects and validates the fields.
	//
	// Each photograph uploads as soon as it is picked (see ImageUploader); the
	// form submits only their ids.
	let {
		form,
		imageIds = $bindable([])
	}: {
		/** The page's action data, for any error and echoed values from a failed submit. */
		form: Record<string, unknown> | null | undefined;
		/**
		 * The finished uploads' ids in display order, as the uploader emits them.
		 * Bindable so a page can still count them once the form has gone (the
		 * public thank-you says "photograph" or "photographs").
		 */
		imageIds?: number[];
	} = $props();

	// The uploader always mounts empty, so the ids start empty with it. A page
	// that remounts this form without navigating (the public thank-you, then a
	// link back to the same form) would otherwise still hold the last set's ids,
	// and submit them without a photograph on screen.
	imageIds = [];

	// Isomorphic validation: the same vest suite runs here for live, per-field
	// feedback and on the server as the authority. `errors` seeds field messages
	// from a no-JS submit until the browser re-validates.
	const errors = $derived(
		form && 'errors' in form && form.errors ? (form.errors as Record<string, string[]>) : {}
	);
	const validator = createValidator(createImageSetSuite(), () => errors);
	let formEl = $state<HTMLFormElement>();
	function revalidate() {
		if (formEl) validator.run(parseImageSetForm(new FormData(formEl)));
	}
	function markTouched(event: FocusEvent) {
		const target = event.target as HTMLInputElement | null;
		if (target?.name) validator.touch(target.name);
		revalidate();
	}

	const imageSetError = $derived(
		form && 'imageSetError' in form ? (form.imageSetError as string | undefined) : undefined
	);
	// Kit flattens the action-data union, so restore the echoed values' shape.
	const echoed = $derived(
		form && 'values' in form && form.values ? (form.values as ImageSetCreateValues) : undefined
	);

	// Each id rides along as its own hidden field. Not seeded from echoed values:
	// the uploader keeps its photographs across a failed submit by itself, and an
	// id it isn't showing must never be submitted unseen.
	// The hidden fields render after this changes, so re-validate once they have.
	$effect(() => {
		void imageIds;
		revalidate();
	});

	// Bound, so a refusal that echoes no values (a lapsed pass, say) can't reset
	// what was typed. Seeded from any echoed value left by a failed submit.
	// svelte-ignore state_referenced_locally
	let description = $state(echoed?.description ?? '');

	// True while any photograph is still uploading.
	let uploading = $state(false);
	// How many photographs failed to upload, waiting to be tried again or removed.
	let failedUploads = $state(0);
	// True while the form submit action is processing.
	let submitting = $state(false);

	// Block submit until a photograph is in and every one has arrived: a set
	// saved mid-upload, or past a failed one, would quietly leave those out.
	const canSubmit = $derived(imageIds.length > 0 && !uploading && failedUploads === 0);

	// Ink button, same graphite tone as the landing handwriting.
	const inkButton = 'bg-[#14120f] text-white transition hover:bg-[#33302a]';
</script>

<UnsavedChangesGuard form={formEl} />
<form
	class="mt-6 space-y-5"
	method="POST"
	action="?/createImageSet"
	bind:this={formEl}
	oninput={revalidate}
	onfocusout={markTouched}
	use:enhance={({ formData, cancel }) => {
		// The button waits for uploads, but an Enter key press in a field
		// doesn't ask it.
		if (uploading || failedUploads > 0) {
			cancel();
			return;
		}
		validator.revealAll();
		if (!validator.run(parseImageSetForm(formData))) {
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
	{#each imageIds as id (id)}
		<input type="hidden" name="imageIds" value={id} />
	{/each}
	<!-- A new set's date always follows its photographs. -->
	<input type="hidden" name="dateAuto" value="on" />

	<div>
		<ImageUploader
			label="Photographs"
			required
			bind:pending={uploading}
			bind:failed={failedUploads}
			onChange={(ids) => {
				imageIds = ids;
				validator.touch('imageIds');
			}}
		/>
		<p class="mt-1 text-xs text-gray-500">
			No need to add a date — it’s read from the photographs themselves.
		</p>
		<FieldError message={validator.error('imageIds')} />
	</div>

	<div>
		<AsyncComboField
			name="event"
			label="Event"
			placeholder="Search or add an event"
			value={echoed?.event ?? ''}
		/>
		<FieldError message={validator.error('event')} />
	</div>

	<div>
		<label for="description" class="block text-sm font-medium text-gray-700"> Description </label>
		<Textarea
			id="description"
			name="description"
			rows={3}
			maxlength={2000}
			placeholder="Planting day, muddy boots and all"
			bind:value={description}
			class="mt-1.5"
		/>
		<FieldError message={validator.error('description')} />
	</div>

	{#if imageSetError && Object.keys(errors).length === 0}
		<FieldError message={imageSetError} class="mt-0" />
	{/if}

	<!-- Why the button is held, beside it: the uploader's own alert may be
	     scrolled well out of view on a phone. -->
	{#if failedUploads > 0}
		<p id="failed-uploads" class="font-friendly text-sm text-gray-700">
			{failedUploads === 1
				? '1 photograph wasn’t uploaded. Try it again, or remove it,'
				: `${failedUploads} photographs weren’t uploaded. Try them again, or remove them,`}
			before adding to the archive.
		</p>
	{/if}

	<button
		type="submit"
		disabled={!canSubmit || submitting}
		aria-busy={submitting}
		aria-describedby={failedUploads > 0 ? 'failed-uploads' : undefined}
		class="flex w-full items-center justify-center gap-2 rounded-sm py-3 text-base font-medium disabled:cursor-not-allowed disabled:opacity-50 {inkButton}"
	>
		{#if submitting}
			<CircleNotchIcon size={18} class="shrink-0 animate-spin" />
		{:else}
			<PlusIcon size={18} />
		{/if}
		<!-- Not "Add photographs": that is the uploader's own button, which
		     picks files rather than submitting them. -->
		Add to the archive
	</button>
</form>
