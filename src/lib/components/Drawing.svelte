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

	function checkLoad(node: HTMLImageElement) {
		if (node.complete) {
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
</style>
