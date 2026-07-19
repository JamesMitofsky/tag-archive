import { ISO_DATE_RE, check, defineSuite, isHttpUrl, maxLen, splitList, str } from './helpers';

/** Normalised event create-form values — validated, then used for the DB write. */
export type EventData = {
	title: string;
	series: string;
	date: string;
	time: string;
	location: string;
	description: string;
	url: string;
	hosts: string[];
};

/** Read an event create form. Shared by the action and `use:enhance`. */
export function parseEventForm(fd: FormData): EventData {
	return {
		title: str(fd.get('title')),
		series: str(fd.get('series')),
		date: str(fd.get('date')),
		time: str(fd.get('time')),
		location: str(fd.get('location')),
		description: str(fd.get('description')),
		url: str(fd.get('url')),
		hosts: splitList(str(fd.get('hosts')))
	};
}

export function createEventSuite() {
	return defineSuite<EventData>((data) => {
		const title = data.title ?? '';
		check('title', 'Title is required', title.length > 0);
		check('title', 'Keep the title under 200 characters', title.length <= 200);

		maxLen('series', data.series ?? '', 200, 'series');

		// A date is required for an event (it's a dated happening).
		check('date', 'Pick a valid date', ISO_DATE_RE.test(data.date ?? ''));

		maxLen('time', data.time ?? '', 100, 'time');
		maxLen('location', data.location ?? '', 200, 'location');
		maxLen('description', data.description ?? '', 2000, 'description');

		const url = data.url ?? '';
		check('url', 'Enter a valid URL', url === '' || isHttpUrl(url));

		check('hosts', 'List at most 50 hosts', (data.hosts ?? []).length <= 50);
	});
}
