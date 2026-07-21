<script lang="ts">
	import { enhance } from '$app/forms';
	import BackButton from '$lib/components/BackButton.svelte';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import { PROGRAM_AREAS, PROGRAM_AREA_META } from '$lib/programAreas';
	import DateField from '$lib/components/DateField.svelte';
	import ComboField from '$lib/components/ComboField.svelte';
	import AsyncComboField from '$lib/components/AsyncComboField.svelte';
	import TagsField from '$lib/components/TagsField.svelte';
	import PageScanner from '$lib/components/PageScanner.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { createArtefactSuite, parseArtefactForm } from '$lib/validation/artefact';
	import { createValidator } from '$lib/validation/client.svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import type { ArtefactFormValues } from './+page.server';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Kit flattens the action-data union, so restore the echoed values' shape.
	const echoed = $derived(
		form && 'values' in form && form.values ? (form.values as ArtefactFormValues) : undefined
	);
	const artefactError = $derived(form && 'artefactError' in form ? form.artefactError : undefined);
	const errors = $derived(
		form && 'errors' in form && form.errors ? (form.errors as Record<string, string[]>) : {}
	);

	// Isomorphic validation: same vest suite here (live, per-field) and on the server.
	const validator = createValidator(createArtefactSuite(), () => errors);
	let formEl = $state<HTMLFormElement>();
	function revalidate() {
		if (formEl) validator.run(parseArtefactForm(new FormData(formEl)));
	}
	function markTouched(event: FocusEvent) {
		const target = event.target as HTMLInputElement | null;
		if (target?.name) validator.touch(target.name);
		revalidate();
	}

	// Seed each field from a failed submit's echoed values, else the loaded artefact.
	// svelte-ignore state_referenced_locally
	const seed = form && 'values' in form && form.values ? (form.values as ArtefactFormValues) : null;

	// Live form date, tracked so the event list can prioritise events near it.
	// svelte-ignore state_referenced_locally
	let formDate = $state(seed ? seed.date : (data.artefact.date ?? ''));

	// Program-area picker state (multi-select — an artefact carries several).
	// svelte-ignore state_referenced_locally
	let selectedAreas = $state<string[]>(seed ? seed.programArea : [...data.artefact.programArea]);

	// Provenance tags — seed from the echoed (comma-separated) value or the artefact.
	// svelte-ignore state_referenced_locally
	let provenanceTags = $state<string[]>(
		seed
			? seed.provenance
					.split(',')
					.map((name) => name.trim())
					.filter(Boolean)
			: [...data.artefact.provenance]
	);

	// Location: preset options, but the combobox also accepts a typed-in custom value.
	const LOCATION_OPTIONS = ['Binder', 'Bin'];

	// The attached scans' public URLs. Seeded from the echoed values or the artefact.
	// svelte-ignore state_referenced_locally
	let fileUrls = $state<string[]>(seed ? seed.fileUrls : [...data.artefact.fileUrls]);

	// Title is the only required field; track it so submit can gate on it.
	// svelte-ignore state_referenced_locally
	let title = $state(seed ? seed.artefact : data.artefact.artefact);

	// True while an image upload is in flight.
	let scanPending = $state(false);
	// True while update or delete actions are processing.
	let submitting = $state(false);
	let deleting = $state(false);

	// Block submit until required fields are filled and any upload is finalized.
	const canSubmit = $derived(title.trim().length > 0 && formDate.trim().length > 0 && !scanPending);

	// Combos, tags, and the program-area cards mutate state without always firing a
	// bubbling input event, so re-validate whenever any tracked field changes.
	$effect(() => {
		void [title, formDate, selectedAreas, provenanceTags, fileUrls];
		revalidate();
	});

	// Ink button, same graphite tone as the landing handwriting.
	const inkButton = 'bg-[#14120f] text-white transition hover:bg-[#33302a]';
</script>

