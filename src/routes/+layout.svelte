<script lang="ts">
	import './layout.css';
	import { fade } from 'svelte/transition';
	import { page } from '$app/state';
	import Sky from '$lib/components/Sky.svelte';

	let { children } = $props();
</script>

<!-- Persistent sky: mounted once here, outside the keyed transition, so clouds
     drift continuously across navigation and fill the slide gap behind pages. -->
<Sky />

<!-- Invisible header to reserve spacing for the nav items and logo -->
<header class="relative z-40 flex items-start justify-between pl-3 pr-6 pt-3 pb-6">
	<!-- Handwritten mark linking home -->
	<a href="/" aria-label="Home" class="transition-opacity hover:opacity-70">
		<img
			src="/drawing/text/tag-archive.png"
			alt="Home"
			class="w-40 max-w-[28vw]"
			style="mix-blend-mode: multiply"
		/>
	</a>

	<!-- Handwritten nav -->
	<nav class="flex items-center gap-6 mt-1">
		{#if page.url.pathname !== '/'}
			<a href="/" aria-label="Artefacts" class="transition-opacity hover:opacity-70">
				<img
					src="/drawing/text/nav-artefacts.png"
					alt="Artefacts"
					class="h-10 w-auto"
					style="mix-blend-mode: multiply"
				/>
			</a>
		{/if}
		{#if page.url.pathname !== '/events'}
			<a href="/events" aria-label="Events" class="transition-opacity hover:opacity-70">
				<img
					src="/drawing/text/nav-events.png"
					alt="Events"
					class="h-10 w-auto"
					style="mix-blend-mode: multiply"
				/>
			</a>
		{/if}
	</nav>
</header>

<div class="route-wrap">
	{#key page.url.pathname}
		<div class="route" in:fade={{ duration: 250 }} out:fade={{ duration: 250 }}>
			{@render children()}
		</div>
	{/key}
</div>

<style>
	.route-wrap {
		display: grid;
	}
	.route {
		grid-area: 1 / 1;
		/* Stacking context above the fixed cloud layer (z-0) so page content
		   paints over the clouds; Sky's paper stays behind at -z-10. */
		position: relative;
		z-index: 1;
	}
</style>
