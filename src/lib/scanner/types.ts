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
	 * The un-cropped original, encoded like the upload (WebP, or JPEG where the
	 * browser can't encode WebP), kept so the crop can be re-adjusted
	 * or reset without another trip to the camera. Absent for `initial` pages,
	 * which have no local original.
	 */
	sourceBlob?: Blob;
	/** Applied crop, in `sourceBlob`'s pixel space (before any `turns`). */
	corners?: CornerPoints;
	/**
	 * Quarter turns counterclockwise from `sourceBlob` to the page as uploaded.
	 * Applied when the page is rendered, so the original is never re-encoded
	 * to turn it and `corners` never leaves its space.
	 */
	turns?: number;
	/** The `turns` that `previewUrl` was rendered at, when it was rendered from `sourceBlob`. */
	previewTurns?: number;
};
