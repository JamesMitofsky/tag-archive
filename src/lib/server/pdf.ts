import { PDFDocument } from 'pdf-lib';

// Compiles already-decoded scan images into a single PDF: one image per page, in the
// order given. Deliberately network-free and free of any app types — the endpoint does
// the fetching, this only lays bytes onto pages, so it is unit-testable without I/O.
//
// pdf-lib embeds JPEG and PNG only; callers are responsible for normalising webp/heic
// upstream (see fetchNormalizedImage in ./imageBytes).

/** A4 at 72 dpi, portrait. Landscape pages swap the two. */
const A4_SHORT = 595.28;
const A4_LONG = 841.89;

/** Whitespace kept around the image on every side. */
const MARGIN = 24;

export type PdfImage = { bytes: Uint8Array; type: 'jpg' | 'png' };

/**
 * One page per image, each scaled to fit inside the margins and centred. Page
 * orientation follows the image so a landscape scan isn't shrunk to fit a portrait
 * page.
 */
export async function buildImagePdf(images: PdfImage[]): Promise<Uint8Array<ArrayBuffer>> {
	if (images.length === 0) throw new Error('buildImagePdf needs at least one image');

	const doc = await PDFDocument.create();

	for (const image of images) {
		const embedded =
			image.type === 'png' ? await doc.embedPng(image.bytes) : await doc.embedJpg(image.bytes);

		const landscape = embedded.width > embedded.height;
		const pageWidth = landscape ? A4_LONG : A4_SHORT;
		const pageHeight = landscape ? A4_SHORT : A4_LONG;
		const page = doc.addPage([pageWidth, pageHeight]);

		// Contain: one scale factor for both axes, so the scan is never stretched.
		const frameWidth = pageWidth - MARGIN * 2;
		const frameHeight = pageHeight - MARGIN * 2;
		const scale = Math.min(frameWidth / embedded.width, frameHeight / embedded.height);
		const drawWidth = embedded.width * scale;
		const drawHeight = embedded.height * scale;

		page.drawImage(embedded, {
			x: (pageWidth - drawWidth) / 2,
			y: (pageHeight - drawHeight) / 2,
			width: drawWidth,
			height: drawHeight
		});
	}

	// pdf-lib always allocates a plain ArrayBuffer, but types the view as ArrayBufferLike
	// (i.e. possibly shared), which isn't assignable to BodyInit. Narrow it once here so
	// the endpoint can hand the bytes straight to a Response without copying.
	return (await doc.save()) as Uint8Array<ArrayBuffer>;
}
