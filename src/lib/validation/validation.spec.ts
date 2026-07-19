import { describe, it, expect } from 'vitest';
import { createArtefactSuite, parseArtefactForm } from './artefact';
import { createEventSuite, parseEventForm } from './event';
import { createSeriesSuite, parseSeriesForm } from './series';
import { createRenameSuite, parseRenameForm } from './contributor';
import { createEmailSuite, createOtpSuite, parseEmailForm } from './auth';
import { summary } from './helpers';

/** Build a FormData from a plain record; array values become repeated fields. */
function fd(entries: Record<string, string | string[]>): FormData {
	const form = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		if (Array.isArray(value)) value.forEach((v) => form.append(key, v));
		else form.set(key, value);
	}
	return form;
}

describe('artefact suite', () => {
	const run = createArtefactSuite();

	it('requires a title', () => {
		const r = run(parseArtefactForm(fd({ artefact: '   ' })));
		expect(r.isValid()).toBe(false);
		expect(r.getErrors('artefact')).toContain('Title is required');
	});

	it('accepts a minimal valid artefact', () => {
		const r = run(parseArtefactForm(fd({ artefact: 'Steep Program' })));
		expect(r.isValid()).toBe(true);
	});

	it('collects errors across multiple fields at once', () => {
		const r = run(
			parseArtefactForm(
				fd({
					artefact: '',
					date: 'nope',
					fileUrls: ['not-a-url'],
					programArea: ['Nonexistent']
				})
			)
		);
		expect(r.isValid()).toBe(false);
		expect(Object.keys(r.getErrors())).toEqual(
			expect.arrayContaining(['artefact', 'date', 'fileUrls', 'programArea'])
		);
	});

	it('accepts a known program area and an https file url', () => {
		const r = run(
			parseArtefactForm(
				fd({ artefact: 'Ok', programArea: ['DIY'], fileUrls: ['https://cdn.example/x.jpg'] })
			)
		);
		expect(r.isValid()).toBe(true);
	});

	it('rejects an over-long title', () => {
		const r = run(parseArtefactForm(fd({ artefact: 'x'.repeat(201) })));
		expect(r.getErrors('artefact')).toContain('Keep the title under 200 characters');
	});
});

describe('event suite', () => {
	const run = createEventSuite();

	it('requires a valid date', () => {
		const r = run(parseEventForm(fd({ title: 'Show', date: '' })));
		expect(r.getErrors('date')).toContain('Pick a valid date');
	});

	it('accepts a titled, dated event', () => {
		const r = run(parseEventForm(fd({ title: 'Show', date: '2026-05-05' })));
		expect(r.isValid()).toBe(true);
	});

	it('rejects a malformed url but allows an empty one', () => {
		const bad = run(parseEventForm(fd({ title: 'Show', date: '2026-05-05', url: 'ht!tp' })));
		expect(bad.getErrors('url')).toContain('Enter a valid URL');
		const empty = run(parseEventForm(fd({ title: 'Show', date: '2026-05-05', url: '' })));
		expect(empty.isValid()).toBe(true);
	});
});

describe('series suite', () => {
	const run = createSeriesSuite();

	it('requires a name', () => {
		const r = run(parseSeriesForm(fd({ name: '' })));
		expect(r.getErrors('name')).toContain('Name is required');
	});

	it('rejects an unknown default weekday', () => {
		const r = run(parseSeriesForm(fd({ name: 'Jazz', defaultDayOfWeek: 'Someday' })));
		expect(r.getErrors('defaultDayOfWeek')).toContain('Pick a valid day');
	});

	it('accepts a valid weekday and empty defaults', () => {
		const r = run(parseSeriesForm(fd({ name: 'Jazz', defaultDayOfWeek: 'Friday' })));
		expect(r.isValid()).toBe(true);
	});
});

describe('contributor rename suite', () => {
	const run = createRenameSuite();

	it('requires a name', () => {
		const r = run(parseRenameForm(fd({ name: '   ' })));
		expect(r.getErrors('name')).toContain('Name is required');
	});

	it('accepts a valid name', () => {
		const r = run(parseRenameForm(fd({ name: 'Ada Lovelace' })));
		expect(r.isValid()).toBe(true);
	});

	it('rejects an over-long name', () => {
		const r = run(parseRenameForm(fd({ name: 'x'.repeat(201) })));
		expect(r.getErrors('name')).toContain('Keep the name under 200 characters');
	});
});

describe('auth suites', () => {
	const email = createEmailSuite();
	const otp = createOtpSuite();

	it('validates and lowercases email', () => {
		const parsed = parseEmailForm(fd({ email: '  ME@Example.COM ' }));
		expect(parsed.email).toBe('me@example.com');
		expect(email(parsed).isValid()).toBe(true);
	});

	it('rejects a malformed email', () => {
		expect(email({ email: 'nope' }).isValid()).toBe(false);
	});

	it('requires a 6-digit otp', () => {
		expect(otp({ otp: '12345' }).isValid()).toBe(false);
		expect(otp({ otp: '123456' }).isValid()).toBe(true);
	});
});

describe('parsers', () => {
	it('trims text and splits comma lists, dropping blanks', () => {
		const data = parseEventForm(
			fd({ title: '  Padded  ', date: '2026-05-05', hosts: 'Al, Bo , ,Cy' })
		);
		expect(data.title).toBe('Padded');
		expect(data.hosts).toEqual(['Al', 'Bo', 'Cy']);
	});
});

describe('summary', () => {
	it('returns the first field error message', () => {
		const r = createSeriesSuite()(parseSeriesForm(fd({ name: '' })));
		expect(summary(r)).toBe('Name is required');
	});
});
