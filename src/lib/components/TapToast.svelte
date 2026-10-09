<!--
	The word a tap leaves behind (see $lib/access/flash): a cheerful "Archive
	opened" after a good tap, or why it didn't work. Read once on page load, then
	gone. "Archive opened" sits in the middle of the screen and bows out just
	before the cards fly in (see $lib/access/opening).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import FlowerIcon from 'phosphor-svelte/lib/FlowerIcon';
	import { TAP_MESSAGES, takeTapFlash, type TapFlash } from '$lib/access/flash';
	import { opening } from '$lib/access/opening.svelte';
	import { reducedMotion } from '$lib/transitions.svelte';

	/** How long a toast stays when nothing else decides for it. */
	const SHOW_MS = 4500;
	/** "Archive opened" fade-out, timed to finish as the cards set off. */
	const OPENED_FADE_MS = 300;

	let flash = $state<TapFlash | null>(null);
	let timer: ReturnType<typeof setTimeout>;

	function hideIn(ms: number) {
		clearTimeout(timer);
		timer = setTimeout(
			() => {
				flash = null;
				// Unclaimed by now, the opening has passed: a cloud on some later page
				// must not hold its cards back for a toast long gone.
				opening.pending = false;
			},
			Math.max(0, ms)
		);
	}

	onMount(() => {
		flash = takeTapFlash();
		if (!flash) return;
		// Without motion the cards don't fly in, so there is nothing to make way
		// for: the toast just keeps its usual time.
		if (flash === 'ok' && !reducedMotion()) opening.pending = true;
		hideIn(SHOW_MS); // fallback, should no card cloud claim the opening
		return () => {
			clearTimeout(timer);
			opening.pending = false;
			opening.cardsAt = null;
		};
	});

	// Once a cloud has claimed the opening it knows when its cards fly in; leave
	// so the fade finishes right as they do.
	$effect(() => {
		if (flash !== 'ok' || opening.cardsAt === null) return;
		hideIn(opening.cardsAt - performance.now() - OPENED_FADE_MS);
	});
</script>

{#if flash === 'ok'}
	<div
		role="status"
		in:fly={{ y: 24, duration: 500, easing: backOut }}
		out:fade={{ duration: OPENED_FADE_MS }}
		class="pointer-events-none fixed inset-0 z-50 m-auto flex h-fit w-fit items-center gap-3 rounded-full border border-white/50 bg-white/75 py-3.5 pr-7 pl-5 font-friendly text-xl text-gray-800 shadow-lg backdrop-blur-md"
	>
		<FlowerIcon weight="duotone" class="size-8 text-rose-400" aria-hidden="true" />
		{TAP_MESSAGES.ok}
	</div>
{:else if flash}
	<div
		role="status"
		transition:fade={{ duration: 300 }}
		class="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-sm rounded-lg border border-white/40 bg-white/70 px-4 py-3 text-center font-friendly text-sm text-gray-800 shadow-sm backdrop-blur-md"
	>
		{TAP_MESSAGES[flash]}
	</div>
{/if}
