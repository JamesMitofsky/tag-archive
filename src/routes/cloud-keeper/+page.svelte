<script lang="ts">
	import { tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import { enhance } from '$app/forms';
	import { confetti } from '@neoconfetti/svelte';
	import PaperPlaneTiltIcon from 'phosphor-svelte/lib/PaperPlaneTiltIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import GearSixIcon from 'phosphor-svelte/lib/GearSixIcon';
	import { programAreaMeta } from '$lib/programAreas';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Signed-out flow: which step the last action left us on.
	const authStep = $derived(form && 'step' in form && form.step === 'otp' ? 'otp' : 'email');
	const authError = $derived(form && 'error' in form ? form.error : undefined);
	const authEmail = $derived(form && 'email' in form ? form.email : '');

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
	const HOLD_MS = 1400;

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

	// Render dates like "July 4, 2023"; fall back to raw string if unparseable.
	function formatDate(value: string): string {
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return value;
		return parsed.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}

	// Frosted glass, borrowed from the landing searchbar.
	const glassInput =
		'w-full rounded-lg border border-white/40 bg-white/25 text-base text-gray-800 shadow-sm backdrop-blur-md placeholder:text-gray-600 focus:border-white/60 focus:bg-white/35 focus:ring-1 focus:ring-white/50 focus:outline-none';
	// A single OTP digit box, frosted like the glass panel it sits on.
	const otpBox =
		'h-14 w-12 rounded-lg border border-white/40 bg-white/25 text-center text-2xl text-gray-800 shadow-sm backdrop-blur-md focus:border-white/60 focus:bg-white/35 focus:ring-1 focus:ring-white/50 focus:outline-none';
	// Ink button, same graphite tone as the landing handwriting.
	const inkButton = 'bg-[#14120f] text-white transition hover:bg-[#33302a]';
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
											<form method="POST" action="?/sendOtp" use:enhance class="mt-5 flex gap-2">
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
							{#if authError}
								<p class="mt-4 text-sm text-red-700" role="alert">{authError}</p>
							{/if}
						</section>
					{:else}
						<!-- Adding lives on its own page now; this just points there. -->
						<a
							href="/cloud-keeper/add"
							class="flex w-full items-center justify-center gap-2 rounded-sm py-3 text-base font-medium {inkButton}"
						>
							<PlusIcon size={18} />
							Add Artefact
						</a>

						<section class="mt-10">
							{#if data.artefacts.length === 0}
								<p
									class="mt-3 rounded-lg border border-dashed border-white/60 p-6 text-center text-sm text-gray-700"
								>
									Nothing archived yet — add the first one above.
								</p>
							{:else}
								<!-- Each artefact is its own page, scattered ever so slightly like loose paper. -->
								<ul class="mt-3 space-y-4">
									{#each data.artefacts as item, i (item.id)}
										<li
											class="relative rounded-sm bg-white/95 p-4 text-gray-900 shadow-xl ring-1 ring-black/5 transition hover:shadow-2xl
								{i % 2 === 0 ? '-rotate-[0.35deg]' : 'rotate-[0.4deg]'}"
										>
											<div class="flex items-start justify-between gap-3">
												<div class="min-w-0">
													<!-- Stretched link: the ::after overlay makes the whole card open the artefact page. -->
													<h3 class="font-medium break-words">
														<a
															href="/cloud-keeper/{item.id}"
															class="after:absolute after:inset-0 after:z-[1]"
														>
															{item.artefact}
														</a>
													</h3>
													<p class="mt-0.5 text-sm text-gray-500">
														{#if item.date}{formatDate(
																item.date
															)}{/if}{#if item.event}{#if item.date}{' · '}{/if}{item.event}{/if}
													</p>
												</div>
											</div>
											{#if item.description}
												<p class="mt-2 text-sm break-words whitespace-pre-line text-gray-800">
													{item.description}
												</p>
											{/if}
											{#if item.programArea.length > 0 || item.provenance.length > 0}
												<div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
													{#each item.programArea as area (area)}
														{@const Icon = programAreaMeta(area).icon}
														<span
															class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs {programAreaMeta(
																area
															).pill}"
														>
															<Icon size={13} weight="fill" />
															{area}
														</span>
													{/each}
													{#if item.provenance.length > 0}
														<span class="text-sm text-gray-500">
															{item.provenance.join(', ')}
														</span>
													{/if}
												</div>
											{/if}
										</li>
									{/each}
								</ul>
							{/if}
						</section>
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
