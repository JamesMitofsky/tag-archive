<script lang="ts">
	// Inline validation message shown beneath a form field. Renders nothing when
	// there's no error, so it can sit under every field unconditionally.
	let { message }: { message?: string } = $props();
</script>

{#if message}
	<p class="mt-1 font-friendly text-sm text-red-600" role="alert">{message}</p>
{/if}
