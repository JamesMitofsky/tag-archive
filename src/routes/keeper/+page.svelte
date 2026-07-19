<script lang="ts">
	import { tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import { enhance } from '$app/forms';
	import { confetti } from '@neoconfetti/svelte';
	import PaperPlaneTiltIcon from 'phosphor-svelte/lib/PaperPlaneTiltIcon';
	import CalendarBlankIcon from 'phosphor-svelte/lib/CalendarBlankIcon';
	import ArchiveIcon from 'phosphor-svelte/lib/ArchiveIcon';
	import StackIcon from 'phosphor-svelte/lib/StackIcon';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import GearSixIcon from 'phosphor-svelte/lib/GearSixIcon';
	import { createEmailSuite, parseEmailForm } from '$lib/validation/auth';
	import { createValidator } from '$lib/validation/client.svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Signed-out flow: which step the last action left us on.
	const authStep = $derived(form && 'step' in form && form.step === 'otp' ? 'otp' : 'email');
	const authError = $derived(form && 'error' in form ? form.error : undefined);
	const authEmail = $derived(form && 'email' in form ? form.email : '');
	const errors = $derived(
		form && 'errors' in form && form.errors ? (form.errors as Record<string, string[]>) : {}
	);

	// Isomorphic validation for the email step: same vest suite here and on the server.
	const emailValidator = createValidator(createEmailSuite(), () => errors);
	let emailFormEl = $state<HTMLFormElement>();
	function revalidateEmail() {
		if (emailFormEl) emailValidator.run(parseEmailForm(new FormData(emailFormEl)));
	}
	function markEmailTouched(event: FocusEvent) {
		const target = event.target as HTMLInputElement | null;
		if (target?.name) emailValidator.touch(target.name);
		revalidateEmail();
	}

	// OTP: six single-digit boxes that behave like one field.
	let otpDigits = $state<string[]>(['', '', '', '', '', '']);
	let otpInputs = $state<HTMLInputElement[]>([]);
	let otpForm = $state<HTMLFormElement>();
	let otpPending = $state(false);
	// True while the success confetti plays, just before the connected view mounts.
	let otpCelebrating = $state(false);
	const otpValue = $derived(otpDigits.join(''));
	// Particles stay in the air this long; we bail off the page mid-flight (HOLD_MS).
	const CONFETTI_MS = 2600;
	const HOLD_MS = 1100;

	function focusOtp(i: number) {
		otpInputs[i]?.focus();
		otpInputs[i]?.select();
	}

	// When the OTP step mounts, drop the cursor in the first box so the user can
	// type straight away. tick() waits for the keyed swap to bind the inputs.
	$effect(() => {
		if (authStep === 'otp') tick().then(() => focusOtp(0));
	});

	// Fire validation automatically once all six boxes are filled.
	// Await tick so the hidden `otp` input reflects the digits before submit.
	async function maybeSubmitOtp() {
		if (otpPending || !otpDigits.every((d) => d)) return;
		await tick();
		otpForm?.requestSubmit();
	}

	function handleOtpInput(i: number, event: Event) {
		const el = event.target as HTMLInputElement;
		const digit = el.value.replace(/\D/g, '').slice(-1);
		otpDigits[i] = digit;
		el.value = digit;
		if (digit && i < 5) focusOtp(i + 1);
		maybeSubmitOtp();
	}

	function handleOtpKeydown(i: number, event: KeyboardEvent) {
		if (event.key === 'Backspace') {
			event.preventDefault();
			if (otpDigits[i]) {
				otpDigits[i] = '';
			} else if (i > 0) {
				otpDigits[i - 1] = '';
				focusOtp(i - 1);
			}
		} else if (event.key === 'ArrowLeft' && i > 0) {
			event.preventDefault();
			focusOtp(i - 1);
		} else if (event.key === 'ArrowRight' && i < 5) {
			event.preventDefault();
			focusOtp(i + 1);
		}
	}

	function handleOtpPaste(event: ClipboardEvent) {
		event.preventDefault();
		const digits = (event.clipboardData?.getData('text') ?? '')
			.replace(/\D/g, '')
			.slice(0, 6)
			.split('');
		for (let i = 0; i < 6; i++) otpDigits[i] = digits[i] ?? '';
		focusOtp(Math.min(digits.length, 5));
		maybeSubmitOtp();
	}

	// Frosted glass, borrowed from the landing searchbar.
	const glassInput =
		'w-full rounded-lg border border-white/40 bg-white/25 text-base text-gray-800 shadow-sm backdrop-blur-md placeholder:text-gray-600 focus:border-white/60 focus:bg-white/35 focus:ring-1 focus:ring-white/50 focus:outline-none';
	// A single OTP digit box, frosted like the glass panel it sits on.
	const otpBox =
		'h-14 w-12 rounded-lg border border-white/40 bg-white/25 text-center text-2xl text-gray-800 shadow-sm backdrop-blur-md focus:border-white/60 focus:bg-white/35 focus:ring-1 focus:ring-white/50 focus:outline-none';
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
				<h1 class="text-2xl font-semibold tracking-tight text-[#14120f]">Cloud Keeper</h1>
			</div>
			{#if data.user}
				<a
					href="/settings"
					aria-label="Settings"
					title="Settings"
					class="rounded-full border border-white/40 bg-white/25 p-2.5 text-gray-700 shadow-sm backdrop-blur-md transition hover:bg-white/40 hover:text-gray-900"
				>
					<GearSixIcon size={20} />
				</a>
			{/if}
		</header>

		<!-- Grid-stack the signed-out/signed-in views so they cross-fly on the OTP
		     success swap, matching the route transitions (same pathname = no layout key). -->
		<div class="view-swap">
			{#key !!data.user}
				<div class="view" in:fly={{ x: 20, duration: 250 }} out:fly={{ x: -20, duration: 250 }}>
					{#if !data.user}
						<!-- Sign-in floats on the sky as a frosted glass panel, like the searchbar. -->
						<section
							class="rounded-lg border border-white/40 bg-white/25 p-6 shadow-sm backdrop-blur-md"
						>
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
											<p class="mt-1 text-sm text-gray-700">
												Connections are passwordless! You'll be sent a special code by email.
											</p>
											<form
												method="POST"
												action="?/sendOtp"
												bind:this={emailFormEl}
												oninput={revalidateEmail}
												onfocusout={markEmailTouched}
												use:enhance={({ formData, cancel }) => {
													emailValidator.revealAll();
													if (!emailValidator.run(parseEmailForm(formData))) cancel();
												}}
												class="mt-5 flex gap-2"
											>
												<label class="sr-only" for="email">Email</label>
												<input
													id="email"
													name="email"
													type="email"
													required
													autocomplete="off"
													placeholder="you@email.community"
													value={authEmail}
													class="min-w-0 flex-1 {glassInput}"
												/>
												<button
													type="submit"
													aria-label="Send sign-in code"
													class="shrink-0 rounded-lg p-3 {inkButton}"
												>
													<PaperPlaneTiltIcon size={20} />
												</button>
											</form>
											<FieldError message={emailValidator.error('email')} />
										{:else}
											<h2 class="text-lg font-medium text-gray-900">Check your email</h2>
											<p class="mt-1 text-sm text-gray-700">
												The code sent to <span class="font-medium text-gray-900">{authEmail}</span> will
												expire in 5 minutes.
											</p>
											<form
												method="POST"
												action="?/verifyOtp"
												bind:this={otpForm}
												use:enhance={() => {
													otpPending = true;
													return async ({ result, update }) => {
														const positive =
															result.type === 'redirect' || result.type === 'success';
														if (positive) {
															// Code confirmed: swap the spinner for confetti, let it play, then reveal.
															otpCelebrating = true;
															await new Promise((r) => setTimeout(r, HOLD_MS));
															await update();
															return;
														}
														await update();
														otpPending = false;
														// Wrong/expired code: wipe the boxes so they can retype from box one.
														otpDigits = ['', '', '', '', '', ''];
														focusOtp(0);
													};
												}}
												class="mt-5"
											>
												<input type="hidden" name="email" value={authEmail} />
												<input type="hidden" name="otp" value={otpValue} />
												<fieldset
													class="flex justify-center gap-2 sm:gap-3"
													disabled={otpPending}
													onpaste={handleOtpPaste}
												>
													<legend class="sr-only">One-time code</legend>
													{#each otpDigits as _, i (i)}
														<input
															bind:this={otpInputs[i]}
															type="text"
															inputmode="numeric"
															pattern="[0-9]*"
															autocomplete={i === 0 ? 'one-time-code' : 'off'}
															maxlength="1"
															aria-label="Digit {i + 1}"
															value={otpDigits[i]}
															oninput={(event) => handleOtpInput(i, event)}
															onkeydown={(event) => handleOtpKeydown(i, event)}
															class="{otpBox} disabled:opacity-60"
														/>
													{/each}
												</fieldset>
												{#if otpCelebrating}
													<div
														class="mt-4 flex justify-center"
														role="status"
														aria-label="Code confirmed"
													>
														<div
															use:confetti={{
																particleCount: 120,
																duration: CONFETTI_MS,
																force: 0.7,
																stageHeight: 500,
																colors: ['#14120f', '#f4a259', '#8cb369', '#5b8e7d', '#bc4b51']
															}}
														></div>
													</div>
												{:else if otpPending}
													<div
														class="mt-4 flex justify-center"
														role="status"
														aria-label="Verifying code"
													>
														<div
															class="h-5 w-5 animate-spin rounded-full border-2 border-gray-500 border-t-transparent"
														></div>
													</div>
												{/if}
											</form>
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
	   post-OTP swap cross-flies like a route change instead of snapping. */
	.view-swap {
		display: grid;
	}
	.view {
		grid-area: 1 / 1;
	}
</style>
