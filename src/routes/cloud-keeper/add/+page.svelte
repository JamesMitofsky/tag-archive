<script lang="ts">
	import { enhance } from '$app/forms';
	import { TagsInput } from '@skeletonlabs/skeleton-svelte';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import { PROGRAM_AREAS, PROGRAM_AREA_META } from '$lib/programAreas';
	import Sky from '$lib/components/Sky.svelte';
	import type { ArtefactFormValues } from './+page.server';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

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

	// Location dropdown: preset options plus a "+ Option" escape hatch for a custom value.
	const LOCATION_OPTIONS = ['Binder', 'Bin'];
	const CUSTOM_LOCATION = '__custom__';
	let locationChoice = $state('Binder');
	let customLocation = $state('');
	const locationValue = $derived(
		locationChoice === CUSTOM_LOCATION ? customLocation.trim() : locationChoice
	);
	const today = new Date().toISOString().slice(0, 10);
	const artefactError = $derived(form && 'artefactError' in form ? form.artefactError : undefined);
	// Kit flattens the action-data union, so restore the echoed values' shape.
	const echoed = $derived(
		form && 'values' in form && form.values ? (form.values as ArtefactFormValues) : undefined
	);

	// Plain input sitting on a white paper card.
	const paperInput =
		'w-full rounded-sm border-gray-300 bg-white text-base text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:ring-gray-500';
	// Ink button, same graphite tone as the landing handwriting.
	const inkButton = 'bg-[#14120f] text-white transition hover:bg-[#33302a]';
</script>

