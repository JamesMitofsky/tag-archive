<script lang="ts">
	import { enhance } from '$app/forms';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import { PROGRAM_AREAS, PROGRAM_AREA_META } from '$lib/programAreas';
	import DateField from '$lib/components/DateField.svelte';
	import ComboField from '$lib/components/ComboField.svelte';
	import AsyncComboField from '$lib/components/AsyncComboField.svelte';
	import TagsField from '$lib/components/TagsField.svelte';
	import PageScanner from '$lib/components/PageScanner.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import {
		createArtefactSuite,
		parseArtefactForm,
		type ArtefactFormValues
	} from '$lib/validation/artefact';
	import { createValidator } from '$lib/validation/client.svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import UnsavedChangesGuard from '$lib/components/UnsavedChangesGuard.svelte';

	// The new-artefact form, shared by the public /contribute page and the
	// keeper-only /keeper/artefacts/new. Each page posts to its own
	// `?/createArtefact` action, which decides what becomes of the submission;
	// this component only collects and validates the fields.
	let {
		form,
		requireLocation,
		locations
	}: {
		/** The page's action data, for any error and echoed values from a failed submit. */
		form: Record<string, unknown> | null | undefined;
		/** Keepers record where the physical item is kept; the public may not know. */
		requireLocation: boolean;
		/** Previously used storage locations, offered alongside the presets. */
		locations: string[];
	} = $props();

	// Kit flattens the action-data union, so restore the echoed values' shape.
	const echoed = $derived(
		form && 'values' in form && form.values ? (form.values as ArtefactFormValues) : undefined
	);
	// Fields that keep client state are seeded once, from whatever a failed
	// submit echoed: their state survives an enhanced re-render on its own.
	// svelte-ignore state_referenced_locally
	const seed = form && 'values' in form && form.values ? (form.values as ArtefactFormValues) : null;
	const artefactError = $derived(
		form && 'artefactError' in form ? (form.artefactError as string | undefined) : undefined
	);

	// Isomorphic validation: the same vest suite runs here for live, per-field
	// feedback and on the server as the authority. `errors` seeds field messages
	// from a no-JS submit until the browser re-validates.
	const errors = $derived(
		form && 'errors' in form && form.errors ? (form.errors as Record<string, string[]>) : {}
	);
	// svelte-ignore state_referenced_locally
	const validator = createValidator(createArtefactSuite({ requireLocation }), () => errors);
	let formEl = $state<HTMLFormElement>();
	function revalidate() {
		if (formEl) validator.run(parseArtefactForm(new FormData(formEl)));
	}
	function markTouched(event: FocusEvent) {
		const target = event.target as HTMLInputElement | null;
		if (target?.name) validator.touch(target.name);
		revalidate();
	}
	// Combos, tags, and the program-area cards mutate state without always firing a
	// bubbling input event, so re-validate whenever any tracked field changes.
	$effect(() => {
		void [title, formDate, location, selectedAreas, provenanceTags, fileUrls];
		revalidate();
	});

	// Program-area picker state (multi-select — an artefact carries several).
	let selectedAreas = $state<string[]>(seed ? [...seed.programArea] : []);

	// Provenance tags, seeded from the echoed (comma-separated) value.
	let provenanceTags = $state<string[]>(
		seed
			? seed.provenance
					.split(',')
					.map((name) => name.trim())
					.filter(Boolean)
			: []
	);

	// Live form date, tracked so the event list can prioritise events near it.
	let formDate = $state(seed ? seed.date : '');

	// Location: preset options merged with any previously-typed values from the DB,
	// case-insensitively deduped and alphabetised. The combobox also accepts a
	// typed-in custom value, so new locations save on submit and resurface here next load.
	const LOCATION_PRESETS = ['Binder', 'Bin'];
	const locationOptions = $derived(
		Array.from(
			new Map([...LOCATION_PRESETS, ...locations].map((v) => [v.toLowerCase(), v])).values()
		).sort((a, b) => a.localeCompare(b))
	);

	// The uploaded images' public URLs, set by the page scanner as scans are added.
	let fileUrls = $state<string[]>(seed ? [...seed.fileUrls] : []);

	// Title, tracked so submit can gate on it.
	let title = $state(seed ? seed.artefact : '');

	// Location, tracked for the submit gate: ComboField writes back through its
	// hidden input on submit, but the gate needs a live value before that.
	let location = $state(seed ? seed.location : '');

	// True while an image upload is in flight.
	let scanPending = $state(false);
	// True while the form submit action is processing.
	let submitting = $state(false);

	// Block submit until required fields are filled, an image is attached, and any upload is finalized.
	const canSubmit = $derived(
		title.trim().length > 0 &&
			formDate.trim().length > 0 &&
			(!requireLocation || location.trim().length > 0) &&
			fileUrls.length > 0 &&
			!scanPending
	);

	// Ink button, same graphite tone as the landing handwriting.
	const inkButton = 'bg-[#14120f] text-white transition hover:bg-[#33302a]';
