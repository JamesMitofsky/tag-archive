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

		expect(getParentRoute('/keeper/artefacts/add')).toEqual({
			href: '/keeper/artefacts',
			label: 'Artefacts'
		});

		expect(getParentRoute('/keeper/settings/review/artefacts')).toEqual({
			href: '/keeper/settings/review',
			label: 'Review Queue'
		});
	});

	it('places the image pages beside their artefact counterparts', () => {
		expect(getParentRoute('/images')).toEqual({ href: '/', label: 'Home' });
		expect(getParentRoute('/contribute/images')).toEqual({
			href: '/contribute',
			label: 'Contribute'
		});

		expect(getParentRoute('/keeper/images')).toEqual({ href: '/keeper', label: 'Cloud Keeper' });
		// The add route is static, so it never reads as an image set called "add".
		expect(getParentRoute('/keeper/images/add')).toEqual({
			href: '/keeper/images',
			label: 'Images'
		});
		expect(getParentRoute('/keeper/images/12')).toEqual({
			href: '/keeper/images',
			label: 'Images'
		});
		expect(getParentRoute('/keeper/images/12/edit')).toEqual({
			href: '/keeper/images/12',
			label: 'Image Set'
		});
		expect(getParentRoute('/keeper/images/12/')).toEqual({
			href: '/keeper/images',
			label: 'Images'
		});
		expect(getParentRoute('/keeper/settings/review/images')).toEqual({
			href: '/keeper/settings/review',
			label: 'Review Queue'
		});

		expect(getRouteTitle('/images')).toBe('Images');
		expect(getRouteTitle('/keeper/images')).toBe('Images');
		expect(getRouteTitle('/keeper/images/12')).toBe('Image Set');
		expect(getRouteTitle('/keeper/images/12/edit')).toBe('Edit Image Set');
	});

	it('infers parent route and label for dynamic routes with IDs', () => {
		expect(getParentRoute('/keeper/artefacts/item-123')).toEqual({
			href: '/keeper/artefacts',
			label: 'Artefacts'
		});

		expect(getParentRoute('/keeper/artefacts/item-123/edit')).toEqual({
			href: '/keeper/artefacts/item-123',
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

		expect(getParentRoute('/keeper/series/42')).toEqual({
			href: '/keeper/series',
			label: 'Series'
		});
	});

	it('handles explicit href overrides with auto label lookup', () => {
		expect(getParentRoute('/keeper/artefacts', '/keeper')).toEqual({
			href: '/keeper',
			label: 'Cloud Keeper'
		});

		expect(getParentRoute('/keeper/artefacts/add', '/keeper/artefacts')).toEqual({
			href: '/keeper/artefacts',
			label: 'Artefacts'
		});
	});

	it('resolves titles correctly', () => {
		expect(getRouteTitle('/keeper')).toBe('Cloud Keeper');
		expect(getRouteTitle('/keeper/artefacts')).toBe('Artefacts');
		expect(getRouteTitle('/keeper/artefacts/item-123')).toBe('Artefact');
		expect(getRouteTitle('/keeper/events/456')).toBe('Event');
		expect(getRouteTitle('/keeper/series/42')).toBe('Series');
	});
});
