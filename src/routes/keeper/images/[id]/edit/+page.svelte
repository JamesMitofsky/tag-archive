<script lang="ts">
	import { dateFieldValue } from '$lib/partialDate';
	import { enhance } from '$app/forms';
	import { formatArtefactDate } from '$lib/formatDate';
	import BackButton from '$lib/components/BackButton.svelte';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import DateField from '$lib/components/DateField.svelte';
	import AsyncComboField from '$lib/components/AsyncComboField.svelte';
	import ImageUploader from '$lib/components/ImageUploader.svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import { imageSetLabel } from '$lib/images/label';
	import { createImageSetSuite, parseImageSetForm } from '$lib/validation/imageSet';
	import { createValidator } from '$lib/validation/client.svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import UnsavedChangesGuard from '$lib/components/UnsavedChangesGuard.svelte';
	import type { ImageSetFormValues } from './+page.server';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Kit flattens the action-data union, so restore the echoed values' shape.
	const echoed = $derived(
		form && 'values' in form && form.values ? (form.values as ImageSetFormValues) : undefined
	);
	const setError = $derived(form && 'setError' in form ? form.setError : undefined);
	const errors = $derived(
		form && 'errors' in form && form.errors ? (form.errors as Record<string, string[]>) : {}
	);

	// The set's name wherever this page needs one (it has no title of its own).
	const label = $derived(imageSetLabel(data.set));

	// Isomorphic validation: same vest suite here (live, per-field) and on the server.
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

	// Seed each field from a failed submit's echoed values, else the loaded set.
	// svelte-ignore state_referenced_locally
	const seed = form && 'values' in form && form.values ? (form.values as ImageSetFormValues) : null;

	// What the form submits as `imageIds`, in order. Seeded from the set itself:
	// the uploader only reports a change, never what it started with.
	// svelte-ignore state_referenced_locally
	let imageIds = $state<number[]>(data.set.images.map((image) => image.id));

	// Whether the date follows the photographs or was set by hand.
	// svelte-ignore state_referenced_locally
	let dateAuto = $state(seed ? seed.dateAuto : data.set.dateAuto);

	// The hand-set date, kept while the checkbox is on so turning it off again
	// brings the last pick back. While the date follows the photographs this
	// starts from the date shown read-only, ready to be taken over. An echo is
	// empty when the field was off at submit, hence `||`.
	// svelte-ignore state_referenced_locally
	const initialDate = seed?.date || dateFieldValue(dateAuto ? data.photographDate : data.set.date);
	let formDate = $state(initialDate);

	// True while a photograph is still uploading.
	let uploading = $state(false);
	// True while update or delete actions are processing.
	let submitting = $state(false);
	let deleting = $state(false);

	// Hold the save until every photograph is in, there is at least one, and a
	// hand-set date has an answer ("No date" counts as one).
	const canSubmit = $derived(
		!uploading && imageIds.length > 0 && (dateAuto || formDate.trim().length > 0)
	);

	// The uploader and the date picker change state without a bubbling input
	// event, so re-validate whenever any of them changes.
	$effect(() => {
		void [imageIds, dateAuto, formDate];
		revalidate();
	});

	// Ink button, same graphite tone as the landing handwriting.
	const inkButton = 'bg-[#14120f] text-white transition hover:bg-[#33302a]';
</script>

