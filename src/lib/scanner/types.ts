import type { CornerPoints } from './detect';

/** One captured or uploaded page. Array position is the page order. */
export type ScanPage = {
	id: string;
	url?: string;
	fileName: string;
	previewUrl: string;
	status: 'uploading' | 'done' | 'error';
	error?: string;
	/**
	 * True once the page's bytes are on their way to the server; until then an
	 * `uploading` page is still being cropped and encoded on the device.
	 */
	sending?: boolean;
	/**
	 * The encoded page whose upload failed, kept so Retry can send the same
	 * bytes again instead of cropping and encoding the photo a second time.
	 */
	failedUpload?: { file: Blob; fileName: string; previewUrl: string };
	/**
	 * The un-cropped original, encoded like the upload (WebP, or JPEG where the
	 * browser can't encode WebP), kept so the crop can be re-adjusted
	 * or reset without another trip to the camera. Absent for `initial` pages,
	 * which have no local original.
	 */
	sourceBlob?: Blob;
	/** Applied crop, in `sourceBlob`'s pixel space. */
	corners?: CornerPoints;
	/**
	 * Quarter turns clockwise (0–3) applied to the cropped page. Kept
	 * apart from the original, so every rotation renders afresh from it rather
	 * than re-encoding the last upload.
	 */
	turns?: number;
};