</script>

<UnsavedChangesGuard form={formEl} />
<form
	class="mt-6 space-y-5"
	method="POST"
	action="?/createArtefact"
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

	<div>
		<DateField
			name="date"
			label="Date"
			required
			allowPartial
			allowUndated
			value={echoed?.date ?? ''}
			onChange={(iso) => {
				formDate = iso;
				validator.touch('date');
				revalidate();
			}}
		/>
		<FieldError message={validator.error('date')} />
	</div>

	<!-- Images attach right below the title; each URL rides along as its own hidden field. -->
	{#each fileUrls as url (url)}
		<input type="hidden" name="fileUrls" value={url} />
	{/each}

	<PageScanner
		label="Images"
		required
		bind:pending={scanPending}
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
			date={formDate}
			value={echoed?.event ?? ''}
		/>
		<FieldError message={validator.error('event')} />
	</div>

	<fieldset>
		<legend class="block text-sm font-medium text-gray-700">Program areas</legend>
		<!-- Unconventional multiselect: each area is a compact card that
		     toggles a hidden checkbox. Card carries the area's color identity; a primary
		     ring + check badge signals selection. -->
		<div class="mt-1.5 grid grid-cols-2 gap-3 sm:grid-cols-3">
			{#each PROGRAM_AREAS as area (area)}
				{@const meta = PROGRAM_AREA_META[area]}
				{@const Icon = meta.icon}
				{@const selected = selectedAreas.includes(area)}
				<label
					class="relative flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg px-2 py-3 text-center text-white transition select-none {meta.accent} {selected
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
			prefetch
			bind:value={provenanceTags}
		/>
		<p class="mt-1 text-xs text-gray-500">Press Enter to add</p>
		<FieldError message={validator.error('provenance')} />
	</div>

	<div>
		<label for="description" class="block text-sm font-medium text-gray-700"> Description </label>
		<Textarea
			id="description"
			name="description"
			rows={3}
			maxlength={2000}
			placeholder="Another day full of dancing and trees"
			value={echoed?.description ?? ''}
			class="mt-1.5"
		/>
		<FieldError message={validator.error('description')} />
	</div>

	<div>
		<ComboField
			name="location"
			label={requireLocation ? 'Archival storage location *' : 'Archival storage location'}
			placeholder="Search or add a location"
			options={locationOptions}
			bind:value={location}
		/>
		<FieldError message={validator.error('location')} />
	</div>

	{#if artefactError && Object.keys(errors).length === 0}
		<p class="font-friendly text-sm text-red-600" role="alert">{artefactError}</p>
	{/if}

	<button
		type="submit"
		disabled={!canSubmit || submitting}
		aria-busy={submitting}
		class="flex w-full items-center justify-center gap-2 rounded-sm py-3 text-base font-medium disabled:cursor-not-allowed disabled:opacity-50 {inkButton}"
	>
		{#if submitting}
			<CircleNotchIcon size={18} class="shrink-0 animate-spin" />
		{:else}
			<PlusIcon size={18} />
		{/if}
		Add artefact
	</button>
</form>
