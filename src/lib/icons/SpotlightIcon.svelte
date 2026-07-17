<script lang="ts">
	// Phosphor has no Spotlight glyph, so this local icon mirrors the phosphor-svelte
	// API (size / weight / class + spread) as a drop-in — a stage spotlight casting a
	// beam onto a lit ellipse. `weight` is accepted for API parity but unused (fill only).
	let {
		size = 256,
		weight,
		class: klass = '',
		...rest
	}: { size?: number | string; weight?: string; class?: string; [key: string]: unknown } = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 256 256"
	fill="currentColor"
	class={klass}
	{...rest}
>
	<!-- Lamp head -->
	<rect x="84" y="24" width="88" height="44" rx="10" transform="rotate(20 128 46)" />
	<!-- Beam cone -->
	<path d="M96 78 L48 214 L208 214 L160 78 Z" opacity="0.55" />
	<!-- Lit pool -->
	<ellipse cx="128" cy="214" rx="88" ry="20" />
</svg>
