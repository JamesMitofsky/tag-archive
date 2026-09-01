<script lang="ts">
	import CopyIcon from 'phosphor-svelte/lib/CopyIcon';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';

	// Icon-only copy-to-clipboard button. Swaps to a check for a moment after a
	// successful copy; `label` names what's being copied for the accessible name.
	let {
		text,
		label,
		class: className = ''
	}: { text: string; label: string; class?: string } = $props();

	let copied = $state(false);
	let resetTimer: ReturnType<typeof setTimeout> | undefined;

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			// Clipboard unavailable (insecure context, permission denied) — leave the
			// button as it is; the text is still readable on screen.
			return;
		}
		copied = true;
		clearTimeout(resetTimer);
		resetTimer = setTimeout(() => (copied = false), 1500);
	}

	$effect(() => () => clearTimeout(resetTimer));
</script>

<button
	type="button"
	onclick={copy}
	aria-label={label}
	title={label}
	class="inline-flex items-center rounded-full border border-gray-300 p-2 text-gray-700 transition hover:bg-gray-100 hover:text-gray-900 {className}"
>
	{#if copied}
		<CheckIcon size={18} aria-hidden="true" />
	{:else}
		<CopyIcon size={18} aria-hidden="true" />
	{/if}
	<!-- Announces the result to screen readers without changing the button's name. -->
	<span class="sr-only" role="status">{copied ? 'Copied' : ''}</span>
</button>
