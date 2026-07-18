<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';

	let {
		href,
		label = 'Back',
		ariaLabel
	}: { href: string; label?: string; ariaLabel?: string } = $props();

	// Track whether the user reached this page via an in-app navigation.
	// If they did, going back should pop the history stack; otherwise
	// (direct load, new tab, external referrer) fall back to `href`.
	let canGoBack = $state(false);
	afterNavigate((nav) => {
		canGoBack = nav.from !== null && nav.type !== 'enter';
	});

	function handleClick(event: MouseEvent) {
		if (canGoBack) {
			event.preventDefault();
			history.back();
		}
	}
</script>

<a
	{href}
	onclick={handleClick}
	aria-label={ariaLabel ?? label}
	title={ariaLabel ?? label}
	class="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/25 px-3 py-2 text-sm text-gray-700 shadow-sm backdrop-blur-md transition hover:bg-white/40 hover:text-gray-900"
>
	<ArrowLeftIcon size={18} />
	{label}
</a>
