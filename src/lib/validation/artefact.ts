import { readDateField } from '$lib/partialDate';
import { PROGRAM_AREAS } from '$lib/programAreas';
import { check, defineSuite, isHttpUrl, isPartialDate, maxLen, splitList, str } from './helpers';

/** Normalised artefact form values — validated, then used for the DB write. */
export type ArtefactData = {
	artefact: string;
	event: string;
	/** A partial date, null when deliberately undated, '' when not chosen yet. */
	date: string | null;
	description: string;
	location: string;
	fileUrls: string[];
	programArea: string[];
	provenance: string[];
};

const AREAS: readonly string[] = PROGRAM_AREAS;

/** Read an artefact create/edit form. Shared by the action and `use:enhance`. */
export function parseArtefactForm(fd: FormData): ArtefactData {
	return {
		artefact: str(fd.get('artefact')),
		event: str(fd.get('event')),
		date: readDateField(str(fd.get('date'))),
		description: str(fd.get('description')),
		location: str(fd.get('location')),
		fileUrls: fd.getAll('fileUrls').map(String).filter(Boolean),
		programArea: fd.getAll('programArea').map(String),
		provenance: splitList(str(fd.get('provenance')))
	};
}

export type ArtefactSuiteOptions = {
	/**
	 * Whether the physical storage location must be given. Keepers record it;
	 * a public contributor often can't know which binder an item ends up in, so
	 * on /contribute it's optional and a keeper fills it in during review.
	 */
	requireLocation?: boolean;
};

export function createArtefactSuite({ requireLocation = true }: ArtefactSuiteOptions = {}) {
	return defineSuite<ArtefactData>((data) => {
		const title = data.artefact ?? '';
		check('artefact', 'Title is required', title.length > 0);
		check('artefact', 'Keep the title under 200 characters', title.length <= 200);

		maxLen('event', data.event ?? '', 200, 'event');

		// An artefact's date may be vaguer than a single day: a program known only
		// to be from July 2019, or from 2019. `YYYY`, `YYYY-MM` and `YYYY-MM-DD`
		// are all accepted, each carrying its own precision. It may also be
		// deliberately absent (null) — but only as an explicit choice: an empty
		// field means nothing was picked, and is rejected. Both rules always run
		// (vest needs a stable test order); each passes when it doesn't apply.
		const date = data.date;
		check('date', 'Pick a date, or choose “No date”', date !== '');
		check('date', 'Pick a valid date', date === null || date === '' || isPartialDate(date));

		maxLen('description', data.description ?? '', 2000, 'description');
		check(
			'location',
			'Location is required',
			!requireLocation || (data.location ?? '').trim().length > 0
		);
		maxLen('location', data.location ?? '', 200, 'location');

		const fileUrls = data.fileUrls ?? [];
		check('fileUrls', 'Attach at least one image', fileUrls.length >= 1);
		check('fileUrls', 'Enter a valid file URL', fileUrls.every(isHttpUrl));
		check('fileUrls', 'Attach at most 50 files', fileUrls.length <= 50);

		check(
			'programArea',
			'Unknown program area',
			(data.programArea ?? []).every((area) => AREAS.includes(area))
		);

		check('provenance', 'List at most 50 contributors', (data.provenance ?? []).length <= 50);
	});
}
