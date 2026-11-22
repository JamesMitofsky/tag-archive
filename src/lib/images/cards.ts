/**
 * The cards /images floats. Unsearched, every card is a set, a pile of its
 * prints. A search adds the photographs that show what was asked for (see
 * #lib/server/contentSearch), each loose, as a card of its own, so the
 * photograph of flowers is what the reader sees rather than whichever print
 * happens to top its pile. Sets that match by their own words stay piles.
 *
 * A loose photograph opens as its whole set, with that photograph leading.
 */
import type { PublicImage, PublicImageSet } from './types';

export type SetCard = { kind: 'set'; id: number; set: PublicImageSet };
export type PhotoCard = { kind: 'photo'; id: number; set: PublicImageSet; photo: PublicImage };
export type ImageCard = SetCard | PhotoCard;

/**
 * A loose photograph's card id: the photograph's own id, negated. The cloud
 * keys cards by id, and set ids and photograph ids come from two tables that
 * both count up from 1, so negating keeps the two kinds apart. Photograph ids
 * are never 0, so no card id is ever claimed twice.
 */
export function photoCardId(imageId: number): number {
	return -imageId;
}

/** Every card a search could show: each set, and each of its photographs loose. */
export function imageCards(sets: PublicImageSet[]): ImageCard[] {
	const cards: ImageCard[] = [];
	for (const set of sets) cards.push({ kind: 'set', id: set.id, set });
	for (const set of sets) {
		for (const photo of set.images) {
			cards.push({ kind: 'photo', id: photoCardId(photo.id), set, photo });
		}
	}
	return cards;
}

/**
 * What a card holds once opened, in order: a set's photographs as the set
 * orders them, or for a loose photograph the same, with that photograph moved
 * to the front, since the first is the one that stays put as the rest spill.
 */
export function cardPhotos(card: ImageCard): PublicImage[] {
	if (card.kind === 'set') return card.set.images;
	return [card.photo, ...card.set.images.filter((image) => image.id !== card.photo.id)];
}

/**
 * The trimmed, lowercased, single-spaced form of a content query: the one
 * spelling /api/images/search answers (and caches) a query under.
 */
export function normalizeContentQuery(q: string): string {
	return q.trim().toLowerCase().replace(/\s+/g, ' ');
}
