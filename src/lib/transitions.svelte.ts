// Shared-element "morph" page transitions for the keeper lists.
//
// When a card in the artefacts or events list is clicked, the browser's View
// Transitions API morphs it into the detail page's hero card. Coordination lives
// in the root layout's onNavigate; this module supplies the naming/scoping helpers
// and a reactive flag the layout uses to stand down its own cross-fade.

type MorphKind = 'artefact' | 'event';

// A stable per-item view-transition-name. Both the source card and the
// destination hero carry the same name so the browser pairs them.
export function morphName(kind: MorphKind, id: string | number): string {
	return `${kind}-${id}`;
}

// The artefact detail route is the catch-all /keeper/[id], so these segments are
// sibling routes rather than artefact ids and must never be treated as a detail.
const ARTEFACT_DETAIL_DENY = new Set([
	'artefacts',
	'events',
	'series',
	'add',
	'contributors',
	'settings',
	'scans'
]);

function stripTrailingSlash(path: string): string {
	return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

// If `path` is an in-scope detail page, return its morph name; else null.
function detailName(path: string): string | null {
	const p = stripTrailingSlash(path);

	// Event detail: /keeper/events/{id} (id ≠ add).
	const event = p.match(/^\/keeper\/events\/([^/]+)$/);
	if (event) {
		const id = event[1];
		return id === 'add' ? null : morphName('event', id);
	}

	// Artefact detail: /keeper/{id}, id not a sibling route.
	const artefact = p.match(/^\/keeper\/([^/]+)$/);
	if (artefact) {
		const id = artefact[1];
		return ARTEFACT_DETAIL_DENY.has(id) ? null : morphName('artefact', id);
	}

	return null;
}

const isArtefactsList = (p: string) => stripTrailingSlash(p) === '/keeper/artefacts';
const isEventsList = (p: string) => stripTrailingSlash(p) === '/keeper/events';

// Returns the morph name to run for a from→to navigation, or null if the pair is
// not an in-scope list↔detail move (either direction). Series is never in scope.
export function morphNameForPair(from: string | undefined, to: string | undefined): string | null {
	if (!from || !to) return null;

	// Forward: list → detail.
	const toDetail = detailName(to);
	if (toDetail) {
		if (toDetail.startsWith('artefact-') && isArtefactsList(from)) return toDetail;
		if (toDetail.startsWith('event-') && isEventsList(from)) return toDetail;
		return null;
	}

	// Back: detail → list.
	const fromDetail = detailName(from);
	if (fromDetail) {
		if (fromDetail.startsWith('artefact-') && isArtefactsList(to)) return fromDetail;
		if (fromDetail.startsWith('event-') && isEventsList(to)) return fromDetail;
	}

	return null;
}

export function reducedMotion(): boolean {
	return (
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

// True while a morph view transition is in flight. The root layout reads this to
// zero out its keyed fade so the two don't animate the same pixels at once.
let _morphActive = $state(false);

export const morph = {
	get active(): boolean {
		return _morphActive;
	},
	set active(value: boolean) {
		_morphActive = value;
	}
};
