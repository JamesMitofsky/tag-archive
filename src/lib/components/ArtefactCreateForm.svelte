<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import { PROGRAM_AREAS, PROGRAM_AREA_META } from '#lib/programAreas.ts';
	import DateField from '#lib/components/DateField.svelte';
	import AsyncComboField from '#lib/components/AsyncComboField.svelte';
	import LocationRadioField from '#lib/components/LocationRadioField.svelte';
	import TagsField from '#lib/components/TagsField.svelte';
	import PageScanner from '#lib/components/PageScanner.svelte';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Textarea } from '#lib/components/ui/textarea/index.ts';
	import {
		createArtefactSuite,
		echoArtefactForm,
		parseArtefactForm,
		type ArtefactFormValues
	} from '#lib/validation/artefact.ts';
	import { createValidator } from '#lib/validation/client.svelte.ts';
	import FieldError from '#lib/components/FieldError.svelte';
	import UnsavedChangesGuard from '#lib/components/UnsavedChangesGuard.svelte';
	import { rememberPeople } from '#lib/rememberedPeople.ts';

	// The new-artefact form, shared by the public /contribute page and the
	// keeper-only /keeper/artefacts/new. Each page posts to its own
	// `?/createArtefact` action, which decides what becomes of the submission;
	// this component only collects and validates the fields.
	let {
		form,
		requireLocation,
		locations,
		people
	}: {
		/** The page's action data, for any error and echoed values from a failed submit. */
		form: Record<string, unknown> | null | undefined;
		/** Keepers record where the physical item is kept; the public may not know. */
		requireLocation: boolean;
		/** Storage locations already in use, offered after the presets. */
		locations: string[];
		/**
		 * Every person's name, for a keeper: they may see unvetted rows, and the
		 * public dataset leaves those names out. Unset, provenance offers the
		 * public dataset's names (see TagsField).
		 */
		people?: string[];
	} = $props();

	// Kit flattens the action-data union, so restore the echoed values' shape.
	const submitted = $derived(
		form && 'values' in form && form.values ? (form.values as ArtefactFormValues) : undefined
	);
	/**
	 * A draft found in this tab's session storage (see "Draft" below). Null until
	 * the form has mounted: the server has no such thing, so the first render
	 * must match its empty form.
	 */
	let draft = $state.raw<ArtefactFormValues | null>(null);
	// What the fields that seed themselves once start from: a failed submit's
	// echo, else a restored draft.
	const echoed = $derived(submitted ?? draft ?? undefined);
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
		scheduleDraft();
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

	const splitNames = (names: string) =>
		names
			.split(',')
			.map((name) => name.trim())
			.filter(Boolean);

	// Provenance tags, seeded from the echoed (comma-separated) value.
	let provenanceTags = $state<string[]>(seed ? splitNames(seed.provenance) : []);

	// Live form date, tracked so the event list can prioritise events near it.
	let formDate = $state(seed ? seed.date : '');

	// Picking an event fills the date from it. Only over a date nobody has set
	// by hand: an empty field, or the date a previous pick put there, so choosing
	// a different event moves it along but a date the keeper typed in (a flyer
	// printed weeks before its event, say) is never overwritten.
	let dateField = $state<ReturnType<typeof DateField>>();
	let autofilledDate = '';
	function fillDateFromEvent(event: { date: string | null }) {
		if (!event.date || !dateField) return;
		if (formDate !== '' && formDate !== autofilledDate) return;
		autofilledDate = event.date;
		dateField.setValue(event.date);
	}

	// The uploaded images' public URLs, set by the page scanner as scans are added.
	let fileUrls = $state<string[]>(seed ? [...seed.fileUrls] : []);

	// Title, tracked so submit can gate on it.
	let title = $state(seed ? seed.artefact : '');

	// Location, tracked so a change re-validates (see the effect above).
	let location = $state(seed ? seed.location : '');

	// True while an image upload is in flight.
	let scanPending = $state(false);
	// How many pages failed to upload and are still in the list.
	let scanFailed = $state(0);
	// True while a camera run holds photos that are not pages yet.
	let scanBusy = $state(false);
	// True while the form submit action is processing.
	let submitting = $state(false);
	// The request never got an answer (no signal, most likely), as opposed to
	// the server answering with an error, which arrives as `artefactError`.
	let unreachable = $state(false);

	// The submit button is never disabled for an incomplete form. A disabled
	// button can't be pressed, so it can't say what is missing, and at the foot
	// of a long form on a phone the field at fault is screens away. Pressing it
	// reveals every error and brings the first one into view instead.
	const pagesNote = $derived.by(() => {
		if (scanFailed > 0) {
			return scanFailed === 1
				? 'One page failed to upload. Retry it or remove it before saving.'
				: `${scanFailed} pages failed to upload. Retry or remove them before saving.`;
		}
		return scanPending ? 'Pages are still uploading. Keep going; saving waits for them.' : '';
	});

	let scanEl = $state<HTMLElement>();

	/** After a refused submit: bring whatever refused it into view. */
	async function showProblem() {
		// The errors just revealed are not in the DOM until the next update.
		await tick();
		const fieldError = formEl?.querySelector<HTMLElement>('[data-field] [role="alert"]');
		(fieldError ?? scanEl)?.scrollIntoView({ block: 'center' });
	}

	// --- Draft ----------------------------------------------------------------
	// Filling this in on a phone means leaving it: to check a date in another
	// app, to take a call, to pick the item up again. A phone drops a tab it has
	// put in the background as soon as it wants the memory, and reloads it on
	// return, which used to mean an empty form. So the fields are kept in the
	// tab's session storage as they change, and put back when the form mounts
	// empty. Session storage, not local: it lasts through that reload but ends
	// with the tab, so nothing lingers on a shared phone or turns up weeks on.
	// Pages are kept by their uploaded URLs; photos still in the camera, or
	// still uploading, are not anything storage could hold.

	const draftKey = `artefact-draft:${page.url.pathname}`;
	/** Submitted, or thrown away: nothing more is to be saved. */
	let draftClosed = false;
	let draftTimer: ReturnType<typeof setTimeout> | undefined;
	/** Shown while the form holds a draft it did not start with. */
	let restored = $state(false);

	const isBlank = (values: ArtefactFormValues) =>
		Object.values(values).every((value) => value.length === 0);

	function readDraft(): ArtefactFormValues | null {
		try {
			const raw = sessionStorage.getItem(draftKey);
			const values = raw ? (JSON.parse(raw) as ArtefactFormValues) : null;
			return values && Array.isArray(values.fileUrls) && Array.isArray(values.programArea)
				? values
				: null;
		} catch {
			// Storage blocked (private mode) or a draft from an older shape.
			return null;
		}
	}

	function saveDraft() {
		clearTimeout(draftTimer);
		if (draftClosed || !formEl) return;
		const fd = new FormData(formEl);
		const values = echoArtefactForm(fd, parseArtefactForm(fd));
		try {
			if (isBlank(values)) sessionStorage.removeItem(draftKey);
			else sessionStorage.setItem(draftKey, JSON.stringify(values));
		} catch {
			// Blocked or full: the form still works, it just isn't kept.
		}
	}

	/**
	 * A moment after the last change rather than on it: the custom fields mirror
	 * into hidden inputs on the next update, after the event that changed them.
	 */
	function scheduleDraft() {
		if (draftClosed) return;
		clearTimeout(draftTimer);
		draftTimer = setTimeout(saveDraft, 300);
	}

	function closeDraft() {
		draftClosed = true;
		clearTimeout(draftTimer);
		try {
			sessionStorage.removeItem(draftKey);
		} catch {
			// Nothing was kept, then.
		}
	}

	/** Set every field this component holds; the rest re-seed from `draft` (see the `{#key}`). */
	function fill(values: ArtefactFormValues | null) {
		title = values?.artefact ?? '';
		formDate = values?.date ?? '';
		autofilledDate = '';
		location = values?.location ?? '';
		selectedAreas = values ? [...values.programArea] : [];
		provenanceTags = values ? splitNames(values.provenance) : [];
		fileUrls = values ? [...values.fileUrls] : [];
		draft = values;
	}

	function startOver() {
		try {
			sessionStorage.removeItem(draftKey);
		} catch {
			// Nothing was kept, then.
		}
		restored = false;
		fill(null);
	}

	onMount(() => {
		// A failed submit's echo is newer than any draft.
		if (!seed) {
			const kept = readDraft();
			if (kept && !isBlank(kept)) {
				fill(kept);
				restored = true;
			}
		}
		return () => clearTimeout(draftTimer);
	});

	// Ink button, same graphite tone as the landing handwriting.
	const inkButton = 'bg-[#14120f] text-white transition hover:bg-[#33302a]';
