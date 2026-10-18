<script lang="ts">
	import { enhance } from '$app/forms';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import AsyncComboField from '$lib/components/AsyncComboField.svelte';
	import ImageUploader from '$lib/components/ImageUploader.svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import { createImageSetSuite, parseImageSetForm } from '$lib/validation/imageSet';
	import { createValidator } from '$lib/validation/client.svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import UnsavedChangesGuard from '$lib/components/UnsavedChangesGuard.svelte';
	import SubmittedThanks from '$lib/components/SubmittedThanks.svelte';
	import type { ImageSetFormValues } from './+page.server';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Photographs, as /contribute takes artefacts: one form for everyone. A
	// signed-in admin's set lands vetted and they go straight to it; anyone
	// else's waits for a keeper's review, and they get a thank-you — with the
	// same optional side path to leave contact details.
	//
	// Each photograph uploads as soon as it is picked (see ImageUploader); the
	// form submits only their ids. Anonymous visitors upload and submit through
	// the draft session a tap of the garden's NFC tag started, while their access
	// pass is open — once it drifts shut, the server refuses with a "tap the tag
	// again" message, shown in place, so nothing typed or uploaded is lost, and a
	// fresh tap resumes the same draft (whose uploads stay attachable).

	// After an anonymous submit: the new set's id and the token that lets this
	// visitor (and only them) attach contact details to it.
	const submitted = $derived(
		form && 'submitted' in form && form.submitted
			? (form.submitted as { id: number; token: string })
			: undefined
	);
	const connected = $derived(!!(form && 'connected' in form && form.connected));
	const contactError = $derived(form && 'contactError' in form ? form.contactError : undefined);
	const contactErrors = $derived(
		form && 'contactErrors' in form && form.contactErrors
			? (form.contactErrors as Record<string, string[]>)
			: {}
	);

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

	const imageSetError = $derived(form && 'imageSetError' in form ? form.imageSetError : undefined);
	// Kit flattens the action-data union, so restore the echoed values' shape.
	const echoed = $derived(
		form && 'values' in form && form.values ? (form.values as ImageSetFormValues) : undefined
	);

	// The finished uploads' ids in display order, as the uploader emits them;
	// each rides along as its own hidden field. Not seeded from echoed values:
	// the uploader keeps its photographs across a failed submit by itself, and an
	// id it isn't showing must never be submitted unseen.
	let imageIds = $state<number[]>([]);
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
	// True while the form submit action is processing.
	let submitting = $state(false);

	// Block submit until a photograph is in and none is still on its way: a set
	// saved mid-upload would quietly leave the unfinished ones out.
	const canSubmit = $derived(imageIds.length > 0 && !uploading);

	// Ink button, same graphite tone as the landing handwriting.
	const inkButton = 'bg-[#14120f] text-white transition hover:bg-[#33302a]';
</script>

<svelte:head>
	<title>{data.signedIn ? 'New photographs · Cloud Keeper' : 'Add photographs · TAG Archive'}</title
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
				<SubmittedThanks
					noun={imageIds.length === 1 ? 'photograph' : 'photographs'}
					plural={imageIds.length !== 1}
					anotherHref="/contribute/images"
					idField="setId"
					{submitted}
					{connected}
					{contactError}
					{contactErrors}
				/>
			{:else}
				<!-- The artefact form, pointed to quietly beside the heading, as it
				     points here. -->
				<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
					<h1 class="text-2xl font-semibold tracking-tight text-gray-900">
						{data.signedIn ? 'New photographs' : 'Add photographs'}
					</h1>
					<a
						href="/contribute"
						class="text-sm text-gray-600 underline underline-offset-2 hover:text-gray-900"
					>
						Scanning an artefact instead?
					</a>
				</div>
				{#if !data.canContribute}
					<p class="mt-4 font-friendly text-sm text-gray-700" role="status">
						The Archive has drifted shut. Visit the Cube to open the Archive — anything you fill in
						here will wait for you.
					</p>
				{/if}
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
						if (uploading) {
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
						<label for="description" class="block text-sm font-medium text-gray-700">
							Description
						</label>
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
						<p class="font-friendly text-sm text-red-600" role="alert">{imageSetError}</p>
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
						<!-- Not "Add photographs": that is the uploader's own button, which
						     picks files rather than submitting them. -->
						Add to the archive
					</button>
				</form>
			{/if}
		</section>
	</div>
</main>
