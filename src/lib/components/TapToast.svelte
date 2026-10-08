<!--
	The word a tap leaves behind (see $lib/access/flash): a cheerful "Archive
	opened" after a good tap, or why it didn't work. Read once on page load, then
	gone.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import FlowerIcon from 'phosphor-svelte/lib/FlowerIcon';
	import { TAP_MESSAGES, takeTapFlash, type TapFlash } from '$lib/access/flash';

	const SHOW_MS = 4500;

	let flash = $state<TapFlash | null>(null);

	onMount(() => {
		flash = takeTapFlash();
		if (!flash) return;
		const timer = setTimeout(() => (flash = null), SHOW_MS);
		return () => clearTimeout(timer);
	});
</script>

{#if flash === 'ok'}
	<div
		role="status"
		in:fly={{ y: 24, duration: 500, easing: backOut }}
		out:fade={{ duration: 400 }}
		class="fixed inset-x-0 bottom-8 z-50 mx-auto flex w-fit items-center gap-2 rounded-full border border-white/50 bg-white/75 py-2.5 pr-5 pl-3.5 font-friendly text-base text-gray-800 shadow-md backdrop-blur-md"
	>
		<FlowerIcon weight="duotone" class="size-6 text-rose-400" aria-hidden="true" />
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
