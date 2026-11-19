/**
 * An event's feature image, as the browser and the server both handle it. Kept
 * free of server imports so the edit page's picker can use it.
 *
 * The image is one of two kinds of thing the archive already holds:
 *  - a photograph: an `image` row, named by its id;
 *  - an artefact page: one of an artefact's `file_urls`, named by the artefact's
 *    id and the page's URL (an artefact's pages are URLs, not rows).
 */
export type FeatureRef =
	{ kind: 'image'; imageId: number } | { kind: 'artefact'; artefactId: number; url: string };

/** What a feature image renders as, wherever it is shown. */
export type FeatureImage = {
	/** The photograph's WebP display copy, or the artefact page's URL. */
	url: string;
	/** Known for photographs; an artefact page's dimensions aren't stored. */
	width: number | null;
	height: number | null;
};

/** A feature image with what it came from, for keeper pages that link back to it. */
export type FeatureImageWithSource = FeatureImage & {
	ref: FeatureRef;
	source:
		| { kind: 'image'; setId: number; label: string }
		| { kind: 'artefact'; artefactId: number; label: string };
};

/**
 * What the picker offers: one artefact or image set, with each of its
 * pages or photographs that can be featured.
 */
export type FeatureCandidateGroup = {
	kind: 'artefact' | 'imageSet';
	id: number;
	/** The artefact's title, or the set's derived label (see $lib/images/label). */
	label: string;
	/** A partial date (see $lib/partialDate), null when undated. */
	date: string | null;
	/** Still awaiting review: it can be chosen, but shows publicly only once vetted. */
	proposed: boolean;
	images: FeatureCandidate[];
};

/** One photograph or page the picker offers. */
export type FeatureCandidate = FeatureImage & {
	/** The form value that chooses it (see `encodeFeatureRef`). */
	ref: string;
};

const IMAGE_PREFIX = 'image:';
const ARTEFACT_PREFIX = 'artefact:';

/**
 * One form value for a ref: `image:<id>`, or `artefact:<id>:<url>`. The URL is
 * last and kept whole, so the colons a URL carries never confuse the parse.
 */
export function encodeFeatureRef(ref: FeatureRef): string {
	return ref.kind === 'image'
		? `${IMAGE_PREFIX}${ref.imageId}`
		: `${ARTEFACT_PREFIX}${ref.artefactId}:${ref.url}`;
}

/** A positive integer id, written plainly (no sign, no leading zero, no exponent). */
function parseId(text: string): number | null {
	if (!/^[1-9]\d*$/.test(text)) return null;
	const id = Number(text);
	return Number.isSafeInteger(id) ? id : null;
}

/**
 * Read a form value written by `encodeFeatureRef`. An empty value is a choice
 * too, of no feature image (`null`); anything else that isn't a ref is
 * `undefined`, so a caller can tell a cleared field from a malformed one.
 */
export function parseFeatureRef(value: string): FeatureRef | null | undefined {
	if (value === '') return null;
	if (value.startsWith(IMAGE_PREFIX)) {
		const imageId = parseId(value.slice(IMAGE_PREFIX.length));
		return imageId === null ? undefined : { kind: 'image', imageId };
	}
	if (value.startsWith(ARTEFACT_PREFIX)) {
		const rest = value.slice(ARTEFACT_PREFIX.length);
		const colon = rest.indexOf(':');
		if (colon === -1) return undefined;
		const artefactId = parseId(rest.slice(0, colon));
		const url = rest.slice(colon + 1);
		return artefactId === null || url === '' ? undefined : { kind: 'artefact', artefactId, url };
	}
	return undefined;
}

/** Whether two refs name the same image (either may be null, for none). */
export function sameFeatureRef(a: FeatureRef | null, b: FeatureRef | null): boolean {
	if (a === null || b === null) return a === b;
	return encodeFeatureRef(a) === encodeFeatureRef(b);
}
