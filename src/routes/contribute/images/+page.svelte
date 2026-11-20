<script lang="ts">
	import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon';
	import ImageSetCreateForm from '#lib/components/ImageSetCreateForm.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Photographs, as /contribute takes artefacts: the public form. Anyone's set
	// waits for a keeper's review, and they're told it was sent. Keepers have
	// their own form at /keeper/images/new, but a signed-in keeper who ends up
	// here still gets theirs saved and lands on it.
	//
	// Anonymous visitors upload and submit through the draft session a tap of
	// the garden's NFC tag started, while their access pass is open — once it
	// drifts shut, the server refuses with a "tap the tag again" message, shown
	// in place, so nothing typed or uploaded is lost, and a fresh tap resumes the
	// same draft (whose uploads stay attachable).

	// After an anonymous submit, a one-line confirmation replaces the form
	// until a navigation ("Add another", the nav) clears `form`.
	const submitted = $derived(!!(form && 'submitted' in form && form.submitted));
	// The confirmation replaces the submit button that had focus, so move focus
	// to its heading, where a screen reader announces it. Runs after SvelteKit's
	// own focus reset on a successful action, which would leave focus on the
	// page.
	let sentHeading = $state<HTMLHeadingElement>();
	$effect(() => {
		sentHeading?.focus();
	});

	// Ink button, same graphite tone as the landing handwriting.
	const inkButton = 'bg-[#14120f] text-white transition hover:bg-[#33302a]';

	// The uploads' ids, held here so the confirmation can still count them
	// once the form has gone.
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
				<!-- Functional, like the artefact form's archive-number screen: what
				     happened, then "Add another". No number: a set's id counts
				     separately from artefacts', so "#7" written on anything would be
				     mistaken for artefact #7. -->
				<h1
					bind:this={sentHeading}
					tabindex="-1"
					class="text-sm font-medium text-gray-900 outline-none"
				>
					{imageIds.length === 1 ? 'Photograph' : 'Photographs'} sent for review
				</h1>
				<!-- Full reload, not client navigation: the form's state lives in this
				     page, and the same URL would keep it. The draft session survives. -->
				<a
					href="/contribute/images"
					data-sveltekit-reload
					class="mt-6 flex w-full items-center justify-center gap-2 rounded-sm py-3 text-base font-medium {inkButton}"
				>
					<ArrowCounterClockwiseIcon size={18} />
					Add another
				</a>
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
