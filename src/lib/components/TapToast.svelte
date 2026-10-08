<!--
	The word a tap leaves behind (see $lib/access/flash): "welcome in" after a
	good tap, or why it didn't work. Read once on page load, then gone.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { TAP_MESSAGES, takeTapFlash } from '$lib/access/flash';

	const SHOW_MS = 6000;

	let message = $state<string | null>(null);

	onMount(() => {
		const flash = takeTapFlash();
		if (!flash) return;
		message = TAP_MESSAGES[flash];
		const timer = setTimeout(() => (message = null), SHOW_MS);
		return () => clearTimeout(timer);
	});
</script>

{#if message}
	<div
		role="status"
		transition:fade={{ duration: 300 }}
		class="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-sm rounded-lg border border-white/40 bg-white/70 px-4 py-3 text-center font-friendly text-sm text-gray-800 shadow-sm backdrop-blur-md"
	>
		{message}
	</div>
{/if}
