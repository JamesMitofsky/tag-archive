import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

/**
 * Demo photographs for the local seed (see ./seed-photographs): painted
 * landscapes, stored the way a real upload is — an original carrying EXIF
 * (here a PNG with an eXIf chunk, see `exifTiff`) and a WebP display copy
 * with no metadata.
 * Painted in code, so no binary fixtures live in the repository, and each one
 * looks different enough to tell sets apart at a glance.
 */

/** Sky, sun and three hill colours, back to front. */
type Palette = {
	skyTop: [number, number, number];
	skyHorizon: [number, number, number];
	sun: [number, number, number];
	hills: [[number, number, number], [number, number, number], [number, number, number]];
	/** Flowers dotted over the nearest hill; none when omitted. */
	flowers?: [number, number, number];
};

export const PALETTES = {
	dawn: {
		skyTop: [92, 114, 168],
		skyHorizon: [246, 196, 160],
		sun: [255, 236, 200],
		hills: [
			[150, 132, 160],
			[96, 110, 112],
			[52, 78, 62]
		],
		flowers: [236, 120, 150]
	},
	midday: {
		skyTop: [70, 140, 214],
		skyHorizon: [196, 226, 246],
		sun: [255, 252, 232],
		hills: [
			[132, 170, 150],
			[92, 150, 84],
			[58, 116, 52]
		],
		flowers: [250, 214, 80]
	},
	dusk: {
		skyTop: [52, 40, 96],
		skyHorizon: [240, 128, 84],
		sun: [255, 196, 120],
		hills: [
			[120, 70, 96],
			[70, 44, 70],
			[34, 26, 44]
		]
	},
	overcast: {
		skyTop: [150, 160, 170],
		skyHorizon: [214, 216, 214],
		sun: [232, 232, 226],
		hills: [
			[150, 160, 150],
			[110, 128, 108],
			[78, 98, 72]
		],
		flowers: [230, 230, 240]
	},
	night: {
		skyTop: [10, 16, 40],
		skyHorizon: [40, 58, 98],
		sun: [236, 236, 220],
		hills: [
			[40, 50, 76],
			[26, 34, 54],
			[14, 18, 30]
		]
	}
} satisfies Record<string, Palette>;

export type PaletteName = keyof typeof PALETTES;

export type Scene = {
	palette: PaletteName;
	/** Varies the hills and the sun's position, so two scenes in one palette differ. */
	seed: number;
	portrait?: boolean;
};

type Pixels = { data: Uint8ClampedArray; width: number; height: number };

/** Longest edge of a demo photograph: big enough to look sharp when opened, quick to paint. */
const LONG_EDGE = 1600;
const SHORT_EDGE = 1200;

/** A small deterministic generator, so a seed paints the same scene every time. */
function random(seed: number): () => number {
	let s = (seed * 2654435761) >>> 0 || 1;
	return () => {
		s ^= s << 13;
		s ^= s >>> 17;
		s ^= s << 5;
		return (s >>> 0) / 4294967296;
	};
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Paint one landscape: a graded sky, a soft sun, and three rolling hills. */
export function paint({ palette: name, seed, portrait = false }: Scene): Pixels {
	const palette: Palette = PALETTES[name];
	const width = portrait ? SHORT_EDGE : LONG_EDGE;
	const height = portrait ? LONG_EDGE : SHORT_EDGE;
	const next = random(seed);

	const sunX = mix(0.2, 0.8, next()) * width;
	const sunY = mix(0.18, 0.42, next()) * height;
	const sunR = mix(0.04, 0.07, next()) * Math.max(width, height);

	// Each hill's ridge: a base line plus two sine waves, nearer hills lower and bolder.
	const hills = palette.hills.map((_, layer) => {
		const base = height * (0.5 + layer * 0.12 + next() * 0.05);
		const waves = [0, 1].map((i) => ({
			amp: height * mix(0.02, 0.06, next()) * (layer + 1) * (i === 0 ? 1 : 0.4),
			freq: (Math.PI * 2 * mix(0.6, 1.8, next()) * (i + 1)) / width,
			phase: next() * Math.PI * 2
		}));
		return { base, waves };
	});
	const ridge = (hill: (typeof hills)[number], x: number) =>
		hill.base + hill.waves.reduce((y, w) => y + w.amp * Math.sin(x * w.freq + w.phase), 0);

	const data = new Uint8ClampedArray(width * height * 4);
	const ridges = hills.map((hill) =>
		Float32Array.from({ length: width }, (_, x) => ridge(hill, x))
	);
	const horizon = ridges[0];
	const glow = sunR * 3;

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let r: number, g: number, b: number;

			// The nearest hill this pixel sits under, if any.
			let layer = -1;
			for (let i = ridges.length - 1; i >= 0; i--) {
				if (y >= ridges[i][x]) {
					layer = i;
					break;
				}
			}

			if (layer === -1) {
				const t = Math.min(1, y / Math.max(1, horizon[x]));
				r = mix(palette.skyTop[0], palette.skyHorizon[0], t);
				g = mix(palette.skyTop[1], palette.skyHorizon[1], t);
				b = mix(palette.skyTop[2], palette.skyHorizon[2], t);
				const d = Math.hypot(x - sunX, y - sunY);
				const sun = d < sunR ? 1 : d < glow ? ((glow - d) / (glow - sunR)) ** 2 * 0.45 : 0;
				r = mix(r, palette.sun[0], sun);
				g = mix(g, palette.sun[1], sun);
				b = mix(b, palette.sun[2], sun);
			} else {
				const color = palette.hills[layer];
				// Lighter along the ridge, darker towards the foot of the frame.
				const shade = 1.08 - ((y - ridges[layer][x]) / height) * 0.5;
				r = color[0] * shade;
				g = color[1] * shade;
				b = color[2] * shade;
				// Flowers in blocks, not single pixels, so they survive the WebP encode.
				if (palette.flowers && layer === ridges.length - 1) {
					const cell = ((x >> 3) * 73856093) ^ ((y >> 3) * 19349663) ^ (seed * 83492791);
					if (((cell >>> 0) % 1000) / 1000 < 0.012) [r, g, b] = palette.flowers;
				}
			}

			const at = (y * width + x) * 4;
			data[at] = r;
			data[at + 1] = g;
			data[at + 2] = b;
			data[at + 3] = 255;
		}
	}
	return { data, width, height };
}

