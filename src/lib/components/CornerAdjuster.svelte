<script lang="ts">
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import CornersOutIcon from 'phosphor-svelte/lib/CornersOutIcon';
	import CornerEditorSurface from './CornerEditorSurface.svelte';
	import type { CornerPoints } from '#lib/scanner/detect.ts';

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

	// Labeled in words, as in the crop step after a camera run: a touch screen
	// never shows a tooltip.
	const action = 'group flex flex-col items-center gap-1 text-[11px] leading-none text-white/80';
	const disc = 'flex size-12 items-center justify-center rounded-full bg-white/10 transition';
</script>

<div class="flex h-full flex-col">
	<header class="px-4 py-3 text-center text-sm text-white/80">
		{#if failed}
			<span role="alert" class="text-red-400">
				The crop editor could not be loaded. The page is stored as captured.
			</span>
		{:else}
			Drag the corners to match the page.
		{/if}
	</header>

	<div class="min-h-0 flex-1">
		<CornerEditorSurface bind:this={surface} bind:failed {image} {corners} />
	</div>

	<footer class="grid grid-cols-3 items-start px-3 pt-3 pb-4">
		<button type="button" onclick={onCancel} aria-label="Cancel" class={action}>
			<span class="{disc} group-hover:bg-white/20">
				<XIcon size={22} />
			</span>
			<span aria-hidden="true">Cancel</span>
		</button>

		<button
			type="button"
			onclick={() => surface?.useWhole()}
			disabled={failed}
			aria-label="Use whole image"
			class="{action} disabled:opacity-40"
		>
			<span class="{disc} group-hover:bg-white/20">
				<CornersOutIcon size={22} />
			</span>
			<span aria-hidden="true">Whole image</span>
		</button>

		<button
			type="button"
			onclick={apply}
			disabled={failed}
			aria-label="Apply crop"
			class="{action} disabled:opacity-40"
		>
			<span
				class="flex size-12 items-center justify-center rounded-full bg-white text-black transition group-hover:bg-white/90"
			>
				<CheckIcon size={24} weight="bold" />
			</span>
			<span aria-hidden="true" class="font-medium text-white">Apply</span>
		</button>
	</footer>
</div>
