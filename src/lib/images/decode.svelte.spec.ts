import { describe, expect, it, vi } from 'vitest';
import { canvasPhoto, heicLike, sidewaysJpeg, textFile } from '$lib/testing/images';
import { decodeImage, HEIC_STALLED, HEIC_TIMEOUT_MS, UNREADABLE_PHOTO } from './decode';

// Chromium has no HEIC decoder, which is exactly the case the libheif fallback
// is for. libheif itself (3 MB) is stood in for by a converter returning a
// real JPEG; its own rotation handling is libheif's to test.
vi.mock('./heic', () => ({
	heicToJpeg: vi.fn(async () => {
		const canvas = document.createElement('canvas');
		canvas.width = 300;
		canvas.height = 200;
		canvas.getContext('2d')!.fillRect(0, 0, 150, 100);
		return new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/jpeg'));
	})
}));

describe('decodeImage', () => {
	it('applies the EXIF orientation', async () => {
		const canvas = await decodeImage(await sidewaysJpeg('IMG_0001.JPG', 320, 240), 'image/jpeg');
		expect([canvas.width, canvas.height]).toEqual([240, 320]);
	});

	it('caps the longest edge at 2560, keeping the aspect ratio', async () => {
		const photo = await canvasPhoto('wide.png', { width: 3000, height: 2000 });
		const canvas = await decodeImage(photo, 'image/png');
		expect([canvas.width, canvas.height]).toEqual([2560, 1707]);
	});

	it('leaves a photo within the cap at its own size', async () => {
		const canvas = await decodeImage(await canvasPhoto('small.png'), 'image/png');
		expect([canvas.width, canvas.height]).toEqual([320, 240]);
	});

	it('converts a HEIC the browser cannot decode, and decodes that', async () => {
		const { heicToJpeg } = await import('./heic');
		const file = heicLike('IMG_0002.HEIC');

		const canvas = await decodeImage(file, 'image/heic');

		expect(heicToJpeg).toHaveBeenCalledWith(file);
		expect([canvas.width, canvas.height]).toEqual([300, 200]);
	});

	it('says so when a HEIC cannot be converted either', async () => {
		const { heicToJpeg } = await import('./heic');
		vi.mocked(heicToJpeg).mockRejectedValueOnce('HEIF image not found');

		await expect(decodeImage(heicLike('broken.heic'), 'image/heic')).rejects.toThrow(
			UNREADABLE_PHOTO
		);
	});

	it('only reaches for the HEIC converter for HEIC files', async () => {
		const { heicToJpeg } = await import('./heic');
		vi.mocked(heicToJpeg).mockClear();

		await expect(decodeImage(textFile('notes.png'), 'image/png')).rejects.toThrow(UNREADABLE_PHOTO);
		expect(heicToJpeg).not.toHaveBeenCalled();
	});

	// Last: a stall marks libheif's worker as gone for the rest of the page.
	it('gives up on a HEIC conversion that never answers, and on the ones after it', async () => {
		const { heicToJpeg } = await import('./heic');
		vi.mocked(heicToJpeg).mockClear();
		// libheif's worker died: the conversion neither resolves nor rejects.
		let reached!: () => void;
		const converting = new Promise<void>((resolve) => (reached = resolve));
		vi.mocked(heicToJpeg).mockImplementationOnce(() => {
			reached();
			return new Promise(() => {});
		});
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		try {
			const outcome = decodeImage(heicLike('stuck.heic'), 'image/heic').catch((e: unknown) => e);
			// The native decode fails first, on its own (untimed) schedule.
			await converting;
			await vi.advanceTimersByTimeAsync(HEIC_TIMEOUT_MS - 1);
			expect(await Promise.race([outcome, 'pending'])).toBe('pending');
			await vi.advanceTimersByTimeAsync(1);

			const error = await outcome;
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toBe(HEIC_STALLED);
		} finally {
			vi.useRealTimers();
		}

		// The next one is refused at once rather than queued behind the dead worker.
		await expect(decodeImage(heicLike('next.heic'), 'image/heic')).rejects.toThrow(HEIC_STALLED);
		expect(heicToJpeg).toHaveBeenCalledOnce();
		// Photos the browser decodes itself are unaffected.
		const canvas = await decodeImage(await canvasPhoto('fine.png'), 'image/png');
		expect(canvas.width).toBe(320);
	});
});
