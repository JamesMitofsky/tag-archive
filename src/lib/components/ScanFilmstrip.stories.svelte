<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { fn } from 'storybook/test';
	import ScanFilmstrip from './ScanFilmstrip.svelte';
	import type { ScanPage } from '$lib/scanner/types';

	/** A 3:4 page-shaped placeholder, so thumbnails size like real scans. */
	const shot = (label: string, hue: number) =>
		`data:image/svg+xml;utf8,${encodeURIComponent(
			`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="hsl(${hue} 20% 92%)"/><text x="150" y="210" font-family="sans-serif" font-size="42" text-anchor="middle" fill="#555">${label}</text></svg>`
		)}`;

	const page = (n: number, extra: Partial<ScanPage> = {}): ScanPage => ({
		id: `page-${n}`,
		url: `https://example.com/scan${n}.webp`,
		fileName: `scan-${n}.webp`,
		previewUrl: shot(String(n), n * 47),
		status: 'done',
		sourceBlob: new Blob(),
		...extra
	});

	const { Story } = defineMeta({
		title: 'Scanner/ScanFilmstrip',
		component: ScanFilmstrip,
		tags: ['autodocs'],
		args: {
			canRetake: true,
			onMove: fn(),
			onRemove: fn(),
			onAdjust: fn(),
			onRetake: fn()
		}
	});
</script>

<!-- Both move buttons disabled: the single-page edge case. -->
<Story name="One page" args={{ pages: [page(1)] }} />

<Story name="Several pages" args={{ pages: [page(1), page(2), page(3), page(4)] }} />

<!-- Mixed states are tedious to reach through the real camera flow. -->
<Story
	name="Mixed upload states"
	args={{
		pages: [
			page(1),
			page(2, { status: 'uploading', url: undefined }),
			page(3, { status: 'error', url: undefined, error: 'Upload failed: 413 Payload Too Large' })
		]
	}}
/>

<!-- Server-seeded pages from the edit flow: no local original, so no crop control. -->
<Story
	name="No local original"
	args={{ pages: [page(1, { sourceBlob: undefined }), page(2, { sourceBlob: undefined })] }}
/>

<Story name="Long run" args={{ pages: Array.from({ length: 12 }, (_, i) => page(i + 1)) }} />