/** One PNG chunk: length, type, data, and the CRC over type and data. */
function pngChunk(type: string, data: Uint8Array): Buffer {
	const head = Buffer.alloc(8);
	head.writeUInt32BE(data.length, 0);
	head.write(type, 4, 'latin1');
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
	return Buffer.concat([head, data, crc]);
}

/**
 * An RGB PNG of `pixels` carrying `exif` (a TIFF block, see `exifTiff`) in an
 * eXIf chunk, ahead of the image data as the PNG spec asks. Each row is
 * filtered "Up" (minus the row above), which a painted gradient compresses well.
 */
export function encodePng({ data, width, height }: Pixels, exif?: Uint8Array): Uint8Array {
	const stride = width * 3;
	const raw = Buffer.alloc((stride + 1) * height);
	const previous = Buffer.alloc(stride);
	const row = Buffer.alloc(stride);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const from = (y * width + x) * 4;
			row[x * 3] = data[from];
			row[x * 3 + 1] = data[from + 1];
			row[x * 3 + 2] = data[from + 2];
		}
		const out = y * (stride + 1);
		raw[out] = 2; // filter type: Up
		for (let i = 0; i < stride; i++) raw[out + 1 + i] = (row[i] - previous[i]) & 0xff;
		row.copy(previous);
	}

	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header.set([8, 2, 0, 0, 0], 8); // 8-bit depth, truecolor RGB, deflate, no interlace
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		pngChunk('IHDR', header),
		...(exif ? [pngChunk('eXIf', exif)] : []),
		pngChunk('IDAT', deflateSync(raw)),
		pngChunk('IEND', new Uint8Array(0))
	]);
}

/**
 * libwebp's encoder: the same WebAssembly build the uploader falls back to in
 * browsers without a native WebP encoder (see $lib/images/encode). Under Node
 * it can't fetch its .wasm by URL, so the module is compiled from disk and
 * handed over; the SIMD build where this Node validates it, as libwebp's own
 * feature check would pick.
 */
let encoder: Promise<(pixels: Pixels) => Promise<Uint8Array>> | undefined;

function webpEncoder() {
	encoder ??= (async () => {
		const libwebp = await import('@jsquash/webp/encode');
		const codecDir = join(
			dirname(createRequire(import.meta.url).resolve('@jsquash/webp/encode')),
			'codec/enc'
		);
		const simd = readFileSync(join(codecDir, 'webp_enc_simd.wasm'));
		const wasm = WebAssembly.validate(simd) ? simd : readFileSync(join(codecDir, 'webp_enc.wasm'));
		await libwebp.init(await WebAssembly.compile(wasm));
		return async (pixels: Pixels) =>
			new Uint8Array(
				// It reads only `data`, `width` and `height`; Node has no ImageData class.
				await libwebp.default(pixels as unknown as ImageData, { quality: 82 })
			);
	})();
	return encoder;
}

/** The WebP display copy of `pixels`: no EXIF or XMP, as finalize requires. */
export async function encodeWebp(pixels: Pixels): Promise<Uint8Array> {
	return (await webpEncoder())(pixels);
}
