import { readDateField } from '$lib/partialDate';
import { check, defineSuite, isPartialDate, maxLen, str } from './helpers';

/** The most photographs one set may hold. Mirrored by the uploader's `max`. */
export const MAX_IMAGES_PER_SET = 50;

/** Normalised image-set form values — validated, then used for the DB write. */
export type ImageSetData = {
	description: string;
	event: string;
	/** Uploaded image ids (see /api/images/finalize), in display order. */
	imageIds: number[];
	/**
	 * Only read when `dateAuto` is false (the edit page's override): a partial
	 * date, null when deliberately undated, '' when not chosen yet.
	 */
	date: string | null;
	/** True when the set's date follows its photographs' capture dates. */
	dateAuto: boolean;
};

/**
 * Read an image-set create/edit form. Shared by the actions and `use:enhance`.
 * The create forms always send `dateAuto=on` (a hidden field); the edit form's
 * checkbox sends it only while checked, so an absent field means "set by hand".
 * Ids that aren't numbers parse to NaN, for the suite to refuse.
 */
export function parseImageSetForm(fd: FormData): ImageSetData {
	return {
		description: str(fd.get('description')),
		event: str(fd.get('event')),
		imageIds: fd
			.getAll('imageIds')
			.map((value) => String(value).trim())
			.filter(Boolean)
			.map((value) => (/^\d+$/.test(value) ? Number(value) : NaN)),
		date: readDateField(str(fd.get('date'))),
		dateAuto: fd.get('dateAuto') === 'on'
	};
}

export function createImageSetSuite() {
	return defineSuite<ImageSetData>((data) => {
		maxLen('description', data.description ?? '', 2000, 'description');
		maxLen('event', data.event ?? '', 200, 'event');

		const ids = data.imageIds ?? [];
		check('imageIds', 'Add at least one photograph', ids.length >= 1);
		check(
			'imageIds',
			`Add at most ${MAX_IMAGES_PER_SET} photographs`,
			ids.length <= MAX_IMAGES_PER_SET
		);
		check(
			'imageIds',
			'Those photographs could not be attached',
			ids.every((id) => Number.isSafeInteger(id) && id > 0) && new Set(ids).size === ids.length
		);

		// A date only matters once an admin takes it over from the photographs.
		// Both rules always run (vest needs a stable test order); each passes when
		// it doesn't apply. Same rules as an artefact's date.
		const manual = !data.dateAuto;
		const date = data.date;
		check('date', 'Pick a date, or choose “No date”', !manual || date !== '');
		check(
			'date',
			'Pick a valid date',
			!manual || date === null || date === '' || isPartialDate(date)
		);
	});
}
