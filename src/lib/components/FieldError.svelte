<script lang="ts">
	import type { Snippet } from 'svelte';
	import WarningCircleIcon from 'phosphor-svelte/lib/WarningCircleIcon';
	import { cn } from '#lib/utils.js';

	// Inline error message: under a form field for a validation failure, or under
	// a whole form when saving fails. Renders nothing when there's no error, so it
	// can sit under every field unconditionally. Set in the body font at regular
	// weight, a step smaller than the field label, in the brick `error` color. The
	// icon carries the "something is wrong" signal so color isn't doing it alone.
	let {
		message,
		class: className,
		children
	}: { message?: string; class?: string; children?: Snippet } = $props();
</script>

{#if message || children}
	<p
		class={cn('mt-1 flex items-start gap-1.5 text-[0.8125rem] leading-snug text-error', className)}
		role="alert"
	>
		<WarningCircleIcon size={15} class="mt-px shrink-0" aria-hidden="true" />
		<span>
			{#if children}{@render children()}{:else}{message}{/if}
		</span>
	</p>
{/if}
