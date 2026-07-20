<script lang="ts">
	import './layout.css';
	import { fly } from 'svelte/transition';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import Sky from '$lib/components/Sky.svelte';
	import Handwriting from '$lib/components/Handwriting.svelte';
	import { strokePaths, handwritingBox } from '$lib/handwriting';

	let { children } = $props();

	// Slide direction: forward navigations slide left, backward (browser/back
	// button popstate with negative delta) slide the opposite way.
	let dir = $state(1);
	beforeNavigate((nav) => {
		if (typeof nav.delta === 'number' && nav.delta < 0) dir = -1;
		else dir = 1;
	});
</script>

<!-- Persistent sky: mounted once here, outside the keyed transition, so clouds
     drift continuously across navigation and fill the slide gap behind pages. -->
<Sky />

<!-- Handwritten mark pinned to the top-left, part of the chrome on every route. -->
<Handwriting
	paths={strokePaths}
	box={handwritingBox}
	filterId="graphite-mark"
	class="fixed top-3 left-3 z-40 w-64 max-w-[40vw]"
/>

<div class="route-wrap">
	{#key page.url.pathname}
		<div
			class="route"
			in:fly={{ x: 20 * dir, duration: 250 }}
			out:fly={{ x: -20 * dir, duration: 250 }}
		>
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
