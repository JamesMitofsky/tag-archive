<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { tick, untrack, type Snippet } from 'svelte';
	import { pushState } from '$app/navigation';
	import { page } from '$app/state';

	// A full-viewport, dark, single-task surface: the camera, the crop editor,
	// anything the user should do with the form out of sight. Built on the same
	// bits-ui Dialog as the app's modals so focus trapping, scroll locking, Escape
	// and the inert page behind it all come for free — only the chrome differs:
	// no dim overlay, no close button, no zoom, just a short fade.
	//
	// Fully controlled: `open` alone decides whether it shows. Escape is handed to
	// `onClose` with the primitive's own close cancelled, because a surface may
	// answer Escape by changing what it shows rather than by closing — and if the
	// primitive closed itself while `open` stayed true, the two would disagree.
	//
	// The system back gesture means the same as Escape. A full-screen view is
	// where people reach for it (Android back, iOS edge swipe), and without this
	// it would leave the whole form, taking whatever the view held with it.
	let {
		open,
		title,
		onClose,
		children
	}: {
		open: boolean;
		/** Announced to assistive tech; not rendered visibly. */
		title: string;
		/** Escape, back, or anything else the primitive treats as dismissal. */
		onClose: () => void;
		children: Snippet;
	} = $props();

	// While open, the view sits on a shallow history entry of its own (same URL,
	// see SvelteKit's shallow routing), so back pops that entry instead of
	// leaving the page. A pop never reaches beforeNavigate, so it can't trip an
	// unsaved-changes guard either.
	const entry = $props.id();
	/** True while the current history entry is the one this view pushed. */
	let ownsEntry = false;

	function pushEntry() {
		if (ownsEntry) return;
		try {
			pushState('', { ...page.state, immersive: entry });
			ownsEntry = true;
		} catch {
			// No router, as when the component is rendered on its own: back just
			// isn't intercepted.
		}
	}

	$effect(() => {
		if (open) untrack(pushEntry);
		else if (ownsEntry) {
			// Closed from inside: drop the entry so back means back again.
			ownsEntry = false;
			history.back();
		}
	});

	$effect(() => {
		const current = page.state.immersive;
		untrack(() => {
			if (!ownsEntry || current === entry) return;
			// Back popped the entry: the entry is gone, so treat it as Escape.
			ownsEntry = false;
			onClose();
			// The surface moved on rather than closing (camera to crop step):
			// stand ready for the next back.
			void tick().then(() => {
				if (open) pushEntry();
			});
		});
	});
</script>

<DialogPrimitive.Root {open} onOpenChange={(next) => !next && onClose()}>
	<DialogPrimitive.Portal>
		<DialogPrimitive.Content
			onEscapeKeydown={(event) => {
				event.preventDefault();
				// A held key would walk straight through every step.
				if (!event.repeat) onClose();
			}}
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
