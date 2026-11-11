import { describe, expect, it } from 'vitest';
import { heicLike } from '$lib/testing/images';
import { heicToJpeg } from './heic';

// The real libheif build, which the other specs stand in for. There is no
// HEIC fixture to convert (and no encoder to make one), so this only shows the
// module and its worker load and answer: libheif itself reads the file and
// finds no image in it.

describe('heicToJpeg', () => {
	it('loads libheif, which refuses a file with no image in it', async () => {
		const error = await heicToJpeg(heicLike('empty.heic')).catch((e: unknown) => e);
		expect(String(error)).toContain('HEIF image not found');
	});
});
