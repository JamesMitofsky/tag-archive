<!--
	The single way this app renders a content image (artefact scans, upload previews).
	Routes rasters through Vercel's image optimizer (avif/webp via content
	negotiation, resize to the displayed width, CDN cache) so a 2 MB scan never ships
	at full resolution — then falls back to a plain <img> wherever it can't help:

	  • dev — `/_vercel/image` 404s under the plain vite server, so optimize in prod only.
	  • svg / gif — svg needs no raster pass; transforming a gif drops its animation.
	  • anything but an absolute http(s) URL — blob: and data: URLs are client-only,
	    and same-origin files (the seed scans in static/) are kept away from the
	    optimizer altogether (`localPatterns: []` in svelte.config.js), so a gated
	    file never depends on how the optimizer fetches it.
	  • the optimizer answering with an error (its monthly allowance spent, say) —
	    the image falls back to the plain source rather than breaking.

	The optimizer URL is built here rather than via a helper lib on purpose: the seed
	archive's filenames contain spaces (`/artefacts/Foo Bar.webp`), and those must be
	percent-encoded (`%20`) in the `url` param. `encodeURIComponent` does that; the
	`+` a form-encoder would emit is read literally and 404s. svelte.config.js allows
	the bucket's host, from R2_PUBLIC_URL.

	The optimizer only renders the widths the build declared, so every width asked
	for is snapped onto that list first ($lib/images/cdnWidths).

	Layout/sizing stays with the caller (via `class`) — this only decides the source.
-->
<script lang="ts">
	import { fileExt } from '$lib/fileType';
	import { cdnWidth } from '$lib/images/cdnWidths';

	let {
		src,
		alt = '',
		class: className = '',
		sizes = '(min-width: 768px) 50vw, 100vw',
		loading = 'lazy',
		// Candidate render widths for the srcset; the browser picks per `sizes` + DPR.
		widths = [320, 480, 640, 960, 1280, 1920],
		...rest
	}: {
		src: string;
		alt?: string;
		class?: string;
		sizes?: string;
		loading?: 'lazy' | 'eager';
		widths?: number[];
		[key: string]: unknown;
	} = $props();

	const optimizable = $derived(
		['png', 'jpg', 'jpeg', 'webp', 'avif'].includes(fileExt(src)) && /^https?:\/\//.test(src)
	);
	// Set when the optimizer fails this source; a new source gets a fresh try.
	let failedSrc = $state<string | null>(null);
	const useCdn = $derived(optimizable && import.meta.env.PROD && failedSrc !== src);

	// One optimizer URL at an allowed width. WebP is served to browsers that
	// accept it (svelte.config.js); the aspect ratio is always preserved.
	const cdnUrl = (w: number) => `/_vercel/image?url=${encodeURIComponent(src)}&w=${w}&q=75`;

	// Snapped and deduplicated: two requested widths may land on one allowed width.
	const cdnWidths = $derived([...new Set(widths.map(cdnWidth))].sort((a, b) => a - b));
	const cdnSrc = $derived(cdnUrl(cdnWidths[cdnWidths.length - 1]));
	const cdnSrcset = $derived(cdnWidths.map((w) => `${cdnUrl(w)} ${w}w`).join(', '));
</script>

{#if useCdn}
	<img
		src={cdnSrc}
		srcset={cdnSrcset}
		{sizes}
		{alt}
		{loading}
		decoding="async"
		class={className}
		onerror={() => (failedSrc = src)}
		{...rest}
	/>
{:else}
	<img {src} {alt} {loading} decoding="async" class={className} {...rest} />
{/if}
