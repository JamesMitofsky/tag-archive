<script lang="ts">
	// Six single-digit boxes that behave like one field, auto-submitting once
	// full. Only reachable when AUTH_OTP is on (the server's `signIn` action
	// returns step 'otp'); with the default email-only sign-in this never mounts.
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { confetti } from '@neoconfetti/svelte';

	let { email }: { email: string } = $props();

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

	// On mount, drop the cursor in the first box so the user can type straight
	// away. tick() waits for the inputs to bind.
	$effect(() => {
		tick().then(() => focusOtp(0));
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

	// A single OTP digit box, frosted like the glass panel it sits on.
	const otpBox =
		'h-14 w-12 rounded-lg border border-white/40 bg-white/25 text-center text-2xl text-gray-800 shadow-sm backdrop-blur-md focus:border-white/60 focus:bg-white/35 focus:ring-1 focus:ring-white/50 focus:outline-none';
</script>

<h2 class="text-lg font-medium text-gray-900">Check your email</h2>
<p class="mt-1 text-sm text-gray-700">
	The code sent to <span class="font-medium text-gray-900">{email}</span> will expire in 5 minutes.
</p>
<form
	method="POST"
	action="?/verifyOtp"
	bind:this={otpForm}
	use:enhance={() => {
		otpPending = true;
		return async ({ result, update }) => {
			const positive = result.type === 'redirect' || result.type === 'success';
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
	<input type="hidden" name="email" value={email} />
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
		<div class="mt-4 flex justify-center" role="status" aria-label="Code confirmed">
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
		<div class="mt-4 flex justify-center" role="status" aria-label="Verifying code">
			<div
				class="h-5 w-5 animate-spin rounded-full border-2 border-gray-500 border-t-transparent"
			></div>
		</div>
	{/if}
</form>
