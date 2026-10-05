import { describe, expect, it } from 'vitest';
import { anonymousKeeperAccess, isKeeperArea } from './keeperGuard';

const req = (overrides: Partial<Parameters<typeof anonymousKeeperAccess>[0]>) =>
	anonymousKeeperAccess({
		pathname: '/keeper/artefacts',
		method: 'GET',
		isDataRequest: false,
		accept: 'text/html',
		isEnhancedAction: false,
		...overrides
	});

describe('isKeeperArea', () => {
	it('covers everything under /keeper except the sign-in page', () => {
		expect(isKeeperArea('/keeper/artefacts')).toBe(true);
		expect(isKeeperArea('/keeper/settings/review/artefacts')).toBe(true);
		expect(isKeeperArea('/keeper')).toBe(false);
		expect(isKeeperArea('/keeper/')).toBe(false);
	});

	it('does not match look-alike public paths', () => {
		expect(isKeeperArea('/keepers')).toBe(false);
		expect(isKeeperArea('/contribute')).toBe(false);
		expect(isKeeperArea('/api/scans')).toBe(false);
	});
});

describe('anonymousKeeperAccess', () => {
	it('lets the sign-in page and its actions through', () => {
		expect(req({ pathname: '/keeper' })).toBe('allow');
		expect(req({ pathname: '/keeper', method: 'POST', isEnhancedAction: true })).toBe('allow');
	});

	it('redirects page views and client-side navigations to sign-in', () => {
		expect(req({})).toBe('redirect');
		expect(req({ accept: '*/*', isDataRequest: true })).toBe('redirect');
	});

	it('redirects form actions, enhanced or not', () => {
		expect(req({ method: 'POST', accept: 'application/json', isEnhancedAction: true })).toBe(
			'redirect'
		);
		expect(req({ method: 'POST', accept: 'text/html,application/xhtml+xml' })).toBe('redirect');
	});

	it('refuses endpoint calls of any method', () => {
		expect(req({ pathname: '/keeper/events/data', accept: '*/*' })).toBe('refuse');
		expect(req({ pathname: '/keeper/scans', method: 'POST', accept: '*/*' })).toBe('refuse');
		expect(req({ pathname: '/keeper/scans', method: 'DELETE', accept: '*/*' })).toBe('refuse');
	});
});
