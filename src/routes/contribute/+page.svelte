<script lang="ts">
	import { latchedSubmission } from '#lib/forms/submission.svelte.ts';
	import ArtefactCreateForm from '#lib/components/ArtefactCreateForm.svelte';
	import SubmittedThanks from '#lib/components/SubmittedThanks.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// The public form. Anyone's artefact waits for a keeper's review, and they
	// get a thank-you — with an optional side path to leave contact details.
	// Keepers have their own form at /keeper/artefacts/new, but a signed-in
	// keeper who ends up here still gets theirs vetted and lands on it.
	//
	// Anonymous visitors may upload and submit after tapping the garden's NFC tag
	// (the draft session, see #lib/server/drafts) for as long as their access
	// pass stays open — it drifts shut once the site has been off their screen
	// for a while (see #lib/access/pass). Once it has, the server refuses with a
	// "tap the tag again" message — shown in place, so nothing typed or scanned
	// is lost, and a fresh tap resumes the same draft.

	// After an anonymous submit: the new artefact's id and the token that lets
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
</script>

<svelte:head>
	<title>{data.signedIn ? 'New artefact · Cloud Keeper' : 'Add to the archive · TAG Archive'}</title
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
					noun="artefact"
					anotherHref="/contribute"
					idField="artefactId"
					{submitted}
					{connected}
					{contactError}
					{contactErrors}
				/>
			{:else}
				<!-- Photographs have a form of their own (they become an image set,
				     not an artefact's pages): pointed to quietly, beside the heading. -->
				<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
					<h1 class="text-2xl font-semibold tracking-tight text-gray-900">
						{data.signedIn ? 'New artefact' : 'Add to the archive'}
					</h1>
					<a
						href="/contribute/images"
						class="text-sm text-gray-600 underline underline-offset-2 hover:text-gray-900"
					>
						Adding photographs?
					</a>
				</div>
				{#if !data.canContribute}
					<p class="mt-4 font-friendly text-sm text-gray-700" role="status">
						The Archive has drifted shut. Visit the Cube to open the Archive — anything you fill in
						here will wait for you.
					</p>
				{/if}
				<ArtefactCreateForm
					{form}
					requireLocation={data.requireLocation}
					locations={data.locations}
				/>
			{/if}
		</section>
	</div>
</main>
