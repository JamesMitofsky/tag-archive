<script lang="ts">
	import { enhance } from '$app/forms';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon';
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
	import { createArtefactSuite, parseArtefactForm } from '$lib/validation/artefact';
	import { createValidator } from '$lib/validation/client.svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import UnsavedChangesGuard from '$lib/components/UnsavedChangesGuard.svelte';
	import { createContactSuite, parseContactForm } from '$lib/validation/contact';
	import type { ArtefactFormValues } from './+page.server';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// One form for everyone. A signed-in keeper's artefact lands vetted and they
	// go straight to it; anyone else's waits for a keeper's review, and they get a
	// thank-you — with an optional side path to leave contact details.
	//
	// Anonymous visitors may upload and submit for a few hours after tapping the
	// garden's NFC tag (the draft session, see $lib/server/drafts). Once that
	// lapses, the server refuses with a "tap the tag again" message — shown in
	// place, so nothing typed or scanned is lost, and a fresh tap resumes the
	// same draft.

	// After an anonymous submit: the new artefact's id and the token that lets
	// this visitor (and only them) attach contact details to it.
	const submitted = $derived(
		form && 'submitted' in form && form.submitted
			? (form.submitted as { id: number; token: string })
			: undefined
	);
	const connected = $derived(!!(form && 'connected' in form && form.connected));
	let connectOpen = $state(false);
	let connecting = $state(false);
	const contactError = $derived(form && 'contactError' in form ? form.contactError : undefined);
	const contactErrors = $derived(
		form && 'contactErrors' in form && form.contactErrors
			? (form.contactErrors as Record<string, string[]>)
			: {}
	);
	const contactValidator = createValidator(createContactSuite(), () => contactErrors);

	// Isomorphic validation: the same vest suite runs here for live, per-field
	// feedback and on the server as the authority. `errors` seeds field messages
	// from a no-JS submit until the browser re-validates.
	const errors = $derived(
		form && 'errors' in form && form.errors ? (form.errors as Record<string, string[]>) : {}
	);
	// svelte-ignore state_referenced_locally
	const validator = createValidator(
		createArtefactSuite({ requireLocation: data.requireLocation }),
		() => errors
	);
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
	let selectedAreas = $state<string[]>([]);

	// Provenance tags — client state survives an enhance re-render, so seed once from
	// any echoed (comma-separated) value left by a failed submit.
	// svelte-ignore state_referenced_locally
	let provenanceTags = $state<string[]>(
		form && 'values' in form && form.values
			? (form.values as ArtefactFormValues).provenance
					.split(',')
					.map((name) => name.trim())
					.filter(Boolean)
			: []
	);

	// Live form date, tracked so the event list can prioritise events near it.
	// Seeded from any echoed value left by a failed submit.
	// svelte-ignore state_referenced_locally
	let formDate = $state(
		form && 'values' in form && form.values ? (form.values as ArtefactFormValues).date : ''
	);

	// Location: preset options merged with any previously-typed values from the DB,
	// case-insensitively deduped and alphabetised. The combobox also accepts a
	// typed-in custom value, so new locations save on submit and resurface here next load.
	const LOCATION_PRESETS = ['Binder', 'Bin'];
	const locationOptions = $derived(
		Array.from(
			new Map([...LOCATION_PRESETS, ...data.locations].map((v) => [v.toLowerCase(), v])).values()
		).sort((a, b) => a.localeCompare(b))
	);
	const artefactError = $derived(form && 'artefactError' in form ? form.artefactError : undefined);
	// Kit flattens the action-data union, so restore the echoed values' shape.
	const echoed = $derived(
		form && 'values' in form && form.values ? (form.values as ArtefactFormValues) : undefined
	);

	// The uploaded images' public URLs, set by the page scanner as scans are added.
	// Seeded from any echoed values so a failed submit keeps the attachments.
	// svelte-ignore state_referenced_locally
	let fileUrls = $state<string[]>(
		form && 'values' in form && form.values ? (form.values as ArtefactFormValues).fileUrls : []
	);

	// Title is the only required field; track it so submit can gate on it.
	// svelte-ignore state_referenced_locally
	let title = $state(
		form && 'values' in form && form.values ? (form.values as ArtefactFormValues).artefact : ''
	);

	// Location is required — track for the submit gate; ComboField writes back through its
	// hidden input on submit, but we need a live value to gate on before that.
	// svelte-ignore state_referenced_locally
	let location = $state(
		form && 'values' in form && form.values ? (form.values as ArtefactFormValues).location : ''
	);

	// True while an image upload is in flight.
	let scanPending = $state(false);
	// True while the form submit action is processing.
	let submitting = $state(false);

	// Block submit until required fields are filled, an image is attached, and any upload is finalized.
	const canSubmit = $derived(
		title.trim().length > 0 &&
			formDate.trim().length > 0 &&
			(!data.requireLocation || location.trim().length > 0) &&
			fileUrls.length > 0 &&
			!scanPending
	);

	// Ink button, same graphite tone as the landing handwriting.
	const inkButton = 'bg-[#14120f] text-white transition hover:bg-[#33302a]';
