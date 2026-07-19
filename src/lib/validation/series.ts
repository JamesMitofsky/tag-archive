import { check, defineSuite, maxLen, str } from './helpers';

/** Weekday options for a series' optional default day. Sunday-first. */
export const DAYS_OF_WEEK = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday'
] as const;

const DAYS: readonly string[] = DAYS_OF_WEEK;

/** Normalised series create-form values — validated, then used for the DB write. */
export type SeriesData = {
	name: string;
	description: string;
	defaultDayOfWeek: string;
	defaultTime: string;
	frequency: string;
};

/** Read a series create form. Shared by the action and `use:enhance`. */
export function parseSeriesForm(fd: FormData): SeriesData {
	return {
		name: str(fd.get('name')),
		description: str(fd.get('description')),
		defaultDayOfWeek: str(fd.get('defaultDayOfWeek')),
		defaultTime: str(fd.get('defaultTime')),
		frequency: str(fd.get('frequency'))
	};
}

export function createSeriesSuite() {
	return defineSuite<SeriesData>((data) => {
		const name = data.name ?? '';
		check('name', 'Name is required', name.length > 0);
		check('name', 'Keep the name under 200 characters', name.length <= 200);

		maxLen('description', data.description ?? '', 2000, 'description');

		const day = data.defaultDayOfWeek ?? '';
		check('defaultDayOfWeek', 'Pick a valid day', day === '' || DAYS.includes(day));

		maxLen('defaultTime', data.defaultTime ?? '', 100, 'time');
		maxLen('frequency', data.frequency ?? '', 100, 'frequency');
	});
}
