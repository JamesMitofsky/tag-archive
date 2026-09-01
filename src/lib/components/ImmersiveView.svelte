<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';

	// A full-viewport, dark, single-task surface: the camera, the crop editor,
	// anything the user should do with the form out of sight. Built on the same
	// bits-ui Dialog as the app's modals so focus trapping, scroll locking, Escape
	// and the inert page behind it all come for free — only the chrome differs:
	// no dim overlay, no close button, no zoom, just a short fade.
	let {
		open,
		title,
		onClose,
		children
	}: {
		open: boolean;
		/** Announced to assistive tech; not rendered visibly. */
		title: string;
		/** Escape, or anything else the primitive treats as dismissal. */
		onClose: () => void;
		children: Snippet;
	} = $props();
</script>

<DialogPrimitive.Root {open} onOpenChange={(next) => !next && onClose()}>
	<DialogPrimitive.Portal>
		<DialogPrimitive.Content
			class="fixed inset-0 z-50 bg-black text-white duration-200 outline-none data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0"
			style="padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom);"
		>
			<DialogPrimitive.Title class="sr-only">{title}</DialogPrimitive.Title>
			<div class="h-full">
				{@render children()}
			</div>
		</DialogPrimitive.Content>
	</DialogPrimitive.Portal>
</DialogPrimitive.Root>
