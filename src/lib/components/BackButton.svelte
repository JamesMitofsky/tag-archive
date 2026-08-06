<script lang="ts">
	import { page } from '$app/state';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import { getParentRoute } from '$lib/navigation/routes';

	let {
		href,
		label,
		ariaLabel,
		class: className = ''
	}: { href?: string; label?: string; ariaLabel?: string; class?: string } = $props();

	let resolved = $derived.by(() => getParentRoute(page.url.pathname, href));

	let finalHref = $derived(href ?? resolved.href);
	let finalLabel = $derived(label ?? resolved.label);
	let finalAriaLabel = $derived(ariaLabel ?? `Back to ${finalLabel}`);
</script>

<a
	href={finalHref}
	aria-label={finalAriaLabel}
	title={finalAriaLabel}
	class="inline-flex items-center gap-1 rounded text-sm text-gray-500 transition hover:text-gray-900 hover:underline {className}"
>
	<ArrowLeftIcon size={14} aria-hidden="true" />
	{finalLabel}
</a>
