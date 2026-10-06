<script lang="ts">
	import { fullFrameCorners, type CornerPoints } from '$lib/scanner/detect';
	import type { CornerEditor } from 'scanic';

	// scanic's imperative corner editor, mounted into a box that fills its parent.
	// It already ships drag handles with a 44px hit area, a magnifier and keyboard
	// nudging, so screens around it only add their own buttons (`toolbar` off).
	// `image` and `corners` are read once, when the editor mounts: wrap this in
	// a {#key} to show a different image.
	let {
		image,
		corners,
		onChange,
		onConfirm,
		focusHandle = false,
		// eslint-disable-next-line no-useless-assignment -- prop default, not a dead store
		failed = $bindable(false)
	}: {
		/** The un-cropped original, in its own pixel space. */
		image: HTMLCanvasElement;
		/** Starting quad; defaults to the whole image. */
		corners?: CornerPoints | null;
		/** Every change: drag, nudge, arrow keys and `setCorners`. */
		onChange?: (corners: CornerPoints) => void;
		/** Enter on a focused corner handle. */
		onConfirm?: (corners: CornerPoints) => void;
		/** Focus the first corner handle once the editor is up. */
		focusHandle?: boolean;
		/** True once the editor has failed to load; the image is then not shown. */
		failed?: boolean;
	} = $props();

	let container = $state<HTMLDivElement>();
	let editor: CornerEditor | null = null;

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
					theme: { accent: '#22c55e' },
					onChange: (next) => onChange?.(next),
					onConfirm: (next) => onConfirm?.(next)
				});
				if (focusHandle) host.querySelector<HTMLElement>('.scanic-handle')?.focus();
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

	/** The quad as it stands, or null until the editor has mounted. */
	export function getCorners(): CornerPoints | null {
		return editor?.getCorners() ?? null;
	}

	/** Reset the quad to the whole image. */
	export function useWhole() {
		editor?.setCorners(fullFrameCorners(image.width, image.height));
	}
</script>

<div bind:this={container} class="relative h-full w-full overflow-hidden"></div>