<svelte:head>
	<title>New artefact · Cloud Keeper</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<!-- Ambient sky: watercolor paper + drifting clouds, shared with the landing page. -->
	<Sky />

	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8 flex items-start justify-between gap-4">
			<div>
				<h1 class="text-2xl font-semibold tracking-tight text-[#14120f]">New artefact</h1>
			</div>
			<a
				href="/cloud-keeper"
				aria-label="Back to Cloud Keeper"
				title="Back to Cloud Keeper"
				class="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/25 px-3 py-2 text-sm text-gray-700 shadow-sm backdrop-blur-md transition hover:bg-white/40 hover:text-gray-900"
			>
				<ArrowLeftIcon size={18} />
				Back
			</a>
		</header>

		<!-- The create form is a fresh sheet of paper, like the artefact pages. -->
		<section class="rounded-sm bg-white/95 p-6 shadow-xl ring-1 ring-black/5">
			<form method="POST" action="?/createArtefact" class="space-y-5" use:enhance>
				<div>
					<label for="artefact" class="block text-sm font-medium text-gray-700">
						Title <span class="text-red-600" title="Required" aria-label="required">*</span>
					</label>
					<input
						id="artefact"
						name="artefact"
						type="text"
						required
						maxlength="200"
						value={echoed?.artefact ?? ''}
						placeholder="Symphonic Steep Program"
						class="mt-1.5 {paperInput}"
					/>
				</div>

				<div>
					<label for="event" class="block text-sm font-medium text-gray-700">Event</label>
					<input
						id="event"
						name="event"
						type="text"
						list="event-options"
						maxlength="200"
						value={echoed?.event ?? ''}
						placeholder="Search or add an event"
						class="mt-1.5 {paperInput}"
					/>
					<datalist id="event-options">
						{#each data.events as e (e.id)}
							<option value={e.name}></option>
						{/each}
					</datalist>
					<p class="mt-1 text-xs text-gray-500">
						Pick an existing event or type a new one.
					</p>
				</div>

				<div>
					<label for="date" class="block text-sm font-medium text-gray-700">Date</label>
					<input
						id="date"
						name="date"
						type="date"
						value={echoed?.date ?? today}
						class="mt-1.5 {paperInput}"
					/>
				</div>

				<fieldset>
					<legend class="block text-sm font-medium text-gray-700">Program areas</legend>
					<div
						class="mt-1.5 divide-y divide-gray-100 rounded-sm border border-gray-300"
					>
						{#each PROGRAM_AREAS as area (area)}
							{@const meta = PROGRAM_AREA_META[area]}
							{@const Icon = meta.icon}
							<label
								class="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-gray-800 transition select-none hover:bg-gray-50"
							>
								<input
									type="checkbox"
									name="programArea"
									value={area}
									bind:group={selectedAreas}
									class="h-4 w-4 rounded border-gray-300 text-gray-800 focus:ring-gray-500"
								/>
								<span class="flex flex-1 items-center gap-1.5 rounded-full px-2 py-0.5 {meta.pill}">
									<Icon size={16} weight="fill" />
									{area}
								</span>
							</label>
						{/each}
					</div>
				</fieldset>

				<div>
					<TagsInput
						name="provenance"
						value={provenanceTags}
						onValueChange={(e) => (provenanceTags = e.value)}
					>
						<TagsInput.Label class="block text-sm font-medium text-gray-700">
							Provenance
						</TagsInput.Label>
						<TagsInput.Control class="mt-1.5 w-full">
							<TagsInput.Context>
								{#snippet children(tagsInput)}
									{#each tagsInput().value as value, index (index)}
										<TagsInput.Item {value} {index}>
											<TagsInput.ItemPreview>
												<TagsInput.ItemText>{value}</TagsInput.ItemText>
												<TagsInput.ItemDeleteTrigger />
											</TagsInput.ItemPreview>
											<TagsInput.ItemInput />
										</TagsInput.Item>
									{/each}
								{/snippet}
							</TagsInput.Context>
							<TagsInput.Input placeholder="Add a contributor and press Enter…" />
						</TagsInput.Control>
						<TagsInput.HiddenInput />
					</TagsInput>
					<p class="mt-1 text-xs text-gray-500">
						Contributors or sources. Press Enter or comma to add each one.
					</p>
				</div>

				<div>
					<label for="description" class="block text-sm font-medium text-gray-700">
						Description
					</label>
					<textarea
						id="description"
						name="description"
						rows="3"
						maxlength="2000"
						placeholder="What it is, where it came from, anything worth remembering…"
						class="mt-1.5 {paperInput}">{echoed?.description ?? ''}</textarea
					>
				</div>

				<div>
					<label for="location" class="block text-sm font-medium text-gray-700">Location</label>
					<select id="location" bind:value={locationChoice} class="mt-1.5 {paperInput}">
						{#each LOCATION_OPTIONS as option (option)}
							<option value={option}>{option}</option>
						{/each}
						<option value={CUSTOM_LOCATION}>+ Option</option>
					</select>
					{#if locationChoice === CUSTOM_LOCATION}
						<input
							type="text"
							bind:value={customLocation}
							maxlength="200"
							placeholder="New location"
							aria-label="Custom location"
							class="mt-2 {paperInput}"
						/>
					{/if}
					<!-- Resolved value the server reads; a preset name or the typed custom one. -->
					<input type="hidden" name="location" value={locationValue} />
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					<div>
						<label for="fileName" class="block text-sm font-medium text-gray-700">File name</label>
						<input
							id="fileName"
							name="fileName"
							type="text"
							maxlength="200"
							value={echoed?.fileName ?? ''}
							placeholder="TAG-001.jpg"
							class="mt-1.5 {paperInput}"
						/>
					</div>
					<div>
						<label for="fileUrl" class="block text-sm font-medium text-gray-700">File URL</label>
						<input
							id="fileUrl"
							name="fileUrl"
							type="url"
							value={echoed?.fileUrl ?? ''}
							placeholder="/artefacts/TAG-001.jpg"
							class="mt-1.5 {paperInput}"
						/>
					</div>
				</div>

				{#if artefactError}
					<p class="text-sm text-red-600" role="alert">{artefactError}</p>
				{/if}

				<button
					type="submit"
					class="flex w-full items-center justify-center gap-2 rounded-sm py-3 text-base font-medium {inkButton}"
				>
					<PlusIcon size={18} />
					Add artefact
				</button>
			</form>
		</section>
	</div>
</main>