<svelte:head>
	<title>Edit {data.artefact.artefact} · Cloud Keeper</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8 flex flex-col items-start gap-3">
			<BackButton />
		</header>

		<!-- The edit form is a sheet of paper, like the artefact pages. -->
		<section class="rounded-sm bg-white/95 p-6 shadow-xl ring-1 ring-black/5">
			<h1 class="mb-6 text-2xl font-semibold tracking-tight text-gray-900">Edit artefact</h1>
			<form
				method="POST"
				action="?/updateArtefact"
				class="space-y-5"
				bind:this={formEl}
				oninput={revalidate}
				onfocusout={markTouched}
				use:enhance={({ formData, cancel }) => {
					validator.revealAll();
					if (!validator.run(parseArtefactForm(formData))) {
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
				<div>
					<label for="artefact" class="block text-sm font-medium text-gray-700">
						Title <span class="text-red-600" title="Required" aria-label="required">*</span>
					</label>
					<Input
						id="artefact"
						name="artefact"
						type="text"
						required
						maxlength={200}
						autocomplete="off"
						bind:value={title}
						placeholder="Symphonic Steep Program"
						class="mt-1.5"
					/>
					<FieldError message={validator.error('artefact')} />
				</div>

				<!-- Images attach right below the title; each URL rides along as its own hidden field. -->
				{#each fileUrls as url (url)}
					<input type="hidden" name="fileUrls" value={url} />
				{/each}

				<PageScanner
					bind:pending={scanPending}
					initial={data.artefact.fileUrls}
					onChange={(urls) => {
						fileUrls = urls;
						revalidate();
					}}
				/>
				<FieldError message={validator.error('fileUrls')} />

				<div>
					<AsyncComboField
						name="event"
						label="Event"
						placeholder="Search or add an event"
						endpoint="/keeper/events/titles"
						date={formDate}
						value={echoed?.event ?? data.artefact.event ?? ''}
					/>
					<FieldError message={validator.error('event')} />
				</div>

				<div>
					<DateField
						name="date"
						label="Date"
						required
						value={echoed?.date ?? data.artefact.date ?? ''}
						onChange={(iso) => {
							formDate = iso;
							validator.touch('date');
							revalidate();
						}}
					/>
					<FieldError message={validator.error('date')} />
				</div>

				<fieldset>
					<legend class="block text-sm font-medium text-gray-700">Program areas</legend>
					<!-- Unconventional multiselect: each area is a near-square landscape card that
					     toggles a hidden checkbox. Card carries the area's colour identity; a primary
					     ring + check badge signals selection. -->
					<div class="mt-1.5 grid grid-cols-2 gap-3 sm:grid-cols-3">
						{#each PROGRAM_AREAS as area (area)}
							{@const meta = PROGRAM_AREA_META[area]}
							{@const Icon = meta.icon}
							{@const selected = selectedAreas.includes(area)}
							<label
								class="relative flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg p-2 text-center text-white transition select-none {meta.accent} {selected
									? 'shadow-md ring-2 ring-white/80'
									: 'opacity-75 hover:opacity-40'}"
							>
								<input
									type="checkbox"
									name="programArea"
									value={area}
									bind:group={selectedAreas}
									class="sr-only"
								/>
								{#if selected}
									<CheckCircleIcon size={18} weight="fill" class="absolute top-1.5 right-1.5" />
								{/if}
								<Icon size={36} weight="fill" />
								<span class="text-xs font-medium">{area}</span>
							</label>
						{/each}
					</div>
					<FieldError message={validator.error('programArea')} />
				</fieldset>

				<div>
					<TagsField
						name="provenance"
						label="Provenance"
						placeholder="Johnny B. Good"
						bind:value={provenanceTags}
					/>
					<p class="mt-1 text-xs text-gray-500">Press Enter to add</p>
					<FieldError message={validator.error('provenance')} />
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
						placeholder="Another day full of dancing and trees"
						value={echoed?.description ?? data.artefact.description ?? ''}
						class="mt-1.5"
					/>
					<FieldError message={validator.error('description')} />
				</div>

				<div>
					<ComboField
						name="location"
						label="Location"
						placeholder="Search or add a location"
						options={LOCATION_OPTIONS}
						value={echoed?.location ?? data.artefact.location ?? ''}
					/>
					<FieldError message={validator.error('location')} />
				</div>

				{#if artefactError && Object.keys(errors).length === 0}
					<p class="text-sm text-red-600 font-friendly" role="alert">{artefactError}</p>
				{/if}

				<button
					type="submit"
					disabled={!canSubmit || submitting || deleting}
					aria-busy={submitting}
					class="flex w-full items-center justify-center gap-2 rounded-sm py-3 text-base font-medium disabled:cursor-not-allowed disabled:opacity-50 {inkButton}"
				>
					{#if submitting}
						<CircleNotchIcon size={18} class="animate-spin shrink-0" />
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
					action="?/deleteArtefact"
					use:enhance={({ cancel }) => {
						if (!confirm(`Delete "${data.artefact.artefact}"? This cannot be undone.`)) {
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
						aria-label="Delete {data.artefact.artefact}"
						title="Delete artefact"
						class="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-2 text-sm text-gray-500 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if deleting}
							<CircleNotchIcon size={18} class="animate-spin shrink-0" />
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
