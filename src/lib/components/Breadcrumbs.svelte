<script lang="ts">
	import { page } from '$app/state';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import { getBreadcrumbs } from '$lib/navigation/routes';

	let {
		href,
		label,
		class: className = ''
	}: { href?: string; label?: string; class?: string } = $props();

	let crumbs = $derived.by(() => {
		const trail = getBreadcrumbs(page.url.pathname, href);
		if (label && trail.length > 0) {
			trail[trail.length - 1] = { ...trail[trail.length - 1], label };
		}
		return trail;
	});
</script>

<nav aria-label="Breadcrumb" class="text-sm text-gray-500 {className}">
	<ol class="flex flex-wrap items-center gap-1">
		{#each crumbs as crumb, i (crumb.href)}
			<li class="flex items-center gap-1">
				{#if i > 0}
					<CaretRightIcon size={12} class="text-gray-400" aria-hidden="true" />
				{/if}
				<a href={crumb.href} class="rounded transition hover:text-gray-900 hover:underline">
					{crumb.label}
				</a>
			</li>
		{/each}
	</ol>
</nav>
