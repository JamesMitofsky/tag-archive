<script lang="ts">
	import { enhance } from '$app/forms';
	import BackButton from '$lib/components/BackButton.svelte';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import { PROGRAM_AREAS, PROGRAM_AREA_META } from '$lib/programAreas';
	import DateField from '$lib/components/DateField.svelte';
	import ComboField from '$lib/components/ComboField.svelte';
	import TagsField from '$lib/components/TagsField.svelte';
	import PageScanner from '$lib/components/PageScanner.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import type { ArtefactFormValues } from './+page.server';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Kit flattens the action-data union, so restore the echoed values' shape.
	const echoed = $derived(
		form && 'values' in form && form.values ? (form.values as ArtefactFormValues) : undefined
	);
	const artefactError = $derived(form && 'artefactError' in form ? form.artefactError : undefined);

	// Seed each field from a failed submit's echoed values, else the loaded artefact.
	// svelte-ignore state_referenced_locally
	const seed = form && 'values' in form && form.values ? (form.values as ArtefactFormValues) : null;

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

	// Block submit until required fields are filled and any upload is finalized.
	const canSubmit = $derived(title.trim().length > 0 && !scanPending);

	// Ink button, same graphite tone as the landing handwriting.
	const inkButton = 'bg-[#14120f] text-white transition hover:bg-[#33302a]';
</script>

<svelte:head>
	<title>Edit {data.artefact.artefact} · Cloud Keeper</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8 flex flex-col items-start gap-3">
			<BackButton href="/cloud-keeper/{data.artefact.id}" ariaLabel="Back to artefact" />
		</header>

		<!-- The edit form is a sheet of paper, like the artefact pages. -->
		<section class="rounded-sm bg-white/95 p-6 shadow-xl ring-1 ring-black/5">
			<h1 class="mb-6 text-2xl font-semibold tracking-tight text-gray-900">Edit artefact</h1>
			<form method="POST" action="?/updateArtefact" class="space-y-5" use:enhance>
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
					}}
				/>

				<div>
					<ComboField
						name="event"
						label="Event"
						placeholder="Search or add an event"
						options={data.events.map((e) => e.name)}
						value={echoed?.event ?? data.artefact.event ?? ''}
					/>
				</div>

				<div>
					<DateField name="date" label="Date" value={echoed?.date ?? data.artefact.date ?? ''} />
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
				</fieldset>

				<div>
					<TagsField
						name="provenance"
						label="Provenance"
						placeholder="Johnny B. Good"
						bind:value={provenanceTags}
					/>
					<p class="mt-1 text-xs text-gray-500">Press Enter to add</p>
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
				</div>

				<div>
					<ComboField
						name="location"
						label="Location"
						placeholder="Search or add a location"
						options={LOCATION_OPTIONS}
						value={echoed?.location ?? data.artefact.location ?? ''}
					/>
				</div>

				{#if artefactError}
					<p class="text-sm text-red-600" role="alert">{artefactError}</p>
				{/if}

				<button
					type="submit"
					disabled={!canSubmit}
					class="flex w-full items-center justify-center gap-2 rounded-sm py-3 text-base font-medium disabled:cursor-not-allowed disabled:opacity-50 {inkButton}"
				>
					<CheckIcon size={18} />
					Save changes
				</button>
			</form>

			<!-- Delete lives on the edit view only; its own form so it doesn't submit the edits. -->
			<div class="mt-6 flex justify-end border-t border-gray-200 pt-5">
				<form
					method="POST"
					action="?/deleteArtefact"
					use:enhance={({ cancel }) => {
						if (!confirm(`Delete "${data.artefact.artefact}"? This cannot be undone.`)) cancel();
						return async ({ update }) => update();
					}}
				>
					<button
						type="submit"
						aria-label="Delete {data.artefact.artefact}"
						title="Delete artefact"
						class="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-2 text-sm text-gray-500 transition hover:bg-red-50 hover:text-red-600"
					>
						<TrashIcon size={18} />
						Delete
					</button>
				</form>
			</div>
		</section>
	</div>
</main>
