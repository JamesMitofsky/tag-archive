<script lang="ts">
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import CornersOutIcon from 'phosphor-svelte/lib/CornersOutIcon';
	import CornerEditorSurface from './CornerEditorSurface.svelte';
	import type { CornerPoints } from '$lib/scanner/detect';

	// Re-crop one page: the corner editor plus Cancel / Use whole image / Apply.
	let {
		image,
		corners,
		onApply,
		onCancel
	}: {
		/** The un-cropped original, in its own pixel space. */
		image: HTMLCanvasElement;
		/** Starting quad; defaults to the whole image. */
		corners?: CornerPoints;
		onApply: (corners: CornerPoints) => void;
		onCancel: () => void;
	} = $props();

	let surface = $state<CornerEditorSurface>();
	let failed = $state(false);

	function apply() {
		const current = surface?.getCorners();
		if (current) onApply(current);
	}
</script>

<div class="flex h-full flex-col">
	<header class="px-4 py-3 text-center text-sm text-white/80">
		{#if failed}
			<span role="alert" class="text-red-400">
				The crop editor could not be loaded. The page is stored as captured.
			</span>
		{:else}
			Drag the corners to match the page. Arrow keys nudge a focused corner.
		{/if}
	</header>

	<div class="min-h-0 flex-1">
		<CornerEditorSurface bind:this={surface} bind:failed {image} {corners} onConfirm={onApply} />
	</div>

	<footer class="grid grid-cols-3 items-center px-6 py-5">
		<button
			type="button"
			onclick={onCancel}
			aria-label="Cancel"
			class="flex size-12 items-center justify-center justify-self-start rounded-full bg-white/10 transition hover:bg-white/20"
		>
			<XIcon size={22} />
		</button>

		<button
			type="button"
			onclick={() => surface?.useWhole()}
			disabled={failed}
			aria-label="Use whole image"
			title="Use whole image"
			class="flex size-12 items-center justify-center justify-self-center rounded-full bg-white/10 transition hover:bg-white/20 disabled:opacity-40"
		>
			<CornersOutIcon size={22} />
		</button>

		<button
			type="button"
			onclick={apply}
			disabled={failed}
			aria-label="Apply crop"
			class="flex size-14 items-center justify-center justify-self-end rounded-full bg-white text-black transition hover:bg-white/90 disabled:opacity-40"
		>
			<CheckIcon size={24} weight="bold" />
		</button>
	</footer>
</div>
