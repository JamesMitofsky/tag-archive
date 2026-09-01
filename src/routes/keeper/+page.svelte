<script lang="ts">
	import { fly } from 'svelte/transition';
	import { enhance } from '$app/forms';
	import PaperPlaneTiltIcon from 'phosphor-svelte/lib/PaperPlaneTiltIcon';
	import SignInIcon from 'phosphor-svelte/lib/SignInIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import CalendarBlankIcon from 'phosphor-svelte/lib/CalendarBlankIcon';
	import ArchiveIcon from 'phosphor-svelte/lib/ArchiveIcon';
	import StackIcon from 'phosphor-svelte/lib/StackIcon';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import GearSixIcon from 'phosphor-svelte/lib/GearSixIcon';
	import { createEmailSuite, parseEmailForm } from '$lib/validation/auth';
	import { createValidator } from '$lib/validation/client.svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import OtpStep from './OtpStep.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Signed-out flow: which step the last action left us on. 'otp' only ever
	// comes back when the server runs with AUTH_OTP on.
	const authStep = $derived(form && 'step' in form && form.step === 'otp' ? 'otp' : 'email');
	const authError = $derived(form && 'error' in form ? form.error : undefined);
	const authEmail = $derived(form && 'email' in form && form.email ? form.email : '');
	const errors = $derived(
		form && 'errors' in form && form.errors ? (form.errors as Record<string, string[]>) : {}
	);

	// Isomorphic validation for the email step: same vest suite here and on the server.
	const emailValidator = createValidator(createEmailSuite(), () => errors);
	let emailFormEl = $state<HTMLFormElement>();
	let emailSubmitting = $state(false);
	function revalidateEmail() {
		if (emailFormEl) emailValidator.run(parseEmailForm(new FormData(emailFormEl)));
	}
	function markEmailTouched(event: FocusEvent) {
		const target = event.target as HTMLInputElement | null;
		if (target?.name) emailValidator.touch(target.name);
		revalidateEmail();
	}

	// Frosted glass, borrowed from the landing searchbar.
	const glassInput =
		'w-full rounded-lg border border-white/40 bg-white/25 text-base text-gray-800 shadow-sm backdrop-blur-md placeholder:text-gray-600 focus:border-white/60 focus:bg-white/35 focus:ring-1 focus:ring-white/50 focus:outline-none';
	// Ink button, same graphite tone as the landing handwriting.
	const inkButton = 'bg-[#14120f] text-white transition hover:bg-[#33302a]';

	// The three archive views, surfaced as hub cards for signed-in keepers.
	const hubLinks = [
		{
			href: '/keeper/artefacts',
			icon: ArchiveIcon,
			label: 'Artefacts',
			blurb: 'Digitized copies of physical things, often linked to an event.'
		},
		{
			href: '/keeper/events',
			icon: CalendarBlankIcon,
			label: 'Events',
			blurb: 'Dated experiences in the garden, sometimes linked to a series.'
		},
		{
			href: '/keeper/series',
			icon: StackIcon,
			label: 'Series',
			blurb: 'Banners under which some events exist.'
		}
	];
</script>

<svelte:head>
	<title>Cloud Keeper · TAG Archive</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8 flex items-start justify-between gap-4">
			<div>
				<h1 class="text-2xl font-semibold tracking-tight text-gray-900">Cloud Keeper</h1>
			</div>
			{#if data.user}
				<a
					href="/keeper/settings"
					aria-label="Settings"
					title="Settings"
					class="rounded-full border border-white/40 bg-white/25 p-2.5 text-gray-700 shadow-sm backdrop-blur-md transition hover:bg-white/40 hover:text-gray-900"
				>
					<GearSixIcon size={20} />
				</a>
			{/if}
		</header>

		<!-- Grid-stack the signed-out/signed-in views so they cross-fly on the
		     sign-in success swap, matching the route transitions (same pathname = no layout key). -->
		<div class="view-swap">
			{#key !!data.user}
				<div class="view" in:fly={{ x: 20, duration: 250 }} out:fly={{ x: -20, duration: 250 }}>
					{#if !data.user}
						<!-- Sign-in floats on the sky as a frosted glass panel, like the searchbar. -->
						<section>
							<!-- Grid-stack the step swap so the incoming/outgoing views overlap
				     (no vertical jump) and fly like the route transitions do. -->
							<div class="auth-steps">
								{#key authStep}
									<div
										class="auth-step"
										in:fly={{ x: 20, duration: 250 }}
										out:fly={{ x: -20, duration: 250 }}
									>
										{#if authStep === 'email'}
											<form
												method="POST"
												action="?/signIn"
												bind:this={emailFormEl}
												oninput={revalidateEmail}
												onfocusout={markEmailTouched}
												use:enhance={({ formData, cancel }) => {
													emailValidator.revealAll();
													if (!emailValidator.run(parseEmailForm(formData))) {
														cancel();
														return;
													}
													emailSubmitting = true;
													return async ({ update }) => {
														await update();
														emailSubmitting = false;
													};
												}}
												class="flex gap-2"
											>
												<label class="sr-only" for="email">Email</label>
												<input
													id="email"
													name="email"
													type="email"
													required
													autocomplete="email"
													placeholder="you@email.community"
													value={authEmail}
													class="min-w-0 flex-1 {glassInput}"
												/>
												<button
													type="submit"
													disabled={emailSubmitting}
													aria-busy={emailSubmitting}
													aria-label={data.otpSignIn ? 'Send sign-in code' : 'Sign in'}
													class="shrink-0 rounded-lg p-3 disabled:cursor-not-allowed disabled:opacity-50 {inkButton}"
												>
													{#if emailSubmitting}
														<CircleNotchIcon size={20} class="shrink-0 animate-spin" />
													{:else if data.otpSignIn}
														<PaperPlaneTiltIcon size={20} />
													{:else}
														<SignInIcon size={20} />
													{/if}
												</button>
											</form>
											<FieldError message={emailValidator.error('email')} />
										{:else}
											<OtpStep email={authEmail} />
										{/if}
									</div>
								{/key}
							</div>
							{#if authError && Object.keys(errors).length === 0}
								<p class="mt-4 text-sm text-red-700" role="alert">{authError}</p>
							{/if}
						</section>
					{:else}
						<!-- Hub: the three archive views live on their own sub-routes. -->
						<nav class="mt-6 space-y-3">
							{#each hubLinks as link (link.href)}
								<a
									href={link.href}
									class="flex items-center gap-3 rounded-lg border border-white/40 bg-white/25 p-4 text-gray-800 shadow-sm backdrop-blur-md transition hover:bg-white/40"
								>
									<link.icon size={24} class="shrink-0 text-gray-700" />
									<span class="min-w-0 flex-1">
										<span class="block font-medium text-gray-900">{link.label}</span>
										<span class="block text-sm text-gray-600">{link.blurb}</span>
									</span>
									<CaretRightIcon size={18} class="shrink-0 text-gray-400" />
								</a>
							{/each}
						</nav>
					{/if}
				</div>
			{/key}
		</div>
	</div>
</main>

<style>
	/* Stack the email/OTP steps in one cell so they cross-fly without a jump. */
	.auth-steps {
		display: grid;
	}
	.auth-step {
		grid-area: 1 / 1;
	}
	/* Same trick one level up: signed-out and signed-in views share a cell so the
	   post-sign-in swap cross-flies like a route change instead of snapping. */
	.view-swap {
		display: grid;
	}
	.view {
		grid-area: 1 / 1;
	}
</style>
