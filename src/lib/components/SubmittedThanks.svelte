<script lang="ts">
	import { enhance } from '$app/forms';
	import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon';
	import FieldError from '$lib/components/FieldError.svelte';
	import { Input } from '$lib/components/ui/input';
	import { createValidator } from '$lib/validation/client.svelte';
	import { createContactSuite, parseContactForm } from '$lib/validation/contact';

	// The thank-you an anonymous contributor sees once a submission is with the
	// keepers, and its side path: the optional contact form, which posts to the
	// page's own `?/connect` action with the submission's id and the token that
	// lets this visitor (and only them) attach contact details to it. Shared by
	// the contribution forms, which differ only in what was submitted and in the
	// field their `connect` action reads the id from.
	let {
		noun,
		plural = false,
		anotherHref,
		idField,
		submitted,
		connected = false,
		contactError,
		contactErrors = {}
	}: {
		/** What was submitted, as the copy names it: "artefact", "photographs". */
		noun: string;
		/** Whether `noun` is plural, for the words around it ("these", "them"). */
		plural?: boolean;
		/** Where "Add another" leads: the same form, fresh. */
		anotherHref: string;
		/** The hidden field the page's `connect` action reads the submission's id from. */
		idField: string;
		/** The new submission's id and its contact token, as the action returned them. */
		submitted: { id: number; token: string };
		/** True once the contact details are saved. */
		connected?: boolean;
		/** The `connect` action's refusal, if any. */
		contactError?: string;
		/** Per-field errors from a no-JS `connect` submit. */
		contactErrors?: Record<string, string[]>;
	} = $props();

	const words = $derived(
		plural
			? { these: 'these', it: 'them', itWill: 'they will', is: 'are' }
			: { these: 'this', it: 'it', itWill: 'it will', is: 'is' }
	);

	let connectOpen = $state(false);
	let connecting = $state(false);
	const contactValidator = createValidator(createContactSuite(), () => contactErrors);

	// Each step here replaces the control that had focus (the form's submit
	// button, the "Leave a name or email" button, Save), so focus moves to what
	// took its place, where a screen reader announces it. These effects run
	// after SvelteKit's own focus reset on a successful action, which would
	// otherwise leave focus on the page itself.
	let heading = $state<HTMLHeadingElement>();
	let nameInput = $state<HTMLInputElement | null>(null);
	let confirmation = $state<HTMLParagraphElement>();
	$effect(() => {
		heading?.focus();
	});
	$effect(() => {
		nameInput?.focus();
	});
	$effect(() => {
		confirmation?.focus();
	});

	// Ink button, same graphite tone as the landing handwriting.
	const inkButton = 'bg-[#14120f] text-white transition hover:bg-[#33302a]';
</script>

<h1
	bind:this={heading}
	tabindex="-1"
	class="text-2xl font-semibold tracking-tight text-gray-900 outline-none"
>
	Thank you
</h1>
<p class="mt-2 text-gray-700">
	Your {noun}
	{words.is} with the keepers. Once one of them has looked {words.it} over, {words.itWill} join the archive.
</p>

<!-- Full reload, not client navigation: the form's state lives in this
     page, and the same URL would keep it. The draft session survives. -->
<a
	href={anotherHref}
	data-sveltekit-reload
	class="mt-6 flex w-full items-center justify-center gap-2 rounded-sm py-3 text-base font-medium {inkButton}"
>
	<ArrowCounterClockwiseIcon size={18} />
	Add another
</a>

<!-- The side path: entirely optional, and out of the way of the main flow. -->
<div class="mt-6 border-t border-gray-200 pt-4">
	{#if connected}
		<p
			bind:this={confirmation}
			tabindex="-1"
			class="text-sm text-gray-700 outline-none"
			role="status"
		>
			Thanks — a keeper may be in touch about {words.these}
			{noun}.
		</p>
	{:else if !connectOpen}
		<button
			type="button"
			onclick={() => (connectOpen = true)}
			class="text-sm text-gray-600 underline underline-offset-2 hover:text-gray-900"
		>
			Happy for a keeper to reach you about {words.it}? Leave a name or email.
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
				Only keepers see this, and only to follow up on {words.these}
				{noun}.
			</p>
			<input type="hidden" name={idField} value={submitted.id} />
			<input type="hidden" name="token" value={submitted.token} />
			<div>
				<label for="contact-name" class="block text-sm font-medium text-gray-700">Name</label>
				<Input
					id="contact-name"
					name="name"
					autocomplete="name"
					maxlength={200}
					bind:ref={nameInput}
					class="mt-1.5"
				/>
				<FieldError message={contactValidator.error('name')} />
			</div>
			<div>
				<label for="contact-email" class="block text-sm font-medium text-gray-700">Email</label>
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
