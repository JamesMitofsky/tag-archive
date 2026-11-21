<script lang="ts">
	import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon';
	import ArchiveNumber from '#lib/components/ArchiveNumber.svelte';
	import ArtefactCreateForm from '#lib/components/ArtefactCreateForm.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// The public form. Anyone's artefact waits for a keeper's review, and they
	// get its archive number to write on the item.
	// Keepers have their own form at /keeper/artefacts/new, but a signed-in
	// keeper who ends up here still gets theirs vetted and lands on it.
	//
	// Anonymous visitors may upload and submit after tapping the garden's NFC tag
	// (the draft session, see #lib/server/drafts) for as long as their access
	// pass stays open — it drifts shut once the site has been off their screen
	// for a while (see #lib/access/pass). Once it has, the server refuses with a
	// "tap the tag again" message — shown in place, so nothing typed or scanned
	// is lost, and a fresh tap resumes the same draft.

	// After an anonymous submit: the new artefact's id, shown in place of the
	// form so it can be written on the physical item. Kept until a navigation
	// ("Submit another", the nav) clears `form`.
	const submitted = $derived(
		form && 'submitted' in form && form.submitted ? (form.submitted as { id: number }) : undefined
	);
	// The number replaces the submit button that had focus, so move focus to its
	// heading, where a screen reader announces it. Runs after SvelteKit's own
	// focus reset on a successful action, which would leave focus on the page.
	let numberHeading = $state<HTMLHeadingElement>();
	$effect(() => {
		numberHeading?.focus();
	});

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
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<!-- The form floats on the sky as a frosted glass panel, in the same glass
		     as the searchbar and the keeper sign-in. -->
		<section class="rounded-2xl border border-white/40 bg-white/30 p-6 shadow-lg backdrop-blur-md">
			{#if submitted}
				<ArchiveNumber id={submitted.id}>
					<h1
						bind:this={numberHeading}
						tabindex="-1"
						class="text-sm font-medium text-gray-900 outline-none"
					>
						Write this number on the item
					</h1>
				</ArchiveNumber>
				<!-- Full reload, not client navigation: the form's state lives in this
				     page, and the same URL would keep it. The draft session survives. -->
				<a
					href="/contribute"
					data-sveltekit-reload
					class="mt-6 flex w-full items-center justify-center gap-2 rounded-sm py-3 text-base font-medium {inkButton}"
				>
					<ArrowCounterClockwiseIcon size={18} />
					Submit another
				</a>
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
					people={data.people}
				/>
			{/if}
		</section>
	</div>
</main>
