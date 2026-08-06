/**
 * Shared helpers for classifying attachment URLs by extension. Used wherever a
 * stored file URL (an artefact scan, an in-flight upload preview) is rendered, so
 * "is this an image?" is decided the same way in every component.
 */

/** Lowercased file extension, ignoring any query string or fragment. */
export function fileExt(url: string): string {
	const path = url.split('?')[0].split('#')[0];
	return path.slice(path.lastIndexOf('.') + 1).toLowerCase();
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'];

/** True when the URL points at an image we can render inline (vs. a file link). */
export function isImageUrl(url: string): boolean {
	return IMAGE_EXTS.includes(fileExt(url));
}
