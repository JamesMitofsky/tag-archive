<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import { enhance } from '$app/forms';
	import PaperPlaneTiltIcon from 'phosphor-svelte/lib/PaperPlaneTiltIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import CalendarBlankIcon from 'phosphor-svelte/lib/CalendarBlankIcon';
	import ArchiveIcon from 'phosphor-svelte/lib/ArchiveIcon';
	import ImagesIcon from 'phosphor-svelte/lib/ImagesIcon';
	import StackIcon from 'phosphor-svelte/lib/StackIcon';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import GearSixIcon from 'phosphor-svelte/lib/GearSixIcon';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import ArrowClockwiseIcon from 'phosphor-svelte/lib/ArrowClockwiseIcon';
	import HeadphonesIcon from 'phosphor-svelte/lib/HeadphonesIcon';
	import { createEmailSuite, parseEmailForm } from '#lib/validation/auth.ts';
	import { createValidator } from '#lib/validation/client.svelte.ts';
	import FieldError from '#lib/components/FieldError.svelte';
	import Confetti from '#lib/components/Confetti.svelte';
	import PaperPlaneFlight, { PLANE_PATH, INK } from '#lib/components/PaperPlaneFlight.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Signed in at all: a keeper, or a listener (see #lib/roles), who gets no tools.
	const signedIn = $derived(!!data.user || !!data.listener);

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
	let emailSubmitting = $state(false);
	// What is typed in the email field: seeded from each action result (the
	// address it echoes back) and overwritten as the keeper types. It is bound
	// rather than set one-way with `value={authEmail}`, because Svelte re-applies
	// a one-way value whenever its template effect next runs. That first rerun
	// came on submit, when `emailSubmitting` flipped, and blanked the field (and
	// tripped the "valid email" error) for as long as the send was pending.
	let email = $derived(form && 'email' in form ? (form.email ?? '') : '');
	// The plane's takeoff is the send's pending state, so a send that returns at
	// once would swap the step before the plane had left the button. Hold the
	// swap until the send has been in the air this long. No hold under reduced
	// motion, where there is no flight to see.
	const TAKEOFF_MS = 700;
	function takeoffHold() {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : TAKEOFF_MS;
	}
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
	// True from a confirmed code until the connected view replaces the form.
	let otpCelebrating = $state(false);
	const otpValue = $derived(otpDigits.join(''));

	// A confirmed code brings a shower of petals down from the top of the
	// screen. It is drawn over the whole page rather than inside the form, so it
	// outlives the form: the hub flies in after HOLD_MS and the petals keep
	// falling over it until CONFETTI_MS.
	let showConfetti = $state(false);
	const CONFETTI_MS = 4000;
	const HOLD_MS = 1100;

	function celebrate() {
		otpCelebrating = true;
		showConfetti = true;
		setTimeout(() => (showConfetti = false), CONFETTI_MS);
	}

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

	// Resend: a sent code holds off another for `resendIn` seconds, which every
	// sendOtp result names (the server holds the same line, see
	// #lib/server/otpResendCooldown). The countdown is drawn only once the page
	// is hydrated: without JS nothing would tick it down, so the button stays
	// usable and the server's refusal says how long is left.
	let hydrated = $state(false);
	onMount(() => (hydrated = true));
	let resendReadyAt = $state(0);
	let clock = $state(Date.now());
	let resendPending = $state(false);
	// True after a resend lands, until the next attempt at either form.
	let resent = $state(false);
	const resendWait = $derived(Math.max(0, Math.ceil((resendReadyAt - clock) / 1000)));

	// Before the DOM updates, so the code step never draws the button usable for
	// a frame. Only results that name a wait move it: a wrong code leaves it be.
	$effect.pre(() => {
		if (form && 'resendIn' in form && typeof form.resendIn === 'number') {
			resendReadyAt = Date.now() + form.resendIn * 1000;
			clock = Date.now();
		}
	});

	// Tick only while there is a wait to count down.
	$effect(() => {
		if (authStep !== 'otp' || resendReadyAt <= Date.now()) return;
		const timer = setInterval(() => {
			clock = Date.now();
			if (clock >= resendReadyAt) clearInterval(timer);
		}, 250);
		return () => clearInterval(timer);
	});

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

	// Ink button, same graphite tone as the landing handwriting.
	const inkButton = 'bg-[#14120f] text-white transition hover:bg-[#33302a]';
	// Frosted glass, borrowed from the landing searchbar.
	const glassInput =
		'w-full rounded-lg border border-white/40 bg-white/25 text-base text-gray-800 shadow-sm backdrop-blur-md placeholder:text-gray-600 focus:border-white/60 focus:bg-white/35 focus:ring-1 focus:ring-white/50 focus:outline-none';
	// A single OTP digit box, frosted like the glass panel it sits on.
	const otpBox =
		'h-14 w-12 rounded-lg border border-white/40 bg-white/25 text-center text-2xl text-gray-800 shadow-sm backdrop-blur-md focus:border-white/60 focus:bg-white/35 focus:ring-1 focus:ring-white/50 focus:outline-none';

	// The archive views, surfaced as hub cards for signed-in keepers.
	const hubLinks = [
		{
			href: '/keeper/artefacts',
			icon: ArchiveIcon,
			label: 'Artefacts',
			blurb: 'Digitized copies of physical things, often linked to an event.'
		},
		{
			href: '/keeper/images',
			icon: ImagesIcon,
			label: 'Images',
			blurb: 'Photographs uploaded together, often from an event.'
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
	<!-- Open to everyone (see #lib/access/gate) but deliberately unlinked. -->
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8 flex items-start justify-between gap-4">
			<div>
				<!-- Signed out, the page asks; signed in, it names the hub. -->
				<h1 class="text-2xl font-semibold tracking-tight text-gray-900">
					{signedIn ? 'Cloud Keeper' : 'Are you a Cloud Keeper?'}
				</h1>
			</div>
			{#if signedIn}
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

		<!-- Grid-stack the signed-out/signed-in views so they cross-fly on the OTP
		     success swap, matching the route transitions (same pathname = no layout key). -->
		<div class="view-swap">
			{#key signedIn}
				<div class="view" in:fly={{ x: 20, duration: 250 }} out:fly={{ x: -20, duration: 250 }}>
					{#if !signedIn}
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
												action="?/sendOtp"
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
													const landAt = performance.now() + takeoffHold();
													return async ({ update }) => {
														const wait = landAt - performance.now();
														if (wait > 0) await new Promise((r) => setTimeout(r, wait));
														// No reset: a refused send should leave the address to correct.
														await update({ reset: false });
														emailSubmitting = false;
													};
												}}
												class="flex max-w-sm items-center gap-2"
											>
												<label class="sr-only" for="email">Email</label>
												<input
													id="email"
													name="email"
													type="email"
													required
													autocomplete="off"
													placeholder="keeper@cube.local"
													bind:value={email}
													class="min-w-0 flex-1 {glassInput}"
												/>
												<button
													type="submit"
													disabled={emailSubmitting}
													aria-busy={emailSubmitting}
													class="inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-3 font-medium disabled:cursor-not-allowed {inkButton}"
												>
													<!-- The heading asks "Are you a Cloud Keeper?"; the button answers.
													     The hidden words say what pressing it does. -->
													<span>I am<span class="sr-only">. Send my sign-in code</span></span>
													<span class="relative block h-5 w-5">
														<!-- At rest the plane sits in the button. On send it lifts off, and
														     an ink one flies a loop out over the sky until the code is sent.
														     Under reduced motion a spinner stands in for the flight. -->
														<PaperPlaneTiltIcon
															size={20}
															class="transition duration-200 motion-reduce:transition-none {emailSubmitting
																? 'translate-x-2 -translate-y-2 opacity-0'
																: ''}"
														/>
														{#if emailSubmitting}
															<CircleNotchIcon
																size={20}
																class="absolute inset-0 hidden animate-spin motion-reduce:block"
															/>
															<PaperPlaneFlight />
														{/if}
													</span>
												</button>
											</form>
											<FieldError message={emailValidator.error('email')} />
										{:else}
											<h2 class="flex items-center gap-2 text-lg font-medium text-gray-900">
												Check your email
												<!-- The plane that left the send button, come in to land. -->
												<svg
													xmlns="http://www.w3.org/2000/svg"
													viewBox="-10 -10 20 20"
													fill="none"
													stroke={INK}
													stroke-width="1.5"
													stroke-linecap="round"
													stroke-linejoin="round"
													aria-hidden="true"
													class="landing h-5 w-5 shrink-0"
													style="mix-blend-mode: multiply;"
												>
													<path d={PLANE_PATH} />
												</svg>
											</h2>
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
													resent = false;
													return async ({ result, update }) => {
														const positive =
															result.type === 'redirect' || result.type === 'success';
														if (positive) {
															// Code confirmed: drop the spinner, start the petals, let them
															// fall a moment, then reveal. Keep the digits in the boxes (no
															// form reset) while the form flies out.
															celebrate();
															await new Promise((r) => setTimeout(r, HOLD_MS));
															await update({ reset: false });
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
													<!-- The confetti itself is drawn over the page (below). Under
													     reduced motion it is not drawn, and a check stands in. -->
													<div
														class="mt-4 flex justify-center"
														role="status"
														aria-label="Code confirmed"
													>
														<CheckIcon
															size={20}
															weight="bold"
															class="hidden text-gray-700 motion-reduce:block"
														/>
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
											<form
												method="POST"
												action="?/sendOtp"
												use:enhance={() => {
													resendPending = true;
													resent = false;
													return async ({ result, update }) => {
														await update();
														resendPending = false;
														if (result.type !== 'success') return;
														// A fresh code: clear the old digits and start again from box one.
														resent = true;
														otpDigits = ['', '', '', '', '', ''];
														focusOtp(0);
													};
												}}
												class="mt-5 flex flex-col items-center gap-1"
											>
												<input type="hidden" name="email" value={authEmail} />
												<button
													type="submit"
													disabled={resendPending ||
														otpPending ||
														otpCelebrating ||
														(hydrated && resendWait > 0)}
													aria-busy={resendPending}
													class="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 transition hover:bg-white/25 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
												>
													{#if resendPending}
														<CircleNotchIcon size={16} class="shrink-0 animate-spin" />
														Sending a new code
													{:else}
														<ArrowClockwiseIcon size={16} class="shrink-0" />
														{#if hydrated && resendWait > 0}
															<span>
																Resend code in <span class="tabular-nums">{resendWait}s</span>
															</span>
														{:else}
															Resend code
														{/if}
													{/if}
												</button>
												{#if resent}
													<p class="text-sm text-gray-700" role="status">
														A new code is on its way. Earlier codes no longer work.
													</p>
												{/if}
											</form>
										{/if}
									</div>
								{/key}
							</div>
							{#if authError && Object.keys(errors).length === 0}
								<FieldError message={authError} class="mt-4" />
							{/if}
						</section>
					{:else if data.listener}
						<!-- A listener has no keeper tools; their account opens the archive. -->
						<nav class="mt-6 space-y-3">
							<a
								href="/"
								class="flex items-center gap-3 rounded-lg border border-white/40 bg-white/25 p-4 text-gray-800 shadow-sm backdrop-blur-md transition hover:bg-white/40"
							>
								<HeadphonesIcon size={24} class="shrink-0 text-gray-700" />
								<span class="min-w-0 flex-1">
									<span class="block font-medium text-gray-900">Open the Archive</span>
									<span class="block text-sm text-gray-600">
										You’re signed in as a listener, so the Archive opens for you wherever you are.
									</span>
								</span>
								<CaretRightIcon size={18} class="shrink-0 text-gray-400" />
							</a>
						</nav>
					{:else}
						<!-- Hub: the archive views live on their own sub-routes. -->
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
	{#if showConfetti}
		<Confetti duration={CONFETTI_MS} />
	{/if}
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
	/* The plane beside "Check your email" glides down from the upper left, where
	   the one from the send button flew off, and settles nose-down like a landed
	   dart. It waits out the step's own fly-in first. */
	.landing {
		transform: rotate(12deg);
	}
	@media (prefers-reduced-motion: no-preference) {
		.landing {
			animation: land 650ms cubic-bezier(0.2, 0.7, 0.3, 1) 200ms backwards;
		}
	}
	@keyframes land {
		from {
			opacity: 0;
			transform: translate(-56px, -34px) rotate(32deg);
		}
		60% {
			opacity: 1;
		}
		to {
			transform: rotate(12deg);
		}
	}
</style>
