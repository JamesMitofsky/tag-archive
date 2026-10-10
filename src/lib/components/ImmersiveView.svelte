<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { untrack, type Snippet } from 'svelte';
	import { afterNavigate, onNavigate, pushState } from '$app/navigation';
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
		steps = 1,
		title,
		onClose,
		children
	}: {
		open: boolean;
		/**
		 * How many presses of back the view answers while open, each with one
		 * `onClose`: 2 lets the first press move the surface back a step and the
		 * second close it. Raise it only in answer to a tap (see `settle`).
		 */
		steps?: number;
		/** Announced to assistive tech; not rendered visibly. */
		title: string;
		/** Escape, back, or anything else the primitive treats as dismissal. */
		onClose: () => void;
		children: Snippet;
	} = $props();

	// While open, the view stacks `steps` shallow history entries of its own
	// (same URL, see SvelteKit's shallow routing), so back pops one of those
	// instead of leaving the page. A pop never reaches beforeNavigate, so it
	// can't trip an unsaved-changes guard either.
	const id = $props.id();
	/**
	 * This open's mark on its entries. Fresh per open, so an entry left behind
	 * by an earlier open (reached with forward, or kept across a reload) is
	 * never taken for one of this open's.
	 */
	let token: string | null = null;
	/** How many entries this view has stacked; it stands on the top one. */
	let owned = 0;
	/** A real navigation is unmounting the view: the entries are history now. */
	let leaving = false;

	/** How many of this open's entries are at or below the one `state` belongs to. */
	function depthOf(state: App.PageState) {
		return token !== null && state.immersive === token ? (state.immersiveStep ?? 0) + 1 : 0;
	}

	/** Stack or unwind entries until the view owns `target` of them. */
	function settle(target: number) {
		if (target > owned) {
			// Only ever in answer to a tap. Chrome's back skips entries a page adds
			// without one (its history manipulation intervention), so an entry
			// pushed after a back gesture would send the next back out of the app.
			if (navigator.userActivation && !navigator.userActivation.isActive) return;
			try {
				if (owned === 0) token = `${id}:${crypto.randomUUID()}`;
				while (owned < target) {
					pushState('', { ...page.state, immersive: token!, immersiveStep: owned });
					owned += 1;
				}
			} catch {
				// No router, as when the component is rendered on its own: back just
				// isn't intercepted.
				if (owned === 0) token = null;
			}
		} else if (target < owned) {
			// Unwound before it lands, so the popstate this causes finds nothing to do.
			const extra = owned - target;
			owned = target;
			history.go(-extra);
		}
	}

	$effect(() => {
		const target = open ? steps : 0;
		untrack(() => settle(target));
	});

	// Runs after SvelteKit's own popstate handler, which has already set
	// `page.state` to the entry now current. Watching `page.state` itself would
	// not do: a form submit's `invalidateAll` resets it without anyone pressing
	// back.
	function onPopState() {
		const at = depthOf(page.state);
		if (at === owned) return;
		if (at > owned) {
			// Forward onto entries this open had already unwound: unwind again.
			owned = at;
			settle(open ? steps : 0);
			return;
		}
		// Back, by the user: the entries above `at` are gone already.
		const pressed = owned - at;
		owned = at;
		for (let i = 0; i < pressed && open; i++) onClose();
	}

	onNavigate(() => {
		leaving = true;
	});
	afterNavigate(() => {
		leaving = false;
	});

	// Unmounted while open without a navigation (a form swapped for its
	// thank-you message): take the entries along, or the next back would seem
	// to do nothing.
	$effect(() => () => {
		if (owned > 0 && !leaving) history.go(-owned);
	});
</script>

<svelte:window onpopstate={onPopState} />

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
