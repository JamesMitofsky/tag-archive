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

<!-- Handwritten mark linking home -->
<a href="/" aria-label="Home" class="fixed top-3 left-3 z-40 transition-opacity hover:opacity-70">
	<img
		src="/drawing/text/tag-archive.png"
		alt="Home"
		decoding="async"
		class="w-40 max-w-[28vw]"
		style="mix-blend-mode: multiply"
	/>
</a>

{#if !page.url.pathname.startsWith('/keeper')}
	<!-- Handwritten nav pinned to the top-right -->
	<nav class="fixed top-3 right-6 z-40 flex items-center gap-6">
		<a href="/" aria-label="Artefacts" class="transition-opacity hover:opacity-70">
			<img
				src="/drawing/text/nav-artefacts.png"
				alt="Artefacts"
				decoding="async"
				class="h-10 w-auto"
				style="mix-blend-mode: multiply"
			/>
		</a>
		<a href="/events" aria-label="Events" class="transition-opacity hover:opacity-70">
			<img
				src="/drawing/text/nav-events.png"
				alt="Events"
				decoding="async"
				class="h-10 w-auto"
				style="mix-blend-mode: multiply"
			/>
		</a>
		<a href="/keeper" aria-label="Keeper" class="transition-opacity hover:opacity-70">
			<img
				src="/drawing/text/cloud-keeper-btn.png"
				alt="Keeper"
				decoding="async"
				class="h-10 w-auto"
				style="mix-blend-mode: multiply"
			/>
		</a>
	</nav>
{/if}

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
