<script lang="ts">
	import { fullFrameCorners, type CornerPoints } from '$lib/scanner/detect';
	import type { CornerEditor } from 'scanic';

	// Wraps scanic's imperative corner editor. It already ships drag handles with
	// a 44px hit area, a magnifier and keyboard nudging, so we mount it into a
	// container and drive Apply/Cancel from our own buttons (`toolbar` off) to
	// keep the chrome consistent with the rest of the form.
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

<div class="mt-3 rounded-md border border-gray-200 bg-white p-3">
	{#if failed}
		<p class="text-xs text-red-600" role="alert">
			The crop editor could not be loaded. The page is stored as captured.
		</p>
	{:else}
		<p class="mb-2 text-xs text-gray-600">
			Drag the corners to match the page. Arrow keys nudge a focused corner.
		</p>
		<div bind:this={container} class="relative overflow-hidden rounded-sm bg-gray-100"></div>
	{/if}

	<div class="mt-3 flex flex-wrap gap-2">
		<button
			type="button"
			onclick={apply}
			disabled={failed}
			class="rounded-sm bg-[#14120f] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#33302a] disabled:opacity-50"
		>
			Apply crop
		</button>
		<button
			type="button"
			onclick={useWhole}
			disabled={failed}
			class="rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100 disabled:opacity-50"
		>
			Use whole image
		</button>
		<button
			type="button"
			onclick={onCancel}
			class="rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100"
		>
			Cancel
		</button>
	</div>
</div>