<svelte:head>
	<title>Edit {label} · Cloud Keeper</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<!-- Off while deleting: the redirect afterwards isn't leaving edits behind. -->
	<UnsavedChangesGuard form={formEl} enabled={!deleting} />
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<!-- The edit form is a sheet of paper, like the set's own page. -->
		<BackButton class="mb-6" />

		<section class="rounded-sm bg-white/95 p-6 shadow-xl ring-1 ring-black/5">
			<h1 class="mb-6 text-2xl font-semibold tracking-tight text-gray-900">Edit image set</h1>
			<form
				method="POST"
				action="?/updateImageSet"
				class="space-y-5"
				bind:this={formEl}
				oninput={revalidate}
				onfocusout={markTouched}
				use:enhance={({ formData, cancel }) => {
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
				<!-- Each photograph rides along as its own hidden field, in display order. -->
				{#each imageIds as id (id)}
					<input type="hidden" name="imageIds" value={id} />
				{/each}

				<!-- Removing a photograph that was already in the set only takes effect on
				     save, when the server deletes it; until then leaving undoes it. -->
				<div>
					<ImageUploader
						label="Photographs"
						required
						initial={data.set.images}
						bind:pending={uploading}
						onChange={(ids) => {
							imageIds = ids;
							validator.touch('imageIds');
						}}
					/>
					<FieldError message={validator.error('imageIds')} />
				</div>

				<div>
					<label for="description" class="block text-sm font-medium text-gray-700">
						Description
					</label>
					<Textarea
						id="description"
						name="description"
						rows={3}
						maxlength={2000}
						placeholder="Planting day, muddy boots and all"
						value={echoed?.description ?? data.set.description ?? ''}
						class="mt-1.5"
					/>
					<FieldError message={validator.error('description')} />
				</div>

				<div>
					<AsyncComboField
						name="event"
						label="Event"
						placeholder="Search or add an event"
						date={dateAuto ? (data.photographDate ?? undefined) : formDate}
						value={echoed?.event ?? data.set.event ?? ''}
					/>
					<FieldError message={validator.error('event')} />
				</div>

				<div>
					{#if dateAuto}
						<span class="block text-sm font-medium text-gray-700">Date</span>
						<p
							class="mt-1.5 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800"
						>
							{formatArtefactDate(data.photographDate)}
						</p>
					{/if}
					<!-- Kept mounted while the date follows the photographs, so a hand-set
					     pick survives toggling. A disabled fieldset submits nothing. -->
					<fieldset disabled={dateAuto} hidden={dateAuto}>
						<DateField
							name="date"
							label="Date"
							required
							allowPartial
							allowUndated
							value={initialDate}
							onChange={(iso) => {
								formDate = iso;
								validator.touch('date');
							}}
						/>
					</fieldset>
					<label class="mt-3 flex items-center gap-2 text-sm text-gray-700">
						<input
							type="checkbox"
							name="dateAuto"
							bind:checked={dateAuto}
							class="size-4 shrink-0 accent-[#14120f]"
						/>
						Date follows the photographs
					</label>
					<p class="mt-1 text-xs text-gray-500">
						{#if dateAuto}
							The earliest day any of them was taken, worked out again when you save.
						{:else}
							Set by hand: it stays as it is when the photographs change.
						{/if}
					</p>
					<FieldError message={validator.error('date')} />
				</div>

				{#if setError && Object.keys(errors).length === 0}
					<p class="font-friendly text-sm text-red-600" role="alert">{setError}</p>
				{/if}

				<button
					type="submit"
					disabled={!canSubmit || submitting || deleting}
					aria-busy={submitting}
					class="flex w-full items-center justify-center gap-2 rounded-sm py-3 text-base font-medium disabled:cursor-not-allowed disabled:opacity-50 {inkButton}"
				>
					{#if submitting}
						<CircleNotchIcon size={18} class="shrink-0 animate-spin" />
					{:else}
						<CheckIcon size={18} />
					{/if}
					Save changes
				</button>
			</form>

			<!-- Delete lives on the edit view only; its own form so it doesn't submit the edits. -->
			<div class="mt-6 flex justify-end border-t border-gray-200 pt-5">
				<form
					method="POST"
					action="?/deleteImageSet"
					use:enhance={({ cancel }) => {
						// The photographs go with the set: say how many, unless the label already does.
						const count = imageSetLabel({ count: data.set.images.length });
						const what = label === count ? count : `"${label}" and its ${count}`;
						if (!confirm(`Delete ${what}? This cannot be undone.`)) {
							cancel();
							return;
						}
						deleting = true;
						return async ({ update }) => {
							await update();
							deleting = false;
						};
					}}
				>
					<button
						type="submit"
						disabled={deleting || submitting}
						aria-busy={deleting}
						aria-label="Delete {label}"
						title="Delete image set"
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
			</div>
		</section>
	</div>
</main>
