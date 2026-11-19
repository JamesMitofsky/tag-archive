<script lang="ts">
	import { latchedSubmission } from '$lib/forms/submission.svelte';
	import ImageSetCreateForm from '$lib/components/ImageSetCreateForm.svelte';
	import SubmittedThanks from '$lib/components/SubmittedThanks.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Photographs, as /contribute takes artefacts: the public form. Anyone's set
	// waits for a keeper's review, and they get a thank-you — with the same
	// optional side path to leave contact details. Keepers have their own form
	// at /keeper/images/new, but a signed-in keeper who ends up here still gets
	// theirs saved and lands on it.
	//
	// Anonymous visitors upload and submit through the draft session a tap of
	// the garden's NFC tag started, while their access pass is open — once it
	// drifts shut, the server refuses with a "tap the tag again" message, shown
	// in place, so nothing typed or uploaded is lost, and a fresh tap resumes the
	// same draft (whose uploads stay attachable).

	// After an anonymous submit: the new set's id and the token that lets
	// this visitor (and only them) attach contact details to it — held through
	// each answer to the contact form (see latchedSubmission).
	const submission = latchedSubmission(() => form);
	const submitted = $derived(submission.value);
	const connected = $derived(!!(form && 'connected' in form && form.connected));
	const contactError = $derived(form && 'contactError' in form ? form.contactError : undefined);
	const contactErrors = $derived(
		form && 'contactErrors' in form && form.contactErrors
			? (form.contactErrors as Record<string, string[]>)
			: {}
	);

	// The uploads' ids, held here so the thank-you can still count them once
	// the form has gone.
	let imageIds = $state<number[]>([]);
</script>

<svelte:head>
	<title>{data.signedIn ? 'New photographs · Cloud Keeper' : 'Add photographs · TAG Archive'}</title
	>
</svelte:head>

<!-- Clears the mobile header band (`pt-chrome`) and, from md up, the
     handwritten nav pinned top-right. -->
<main class="relative min-h-dvh overflow-x-hidden px-4 pt-chrome pb-8 sm:pb-12 md:pt-24">
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
				<ImageSetCreateForm {form} bind:imageIds />
			{/if}
		</section>
	</div>
</main>
