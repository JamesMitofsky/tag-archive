<script lang="ts">
	import { cn } from '$lib/utils';

	let {
		src,
		alt = '',
		text,
		textClass = '',
		class: className = '',
		style = '',
		...restProps
	}: {
		src: string;
		alt?: string;
		/**
		 * Words set in type in place of the drawing when its file can't be shown
		 * (missing or broken), so a link whose art hasn't been drawn yet, or failed
		 * to arrive, is still there to read and press. Without it a failed drawing
		 * stays invisible.
		 */
		text?: string;
		/**
		 * Classes for the typeset stand-in only, applied over `class` (which it
		 * shares with the drawing, so it takes the drawing's size).
		 */
		textClass?: string;
		class?: string;
		style?: string;
		[key: string]: unknown;
	} = $props();

	let loaded = $state(false);
	// True when the image is already decoded at mount (cached). The fade only
	// exists to smooth the uncached first paint, so cached images skip it and
	// appear instantly — no transition.
	let cached = $state(false);
	// The src that failed to load. Kept as the src rather than a flag so that a
	// new src gets its own attempt instead of inheriting the old failure.
	let failedSrc = $state<string | null>(null);
	const failed = $derived(failedSrc === src);

	function checkLoad(node: HTMLImageElement) {
		if (!node.complete) return;
		// Complete with no pixels: usually a load that failed before hydration,
		// whose error event this component never heard. But an SVG without an
		// intrinsic size reports a zero width too, so only `decode()`, which
		// rejects for a broken image alone, can tell the two apart. Only worth
		// asking when there is a stand-in to show.
		if (text && node.naturalWidth === 0) {
			const attempted = src;
			node.decode().then(
				() => {
					cached = true;
					loaded = true;
				},
				() => (failedSrc = attempted)
			);
			return;
		}
		cached = true;
		loaded = true;
	}
</script>

{#if failed && text}
	<!-- Stands in for the drawing as the same thing: an image named by `alt`
	     (its words are not read twice), or hidden like a decorative drawing. -->
	<span
		role={alt ? 'img' : undefined}
		aria-label={alt || undefined}
		aria-hidden={alt ? undefined : 'true'}
		class={cn(
			// The near-black of the drawings' ink, in the friendly hand.
			'inline-flex items-center justify-center font-friendly text-2xl whitespace-nowrap text-[#0d0b0a] select-none',
			className,
			textClass
		)}
		style="mix-blend-mode: multiply; {style}"
		{...restProps}
	>
		{text}
	</span>
{:else}
	<img
		use:checkLoad
		{src}
		{alt}
		decoding="async"
		onload={() => (loaded = true)}
		onerror={() => (failedSrc = src)}
		class="drawing {className}"
		class:loaded
		class:cached
		style="mix-blend-mode: multiply; {style}"
		{...restProps}
	/>
{/if}

<style>
	.drawing {
		opacity: 0;
		transition: opacity 100ms ease-in-out;
		will-change: opacity;
	}

	.drawing.loaded {
		opacity: 1;
	}

	/* Cached at mount: no fade, appear instantly. */
	.drawing.cached {
		transition: none;
	}
</style>
