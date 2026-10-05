/**
 * The chapters of the meditation walk, in playback order.
 *
 * `file` is the exact filename dropped into `static/audio/meditation-walk/`
 * (spaces and all — `trackUrl` encodes it). Spoken sections are `chapter`s;
 * the instrument-only sound-bath pieces between them are `interlude`s, which the
 * player sets in a lighter hand with a chimes mark, so the spoken structure stays
 * legible at a glance.
 */
export interface Track {
	number: number;
	title: string;
	file: string;
	kind: 'chapter' | 'interlude';
}

export const AUDIO_BASE = '/audio/meditation-walk';

export const tracks: Track[] = [
	{ number: 1, title: 'Introduction', file: '01 - INTRODUCTION.mp3', kind: 'chapter' },
	{ number: 2, title: 'Invocation', file: '02 - INVOCATION.mp3', kind: 'chapter' },
	{ number: 3, title: 'Root', file: '03 - ROOT.mp3', kind: 'chapter' },
	{ number: 4, title: 'Inner Circle', file: '04 - INNER CIRCLE.mp3', kind: 'chapter' },
	{ number: 5, title: 'Ocean Drum', file: '05 - ocean drum.mp3', kind: 'interlude' },
	{ number: 6, title: 'Outer Circle', file: '06 - OUTER CIRCLE.mp3', kind: 'chapter' },
	{ number: 7, title: 'Sacral', file: '07 - SACRAL.mp3', kind: 'chapter' },
	{ number: 8, title: 'Solar Plexus', file: '08 - SOLAR PLEXUS.mp3', kind: 'chapter' },
	{ number: 9, title: 'Heart', file: '09 - HEART.mp3', kind: 'chapter' },
	{ number: 10, title: 'Chimes', file: '10 - chimes.mp3', kind: 'interlude' },
	{ number: 11, title: 'Integration', file: '11 - INTEGRATION.mp3', kind: 'chapter' },
	{ number: 12, title: 'Four Directions', file: '12 - FOUR DIRECTIONS.mp3', kind: 'chapter' },
	{ number: 13, title: 'Throat, part 1', file: '13 - THROAT pt.1.mp3', kind: 'chapter' },
	{ number: 14, title: 'Chakra Sounds', file: '14 - chakra sounds.mp3', kind: 'interlude' },
	{ number: 15, title: 'Throat, part 2', file: '15 - THROAT pt.2.mp3', kind: 'chapter' },
	{ number: 16, title: 'Third Eye', file: '16 - THIRD EYE.mp3', kind: 'chapter' },
	{ number: 17, title: 'Crown', file: '17 - CROWN.mp3', kind: 'chapter' },
	{
		number: 18,
		title: 'Return & Integration',
		file: '18 - RETURN INTEGRATION.mp3',
		kind: 'chapter'
	},
	{ number: 19, title: 'Chakra Sounds', file: '19 - chakra sounds.mp3', kind: 'interlude' },
	{ number: 20, title: 'Conclusion', file: '20 - CONCLUSION.mp3', kind: 'chapter' },
	{ number: 21, title: 'Gate Gong', file: '21 - gate gong.mp3', kind: 'interlude' }
];

export const trackUrl = (track: Track) => `${AUDIO_BASE}/${encodeURIComponent(track.file)}`;
