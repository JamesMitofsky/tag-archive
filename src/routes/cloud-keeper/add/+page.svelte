<script lang="ts">
	import { enhance } from '$app/forms';
	import { TagsInput } from '@skeletonlabs/skeleton-svelte';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import { PROGRAM_AREAS, PROGRAM_AREA_META } from '$lib/programAreas';
	import Sky from '$lib/components/Sky.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import ComboField from '$lib/components/ComboField.svelte';
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

	// Location: preset options, but the combobox also accepts a typed-in custom value.
	const LOCATION_OPTIONS = ['Binder', 'Bin'];
	const today = new Date().toISOString().slice(0, 10);
	const artefactError = $derived(form && 'artefactError' in form ? form.artefactError : undefined);
	// Kit flattens the action-data union, so restore the echoed values' shape.
	const echoed = $derived(
		form && 'values' in form && form.values ? (form.values as ArtefactFormValues) : undefined
	);

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
						class="input mt-1.5"
					/>
				</div>

				<div>
					<ComboField
						name="event"
						label="Event"
						placeholder="Search or add an event"
						options={data.events.map((e) => e.name)}
						value={echoed?.event ?? ''}
					/>
					<p class="mt-1 text-xs text-gray-500">Pick an existing event or type a new one.</p>
				</div>

				<div>
					<DateField name="date" label="Date" value={echoed?.date ?? today} />
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
						placeholder="Neato, what've you got there..."
						class="textarea mt-1.5">{echoed?.description ?? ''}</textarea
					>
				</div>

				<div>
					<ComboField
						name="location"
						label="Location"
						placeholder="Search or add a location"
						options={LOCATION_OPTIONS}
						value={echoed?.location ?? 'Binder'}
					/>
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
							class="input mt-1.5"
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
							class="input mt-1.5"
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
