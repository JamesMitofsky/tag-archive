import { describe, it, expect } from 'vitest';
import { getParentRoute, getRouteTitle } from './routes';

describe('getParentRoute & getRouteTitle', () => {
	it('infers parent route and label for static routes', () => {
		expect(getParentRoute('/keeper/artefacts')).toEqual({
			href: '/keeper',
			label: 'Cloud Keeper'
		});

		expect(getParentRoute('/keeper/events')).toEqual({
			href: '/keeper',
			label: 'Cloud Keeper'
		});

		expect(getParentRoute('/keeper/series')).toEqual({
			href: '/keeper',
			label: 'Cloud Keeper'
		});

		expect(getParentRoute('/keeper/settings')).toEqual({
			href: '/keeper',
			label: 'Cloud Keeper'
		});

		expect(getParentRoute('/keeper/add')).toEqual({
			href: '/keeper/artefacts',
			label: 'Artefacts'
		});

		expect(getParentRoute('/keeper/settings/review/artefacts')).toEqual({
			href: '/keeper/settings/review',
			label: 'Review Queue'
		});
	});

	it('infers parent route and label for dynamic routes with IDs', () => {
		expect(getParentRoute('/keeper/item-123')).toEqual({
			href: '/keeper/artefacts',
			label: 'Artefacts'
		});

		expect(getParentRoute('/keeper/item-123/edit')).toEqual({
			href: '/keeper/item-123',
			label: 'Artefact'
		});

		expect(getParentRoute('/keeper/events/evt-456')).toEqual({
			href: '/keeper/events',
			label: 'Events'
		});

		expect(getParentRoute('/keeper/events/evt-456/edit')).toEqual({
			href: '/keeper/events/evt-456',
			label: 'Event'
		});

		expect(getParentRoute('/keeper/contributors/contrib-789')).toEqual({
			href: '/keeper/contributors',
			label: 'Contributors'
		});
	});

	it('handles explicit href overrides with auto label lookup', () => {
		expect(getParentRoute('/keeper/artefacts', '/keeper')).toEqual({
			href: '/keeper',
			label: 'Cloud Keeper'
		});

		expect(getParentRoute('/keeper/add', '/keeper/artefacts')).toEqual({
			href: '/keeper/artefacts',
			label: 'Artefacts'
		});
	});

	it('resolves titles correctly', () => {
		expect(getRouteTitle('/keeper')).toBe('Cloud Keeper');
		expect(getRouteTitle('/keeper/artefacts')).toBe('Artefacts');
		expect(getRouteTitle('/keeper/item-123')).toBe('Artefact');
		expect(getRouteTitle('/keeper/events/456')).toBe('Event');
	});
});
