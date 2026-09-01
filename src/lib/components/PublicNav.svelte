<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { afterNavigate } from '$app/navigation';
	import Drawing from '$lib/components/Drawing.svelte';

	const links = [
		{ href: '/', label: 'Artefacts', src: '/drawing/text/nav-artefacts.webp' },
		{ href: '/events', label: 'Events', src: '/drawing/text/nav-events.webp' },
		{ href: '/keeper', label: 'Keeper', src: '/drawing/text/cloud-keeper-btn.webp' }
	];

	let open = $state(false);

	// The menu stays mounted across route transitions, so close it once the
	// navigation it triggered has landed.
	afterNavigate(() => (open = false));
</script>

<!-- Handwritten nav pinned to the top-right; collapses to a menu on small screens. -->
<nav
	data-cloud-block
	class="load-fade fixed top-3 right-6 z-40 hidden items-center gap-6 md:flex"
	style="--fade-delay: 120ms"
>
	{#each links as link (link.href)}
		<a
			href={link.href}
			aria-label={link.label}
			class="transition-opacity duration-100 hover:opacity-70"
		>
			<Drawing src={link.src} alt={link.label} class="h-10 w-auto" />
		</a>
	{/each}
</nav>

<DialogPrimitive.Root bind:open>
	<DialogPrimitive.Trigger
		aria-label="Menu"
		style="--fade-delay: 120ms"
		class="load-fade fixed top-4 right-5 z-40 touch-manipulation p-2 transition-opacity duration-100 data-[state=open]:opacity-40 md:hidden"
	>
		<Drawing src="/drawing/icons/hamburger.svg" alt="" class="w-9" />
	</DialogPrimitive.Trigger>

	<DialogPrimitive.Portal>
		<!-- Invisible: the menu sits directly on the paper, so the overlay exists only
		     to catch the tap that dismisses it. -->
		<DialogPrimitive.Overlay class="fixed inset-0 z-50 touch-manipulation md:hidden" />
		<DialogPrimitive.Content
			class="fixed top-14 right-5 z-50 flex touch-manipulation flex-col items-end gap-5 rounded-2xl bg-glass/60 px-5 py-4 shadow-lg ring-1 ring-white/40 backdrop-blur-md duration-100 outline-none data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 md:hidden"
		>
			<DialogPrimitive.Title class="sr-only">Menu</DialogPrimitive.Title>
			{#each links as link (link.href)}
				<a
					href={link.href}
					aria-label={link.label}
					onclick={() => (open = false)}
					class="touch-manipulation transition-opacity duration-100 hover:opacity-70"
				>
					<!-- One shared height across every item; the assets are cropped tight to
					     the ink, so equal box height means equal drawn height. -->
					<Drawing src={link.src} alt={link.label} class="h-10 w-auto" />
				</a>
			{/each}
		</DialogPrimitive.Content>
	</DialogPrimitive.Portal>
</DialogPrimitive.Root>
