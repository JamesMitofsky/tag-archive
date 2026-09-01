import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildImagePdf, type PdfImage } from './pdf';

// Fixtures are inline so the test never touches disk or network: a 2x4 (tall) JPEG and
// a 4x2 (wide) PNG — the two formats pdf-lib can embed, in the two orientations.
const TALL_JPG =
	'/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAqADAAQAAAABAAAABAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgABAACAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A8Pooor+dz/SA/9k=';
const WIDE_PNG =
	'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAEElEQVR42mM4YaMBRwzIHAB++glhJkfPqAAAAABJRU5ErkJggg==';

function fixture(base64: string, type: PdfImage['type']): PdfImage {
	return { bytes: new Uint8Array(Buffer.from(base64, 'base64')), type };
}

describe('buildImagePdf', () => {
	it('emits one page per image, in the order given', async () => {
		const bytes = await buildImagePdf([
			fixture(TALL_JPG, 'jpg'),
			fixture(WIDE_PNG, 'png'),
			fixture(TALL_JPG, 'jpg')
		]);

		expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');

		const doc = await PDFDocument.load(bytes);
		expect(doc.getPageCount()).toBe(3);
	});

	it('orients each page to its image', async () => {
		const bytes = await buildImagePdf([fixture(TALL_JPG, 'jpg'), fixture(WIDE_PNG, 'png')]);
		const doc = await PDFDocument.load(bytes);

		const portrait = doc.getPage(0).getSize();
		expect(portrait.height).toBeGreaterThan(portrait.width);

		const landscape = doc.getPage(1).getSize();
		expect(landscape.width).toBeGreaterThan(landscape.height);
	});

	it('rejects an empty set rather than emitting a blank document', async () => {
		await expect(buildImagePdf([])).rejects.toThrow(/at least one image/);
	});
});
