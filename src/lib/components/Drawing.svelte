<script lang="ts">
	let {
		src,
		alt = '',
		class: className = '',
		style = '',
		...restProps
	}: {
		src: string;
		alt?: string;
		class?: string;
		style?: string;
		[key: string]: unknown;
	} = $props();

	let loaded = $state(false);
	// True when the image is already decoded at mount (cached). The fade only
	// exists to smooth the uncached first paint, so cached images skip it and
	// appear instantly — no transition.
	let cached = $state(false);

	function checkLoad(node: HTMLImageElement) {
		if (node.complete) {
			cached = true;
			loaded = true;
		}
	}
</script>

<img
	use:checkLoad
	{src}
	{alt}
	decoding="async"
	onload={() => (loaded = true)}
	class="drawing {className}"
	class:loaded
	class:cached
	style="mix-blend-mode: multiply; {style}"
	{...restProps}
/>

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