</script>

<svelte:head>
	<title>{data.signedIn ? 'New artefact · Cloud Keeper' : 'Add to the archive · TAG Archive'}</title
	>
</svelte:head>

<!-- Clears the mobile header band (`pt-chrome`) and, from md up, the
     handwritten nav pinned top-right. -->
<main class="relative min-h-dvh overflow-x-hidden px-4 pt-chrome pb-8 sm:pb-12 md:pt-24">
	<UnsavedChangesGuard form={formEl} enabled={!submitted} />
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<!-- The form floats on the sky as a frosted glass panel, in the same glass
		     as the searchbar and the keeper sign-in. -->
		<section class="rounded-2xl border border-white/40 bg-white/30 p-6 shadow-lg backdrop-blur-md">
			{#if submitted}
				<h1 class="text-2xl font-semibold tracking-tight text-gray-900">Thank you</h1>
				<p class="mt-2 text-gray-700">
					Your artefact is with the keepers. Once one of them has looked it over, it will join the
					archive.
				</p>

				<!-- Full reload, not client navigation: the form's state lives in this
				     page, and the same URL would keep it. The draft session survives. -->
				<a
					href="/contribute"
					data-sveltekit-reload
					class="mt-6 flex w-full items-center justify-center gap-2 rounded-sm py-3 text-base font-medium {inkButton}"
				>
					<ArrowCounterClockwiseIcon size={18} />
					Add another
				</a>

				<!-- The side path: entirely optional, and out of the way of the main flow. -->
				<div class="mt-6 border-t border-gray-200 pt-4">
					{#if connected}
						<p class="text-sm text-gray-700" role="status">
							Thanks — a keeper may be in touch about this artefact.
						</p>
					{:else if !connectOpen}
						<button
							type="button"
							onclick={() => (connectOpen = true)}
							class="text-sm text-gray-600 underline underline-offset-2 hover:text-gray-900"
						>
							Happy for a keeper to reach you about it? Leave a name or email.
						</button>
					{:else}
						<form
							method="POST"
							action="?/connect"
							class="space-y-3"
							use:enhance={({ formData, cancel }) => {
								contactValidator.revealAll();
								if (!contactValidator.run(parseContactForm(formData))) {
									cancel();
									return;
								}
								connecting = true;
								return async ({ update }) => {
									await update({ reset: false });
									connecting = false;
								};
							}}
						>
							<p class="text-sm text-gray-600">
								Only keepers see this, and only to follow up on this artefact.
							</p>
							<input type="hidden" name="artefactId" value={submitted.id} />
							<input type="hidden" name="token" value={submitted.token} />
							<div>
								<label for="contact-name" class="block text-sm font-medium text-gray-700"
									>Name</label
								>
								<Input
									id="contact-name"
									name="name"
									autocomplete="name"
									maxlength={200}
									class="mt-1.5"
								/>
								<FieldError message={contactValidator.error('name')} />
							</div>
							<div>
								<label for="contact-email" class="block text-sm font-medium text-gray-700">
									Email
								</label>
								<Input
									id="contact-email"
									name="email"
									type="email"
									autocomplete="email"
									maxlength={254}
									class="mt-1.5"
								/>
								<FieldError message={contactValidator.error('email')} />
							</div>
							{#if contactError && Object.keys(contactErrors).length === 0}
								<p class="font-friendly text-sm text-red-600" role="alert">{contactError}</p>
							{/if}
							<button
								type="submit"
								disabled={connecting}
								aria-busy={connecting}
								class="rounded-sm border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 transition hover:bg-gray-100 disabled:opacity-50"
							>
								Save
							</button>
						</form>
					{/if}
				</div>
			{:else}
				<h1 class="text-2xl font-semibold tracking-tight text-gray-900">
					{data.signedIn ? 'New artefact' : 'Add to the archive'}
				</h1>
				{#if !data.canContribute}
					<p class="mt-4 font-friendly text-sm text-gray-700" role="status">
						The Archive has drifted shut. Return to the Cube to re-open the Archive — anything you
						fill in here will wait for you.
					</p>
				{/if}
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
					     toggles a hidden checkbox. Card carries the area's colour identity; a primary
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
						<label for="description" class="block text-sm font-medium text-gray-700">
							Description
						</label>
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
							label={data.requireLocation
								? 'Archival storage location *'
								: 'Archival storage location'}
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
			{/if}
		</section>
	</div>
</main>