</script>

<!-- Before the tab goes to the background, where it may not come back from. -->
<svelte:document
	onvisibilitychange={() => {
		if (document.visibilityState === 'hidden') saveDraft();
	}}
/>

<UnsavedChangesGuard
	form={formEl}
	dirty={scanBusy || scanPending || scanFailed > 0}
	onDiscard={closeDraft}
/>
<!-- novalidate: the browser's own check stops at the first empty required
     field with a bubble and never reaches the submit handler, which is what
     reveals every error at once. -->
<form
	class="mt-6 space-y-5"
	method="POST"
	action="?/createArtefact"
	novalidate
	bind:this={formEl}
	oninput={revalidate}
	onfocusout={markTouched}
	use:enhance={({ formData, cancel }) => {
		unreachable = false;
		validator.revealAll();
		const valid = validator.run(parseArtefactForm(formData));
		if (!valid || scanPending || scanFailed > 0) {
			cancel();
			void showProblem();
			return;
		}
		submitting = true;
		return async ({ result, update }) => {
			if (result.type === 'error') {
				// No answer at all. `update()` would swap the whole page for the
				// error page and take the form with it; say so here, and keep it.
				unreachable = true;
				submitting = false;
				return;
			}
			if (result.type !== 'failure') {
				closeDraft();
				// Offered again on the next artefact, saved or awaiting review.
				rememberPeople(provenanceTags);
			}
			await update();
			submitting = false;
		};
	}}
