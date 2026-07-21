<script lang="ts">
	import { page } from '$app/state';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import { getParentRoute } from '$lib/navigation/routes';

	let {
		href,
		label,
		ariaLabel
	}: { href?: string; label?: string; ariaLabel?: string } = $props();

	let resolved = $derived.by(() => {
		const currentPath = page.url.pathname;
		return getParentRoute(currentPath, href);
	});

	let finalHref = $derived(href ?? resolved.href);
	let finalLabel = $derived(label ?? resolved.label);
	let finalAriaLabel = $derived(ariaLabel ?? `Back to ${finalLabel}`);
</script>

<a
	href={finalHref}
	aria-label={finalAriaLabel}
	title={finalAriaLabel}
	class="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/25 px-3 py-2 text-sm text-gray-700 shadow-sm backdrop-blur-md transition hover:bg-white/40 hover:text-gray-900"
>
	<ArrowLeftIcon size={18} />
	{finalLabel}
</a>
