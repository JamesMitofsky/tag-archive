<script lang="ts">
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import CornersOutIcon from 'phosphor-svelte/lib/CornersOutIcon';
	import { fullFrameCorners, type CornerPoints } from '$lib/scanner/detect';
	import type { CornerEditor } from 'scanic';

	// Wraps scanic's imperative corner editor. It already ships drag handles with
	// a 44px hit area, a magnifier and keyboard nudging, so we mount it into a
	// container and drive Apply/Cancel from our own buttons (`toolbar` off). The
	// editor sizes itself to the container, which fills the immersive view.
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

	let container = $state<HTMLDivElement>();
	let editor: CornerEditor | null = null;
	let failed = $state(false);

	$effect(() => {
		const host = container;
		if (!host) return;

		let disposed = false;
		void (async () => {
			try {
				const { createCornerEditor } = await import('scanic');
				if (disposed) return;
				editor = createCornerEditor({
					container: host,
					image,
					corners: corners ?? fullFrameCorners(image.width, image.height),
					toolbar: { enabled: false },
					nudges: { enabled: true },
					theme: { accent: '#22c55e' }
				});
			} catch {
				failed = true;
			}
		})();

		return () => {
			disposed = true;
			editor?.destroy();
			editor = null;
		};
	});

	function apply() {
		if (!editor) return;
		onApply(editor.getCorners());
	}

	function useWhole() {
		editor?.setCorners(fullFrameCorners(image.width, image.height));
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

	<div bind:this={container} class="relative min-h-0 flex-1 overflow-hidden"></div>

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
			onclick={useWhole}
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