>
	{#if restored}
		<div
			class="flex items-center justify-between gap-3 rounded-md border border-gray-300 bg-white/60 px-3 py-1 text-sm text-gray-700"
			role="status"
		>
			<span>Picked up where you left off.</span>
			<button
				type="button"
				onclick={startOver}
				class="min-h-11 shrink-0 px-2 font-medium text-gray-900 underline underline-offset-2"
			>
				Start over
			</button>
		</div>
	{/if}

	<!-- Keyed on the draft: these fields read their starting values once, so a
	     draft restored after mount (or thrown away) has to mount them again. -->
	{#key draft}
		<!-- Images come first. The item is in the keeper's hand when they start, the
	     uploads then run while the rest is typed, and the title and date are
	     usually read off the page just scanned. Each URL rides along as its own
	     hidden field. -->
		{#each fileUrls as url (url)}
			<input type="hidden" name="fileUrls" value={url} />
		{/each}

		<div bind:this={scanEl} data-field>
			<PageScanner
				label="Images"
				required
				initial={draft?.fileUrls ?? seed?.fileUrls ?? []}
				bind:pending={scanPending}
				bind:failed={scanFailed}
				bind:busy={scanBusy}
				onChange={(urls) => {
					fileUrls = urls;
					revalidate();
				}}
			/>
			<FieldError message={validator.error('fileUrls')} />
		</div>

		<div data-field>
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

		<!-- Event before date: an artefact from a known event takes its date from
		     the event, so picking one fills the date in below. -->
		<div data-field>
			<AsyncComboField
				name="event"
				label="Event"
				placeholder="Search events"
				date={formDate}
				value={echoed?.event ?? ''}
				onSelect={fillDateFromEvent}
			/>
			<FieldError message={validator.error('event')} />
		</div>

		<div data-field>
			<DateField
				bind:this={dateField}
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

		<fieldset data-field>
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

		<div data-field>
			<TagsField
				name="provenance"
				label="Provenance"
				placeholder="Jane Doe"
				{people}
				bind:value={provenanceTags}
			/>
			<p class="mt-1 text-xs text-gray-500">
				Add each name by tapping it in the list or pressing Enter
			</p>
			<FieldError message={validator.error('provenance')} />
		</div>

		<div data-field>
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

		<div data-field>
			<LocationRadioField
				label={requireLocation ? 'Archival storage location *' : 'Archival storage location'}
				extra={locations}
				optional={!requireLocation}
				bind:value={location}
			/>
			<FieldError message={validator.error('location')} />
		</div>
	{/key}

	{#if unreachable}
		<FieldError
			message="Could not reach the Archive. Check your connection, then press “Add artefact” again: nothing here is lost."
			class="mt-0"
		/>
	{:else if artefactError && Object.keys(errors).length === 0}
		<FieldError message={artefactError} class="mt-0" />
	{/if}

	<!-- The pages' state, said here too: their tiles may be screens above the button. -->
	{#if scanFailed > 0}
		<FieldError message={pagesNote} class="mt-0" />
	{:else if pagesNote}
		<p class="text-[0.8125rem] leading-snug text-gray-600" role="status">{pagesNote}</p>
	{/if}

	<button
		type="submit"
		disabled={submitting}
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
