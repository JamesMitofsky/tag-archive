import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { sniffImageType } from '$lib/imageType';
import { webpDimensions } from '../webpDimensions';
import { sniffVideoType } from './videoType';

// displayCopy reads MAX_DISPLAY_DIM from ../imageUploads, which opens the database.
await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('$lib/server/db/testing');
	useTestDatabaseUrl();
});
vi.mock('$env/dynamic/private', () => ({ env: process.env }));
const { displayCopy } = await import('./displayCopy');

/** A camera-ish JPEG: landscape pixels, EXIF saying "rotate 90°", and a GPS position. */
async function cameraJpeg(width: number, height: number): Promise<Uint8Array> {
	const jpeg = await sharp({
		create: { width, height, channels: 3, background: { r: 120, g: 160, b: 90 } }
	})
		.jpeg()
		// withExif can't set the orientation tag; withMetadata writes it, merged with the rest.
		.withMetadata({ orientation: 6 })
		.withExifMerge({
			IFD0: { Make: 'Test', Model: 'Camera' },
			IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '38/1 54/1 0/1' }
		})
		.toBuffer();
	const meta = await sharp(jpeg).metadata();
	// Guard the fixture itself: without these the test below proves nothing.
	if (meta.orientation !== 6 || !meta.exif) throw new Error('fixture lost its EXIF');
	return new Uint8Array(jpeg);
}

describe('displayCopy', () => {
	it('makes an upright WebP no larger than 2560px, carrying no metadata', async () => {
		const webp = await displayCopy(await cameraJpeg(3200, 2400));
		expect(sniffImageType(webp)).toBe('image/webp');
		// Orientation 6 turns the 3200×2400 landscape into a portrait, then 2560 caps it.
		expect(webpDimensions(webp)).toEqual({ width: 1920, height: 2560 });
		const meta = await sharp(webp).metadata();
		expect(meta.exif).toBeUndefined();
		expect(meta.xmp).toBeUndefined();
	});

	it('never enlarges a smaller photograph', async () => {
		const webp = await displayCopy(await cameraJpeg(1200, 900));
		expect(webpDimensions(webp)).toEqual({ width: 900, height: 1200 });
	});

	it('refuses bytes that are not an image', async () => {
		await expect(
			displayCopy(new TextEncoder().encode('<html>not a photo</html>'))
		).rejects.toThrow();
	});
});

describe('sniffVideoType', () => {
	const box = (brand: string) => {
		const bytes = new Uint8Array(32);
		bytes.set([0, 0, 0, 24], 0);
		bytes.set(new TextEncoder().encode(`ftyp${brand}`), 4);
		return bytes;
	};

	it('tells MP4 from QuickTime by brand', () => {
		expect(sniffVideoType(box('mp42'))).toBe('video/mp4');
		expect(sniffVideoType(box('isom'))).toBe('video/mp4');
		expect(sniffVideoType(box('qt  '))).toBe('video/quicktime');
	});

	it('refuses a HEIC still and anything without an ftyp box', () => {
		expect(sniffVideoType(box('heic'))).toBeNull();
		expect(
			sniffVideoType(new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
		).toBeNull();
		expect(sniffVideoType(new Uint8Array(4))).toBeNull();
	});
});
