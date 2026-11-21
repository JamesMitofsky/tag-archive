/**
 * Which kinds of item the Archive Stream shows. The operator turns each on or
 * off from the projector's overlay, and the choice is remembered on that
 * device, so a projector that reloads mid-evening comes back as it was set.
 */

import type { FieldKind } from './field.ts';

/** Each kind with the name the overlay gives it, in the order shown. */
export const KINDS: readonly { kind: FieldKind; label: string }[] = [
	{ kind: 'artefact', label: 'artefacts' },
	{ kind: 'photo', label: 'images' },
	{ kind: 'event', label: 'events' }
];

export type ShownKinds = Record<FieldKind, boolean>;

const STORAGE_KEY = 'archive-stream:hidden';

function store(): Storage | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

/**
 * The kinds to show: all of them, less any this device remembers hiding. The
 * hidden ones are what is stored, so a kind added later starts out shown.
 */
export function readShownKinds(): ShownKinds {
	let hidden: string[] = [];
	try {
		hidden = (store()?.getItem(STORAGE_KEY) ?? '').split(',');
	} catch {
		// Storage that can't be read is storage with nothing in it.
	}
	const shown = {} as ShownKinds;
	for (const { kind } of KINDS) shown[kind] = !hidden.includes(kind);
	return shown;
}

export function rememberShownKinds(shown: ShownKinds): void {
	const hidden = KINDS.filter(({ kind }) => !shown[kind]).map(({ kind }) => kind);
	try {
		if (hidden.length) store()?.setItem(STORAGE_KEY, hidden.join(','));
		else store()?.removeItem(STORAGE_KEY);
	} catch {
		// A full or blocked store only costs the memory, not the filter.
	}
}

export function kindSet(shown: ShownKinds): Set<FieldKind> {
	return new Set(KINDS.filter(({ kind }) => shown[kind]).map(({ kind }) => kind));
}
