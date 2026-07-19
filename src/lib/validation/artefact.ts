import { PROGRAM_AREAS } from '$lib/programAreas';
import { ISO_DATE_RE, check, defineSuite, isHttpUrl, maxLen, splitList, str } from './helpers';

/** Normalised artefact form values — validated, then used for the DB write. */
export type ArtefactData = {
	artefact: string;
	event: string;
	date: string;
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
		date: str(fd.get('date')),
		description: str(fd.get('description')),
		location: str(fd.get('location')),
		fileUrls: fd.getAll('fileUrls').map(String).filter(Boolean),
		programArea: fd.getAll('programArea').map(String),
		provenance: splitList(str(fd.get('provenance')))
	};
}

export function createArtefactSuite() {
	return defineSuite<ArtefactData>((data) => {
		const title = data.artefact ?? '';
		check('artefact', 'Title is required', title.length > 0);
		check('artefact', 'Keep the title under 200 characters', title.length <= 200);

		maxLen('event', data.event ?? '', 200, 'event');

		const date = data.date ?? '';
		check('date', 'Pick a valid date', date === '' || ISO_DATE_RE.test(date));

		maxLen('description', data.description ?? '', 2000, 'description');
		maxLen('location', data.location ?? '', 200, 'location');

		const fileUrls = data.fileUrls ?? [];
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
