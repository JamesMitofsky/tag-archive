<!--
	The single way this app renders a content image (artefact scans, upload previews).
	Routes rasters through the Netlify Image CDN (auto webp/avif via content
	negotiation, resize to the displayed width, edge cache) so a 2 MB scan never ships
	at full resolution — then falls back to a plain <img> wherever the CDN can't help:

	  • dev — `/.netlify/images` 404s under the plain vite server, so optimize in prod only.
	  • svg / gif — svg needs no raster pass; transforming a gif drops its animation.
	  • blob: / data: — transient, client-only URLs the CDN can't fetch.

	The CDN URL is built here rather than via a helper lib on purpose: the seed
	archive's filenames contain spaces (`/artefacts/Foo Bar.webp`), and those must be
	percent-encoded (`%20`) in the `url` param. `encodeURIComponent` does that; the
	`+` a form-encoder would emit is read literally by the CDN and 404s. Same builder
	handles same-origin paths and allowlisted remote R2 URLs alike.

	Layout/sizing stays with the caller (via `class`) — this only decides the source.
-->
<script lang="ts">
	import { fileExt } from '$lib/fileType';

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
		['png', 'jpg', 'jpeg', 'webp', 'avif'].includes(fileExt(src)) &&
			!src.startsWith('blob:') &&
			!src.startsWith('data:')
	);
	const useCdn = $derived(optimizable && import.meta.env.PROD);

	// One Netlify Image CDN URL at a given width. No `fm` → the CDN content-negotiates
	// webp/avif from the Accept header. No `h`/`fit` → aspect ratio is preserved.
	const cdnUrl = (w: number) => `/.netlify/images?url=${encodeURIComponent(src)}&w=${w}&q=75`;

	const cdnSrc = $derived(cdnUrl(widths[widths.length - 1]));
	const cdnSrcset = $derived(widths.map((w) => `${cdnUrl(w)} ${w}w`).join(', '));
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
		{...rest}
	/>
{:else}
	<img {src} {alt} {loading} decoding="async" class={className} {...rest} />
{/if}
