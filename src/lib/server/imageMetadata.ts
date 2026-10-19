import exifr from 'exifr';
import { inflateSync } from 'node:zlib';
import { isFullDate } from '$lib/partialDate';
import type { ImageMetadata, MetadataSegment } from './db/schema';
import { sniffImageType } from './imageType';

/**
 * A photograph's own metadata — capture time, camera, GPS, XMP, IPTC, color
 * profile — read from an uploaded original so an image set can date itself.
 *
 * The bytes come from anyone holding an access pass, so the reading is built
 * to survive hostile files. exifr does the tag decoding (its dictionaries are
 * the valuable part) but only on blocks this module has already cut out of the
 * container and bounded, because several of exifr 7.1.3's own readers are not
 * safe on untrusted input:
 *
 *  - its XMP parser files properties under `root[prefix][name]` straight from
 *    the packet, so a `constructor:` or `__proto__:` prefix writes onto Object
 *    and Object.prototype for the whole process (see `UNSAFE_XMP`);
 *  - its HEIF reader loops forever on a zero-length box before `meta`, and its
 *    ICC reader on a `mluc` tag with a huge record count and zero record size —
 *    synchronous spins that starve the event loop, so no timeout can stop them;
 *  - its PNG reader inflates iCCP with no output limit (a zlib bomb);
 *  - its TIFF reader reads every entry's value in full, so a block whose
 *    thousands of entries all point at one long value costs seconds;
 *  - its IPTC reader trusts each dataset's length, reading past the end of
 *    the block it is given into whatever bytes follow it in memory;
 *  - it has no WebP reader, and its HEIF reader refuses brands other than heic.
 *
 * So the containers (JPEG, PNG, WebP, HEIF) are walked here with every length
 * checked and every loop capped, exifr is only handed a TIFF block bounded by
 * `boundTiff`, an XMP packet that passed `UNSAFE_XMP`, or an IPTC record cut
 * to its whole datasets by `wholeDatasets`, and color profiles are summarized
 * here.
 */

/** Largest stored metadata record, as serialized JSON in UTF-8 bytes. */
export const MAX_METADATA_JSON_BYTES = 64 * 1024;

export type ParsedImageMetadata = {
	/**
	 * Wall-clock capture time as the camera recorded it, no time zone applied:
	 * `YYYY-MM-DDTHH:MM:SS`, or `YYYY-MM-DD` when only the day is known (an XMP
	 * date without a time). Null when the photo carries no plausible date.
	 */
	capturedAt: string | null;
	/** The camera's UTC offset at capture, `+02:00` style, when it recorded one. */
	capturedOffset: string | null;
	/** What was read, JSON-safe and size-capped; null when nothing at all was found. */
	metadata: ImageMetadata | null;
};

/** Longest string kept anywhere in the record; longer ones are cut. */
const MAX_STRING_CHARS = 2000;
/** Keys longer than this are not tag names; entries under them are dropped. */
const MAX_KEY_CHARS = 128;
/** Plain lists (keywords, history) keep their first this-many items. */
const MAX_ARRAY_ITEMS = 256;
/**
 * Arrays of only numbers longer than this are tables (strip offsets, transfer
 * curves), not descriptions, and are dropped whole.
 */
const MAX_NUMERIC_ITEMS = 64;
/**
 * Byte arrays up to this long are enumerations or versions (GPSVersionID,
 * ExifVersion); longer ones are opaque blobs and are dropped.
 */
const MAX_SMALL_BYTES = 16;
const MAX_DEPTH = 12;
/**
 * TIFF bytes handed to exifr. A JPEG can't hold more EXIF than this, so camera
 * firmware stays within it in every container.
 */
const MAX_TIFF_BYTES = 64 * 1024;
/**
 * Value bytes exifr may read from one TIFF block (see `boundTiff`). A real
 * block's values don't overlap, so they add up to less than the block; only a
 * forged one, every entry pointing at the same long value, gets near this.
 */
const MAX_TIFF_VALUE_BYTES = 2 * MAX_TIFF_BYTES;
/**
 * XMP characters handed to exifr: its regex parser goes quadratic on unclosed
 * tags (~0.3 s at this size). As much as a JPEG's main XMP segment can hold.
 */
const MAX_XMP_CHARS = 64 * 1024;
/** Largest ICC profile, HEIF item or inflated PNG chunk taken out of a container. */
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;
/**
 * Boxes read from one HEIF container level. Real files have a handful per
 * level and at most hundreds of items; the cap keeps a file of millions of
 * tiny boxes from costing memory.
 */
const MAX_BOXES = 1 << 16;
/**
 * JPEG segments (and stray bytes between them) before the first scan, or PNG
 * and WebP chunks, examined per file. Real files have dozens, or thousands of
 * image-data chunks; a forged one of millions of empty ones stops here.
 */
const MAX_CONTAINER_STEPS = 1 << 20;
/** ICC_PROFILE segments numbered beyond this aren't a profile (the index is one byte). */
const MAX_ICC_CHUNKS = 255;
const MAX_WARNING_CHARS = 200;
/** Problems spelled out in the one warning per file; the rest are only counted. */
const MAX_WARNINGS = 8;

const NONE: ParsedImageMetadata = { capturedAt: null, capturedOffset: null, metadata: null };

/**
 * Read a photograph's metadata. Never throws: a file that can't be read, or
 * that isn't a type that carries metadata (GIF, unknown), yields all nulls.
 * Anything worth an operator's attention is logged in one warning per call.
 */
export async function parseImageMetadata(bytes: Uint8Array): Promise<ParsedImageMetadata> {
	const problems: string[] = [];
	try {
		const payloads = findPayloads(bytes, problems);
		const metadata = await decodePayloads(payloads, problems);
		const captured = captureTime(metadata);
		// Namespace bindings only served `captureTime`; exifr drops them too.
		delete metadata.xmp?.xmlns;
		if (metadata.xmp && Object.keys(metadata.xmp).length === 0) delete metadata.xmp;
		const fitted = fitToCap(metadata);
		return { ...captured, metadata: Object.keys(fitted).length > 0 ? fitted : null };
	} catch (error) {
		problems.push(describe(error));
		return NONE;
	} finally {
		if (problems.length > 0) {
			const more = problems.length - MAX_WARNINGS;
			const listed = problems.slice(0, MAX_WARNINGS).join('; ');
			console.warn(`[imageMetadata] ${listed}${more > 0 ? `; and ${more} more` : ''}`);
		}
	}
}

// ─── Containers ──────────────────────────────────────────────────────────────

type SegmentName = 'ifd0' | 'exif' | 'gps' | 'xmp' | 'iptc' | 'icc';

/** The raw metadata blocks a container holds, before any decoding. */
type Payloads = {
	/** A TIFF structure (header, IFD0 and its sub-IFDs), as an EXIF block holds it. */
	tiff?: Uint8Array;
	/** A UTF-8 XMP packet. */
	xmp?: Uint8Array;
	/** IPTC-IIM datasets. */
	iptc?: Uint8Array;
	icc?: Uint8Array;
	/** Blocks present but left out for size, recorded in `metadata.omitted`. */
	oversized: SegmentName[];
};

function findPayloads(bytes: Uint8Array, problems: string[]): Payloads {
	switch (sniffImageType(bytes)) {
		case 'image/jpeg':
			return jpegPayloads(bytes);
		case 'image/png':
			return pngPayloads(bytes, problems);
		case 'image/webp':
			return webpPayloads(bytes);
		case 'image/heic':
			return heifPayloads(bytes);
		default:
			// GIF has no EXIF; anything else isn't a photograph the archive accepts.
			return { oversized: [] };
	}
}

/**
 * Bytes as Latin-1 text, for a profile's short text fields. Reads at most
 * MAX_STRING_CHARS (more than any kept string), which also keeps the spread
 * within the engine's argument limit.
 */
const latin1 = (bytes: Uint8Array, start: number, length: number) =>
	String.fromCharCode(...bytes.subarray(start, start + Math.min(length, MAX_STRING_CHARS)));

/**
 * The four-character code at `at` (a box type, a signature), without the
 * allocations `latin1` makes: walkers read one per box. The caller checks bounds.
 */
const fourCC = (bytes: Uint8Array, at: number) =>
	String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);

function startsWith(bytes: Uint8Array, prefix: string, at = 0): boolean {
	if (at + prefix.length > bytes.length) return false;
	for (let i = 0; i < prefix.length; i++) {
		if (bytes[at + i] !== prefix.charCodeAt(i)) return false;
	}
	return true;
}

/** Whether the range [start, end) holds at least `minimum` bytes and opens with `prefix`. */
const opensWith = (
	bytes: Uint8Array,
	start: number,
	end: number,
	prefix: string,
	minimum = prefix.length
) => end - start >= minimum && startsWith(bytes, prefix, start);

const viewOf = (bytes: Uint8Array) =>
	new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

function concat(parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

const JPEG_EXIF = 'Exif\0\0';
const JPEG_XMP = 'http://ns.adobe.com/xap/1.0/\0';
const JPEG_ICC = 'ICC_PROFILE\0';
const JPEG_PHOTOSHOP = 'Photoshop 3.0\0';

/** JPEG: the APPn segments before the first scan. */
function jpegPayloads(bytes: Uint8Array): Payloads {
	const found: Payloads = { oversized: [] };
	const iccChunks: { index: number; data: Uint8Array }[] = [];
	let at = 2;
	for (let step = 0; at + 4 <= bytes.length && step < MAX_CONTAINER_STEPS; step++) {
		// Resynchronize past stray bytes between segments, as decoders do.
		if (bytes[at] !== 0xff) {
			at = bytes.indexOf(0xff, at);
			if (at === -1) break;
			continue;
		}
		const marker = bytes[at + 1];
		if (marker === 0xff) {
			at++; // fill byte
			continue;
		}
		// Markers without a length: TEM, RSTn, SOI (and a stuffed 0x00).
		if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
			at += 2;
			continue;
		}
		// Metadata comes before the image data; past SOS (or at EOI) there is none.
		if (marker === 0xda || marker === 0xd9) break;
		const length = (bytes[at + 2] << 8) | bytes[at + 3];
		const start = at + 4;
		const end = at + 2 + length;
		if (length < 2 || end > bytes.length) break;
		// Only a segment that names its contents is sliced out: most aren't metadata.
		if (marker === 0xe1 && !found.tiff && opensWith(bytes, start, end, JPEG_EXIF)) {
			found.tiff = bytes.subarray(start + JPEG_EXIF.length, end);
		} else if (marker === 0xe1 && !found.xmp && opensWith(bytes, start, end, JPEG_XMP)) {
			// The main packet only: Extended XMP (depth maps, edit history) isn't descriptive.
			found.xmp = bytes.subarray(start + JPEG_XMP.length, end);
		} else if (marker === 0xe2 && opensWith(bytes, start, end, JPEG_ICC, JPEG_ICC.length + 3)) {
			// A profile too big for one segment is split; the byte after the name numbers the pieces.
			if (iccChunks.length < MAX_ICC_CHUNKS) {
				const body = bytes.subarray(start + JPEG_ICC.length, end);
				iccChunks.push({ index: body[0], data: body.subarray(2) });
			}
		} else if (marker === 0xed && !found.iptc && opensWith(bytes, start, end, JPEG_PHOTOSHOP)) {
			found.iptc = iptcResource(bytes.subarray(start + JPEG_PHOTOSHOP.length, end));
		}
		at = end;
	}
	if (iccChunks.length > 0) {
		const total = iccChunks.reduce((sum, chunk) => sum + chunk.data.length, 0);
		if (total > MAX_PAYLOAD_BYTES) found.oversized.push('icc');
		else found.icc = concat(iccChunks.sort((a, b) => a.index - b.index).map((chunk) => chunk.data));
	}
	return found;
}

/**
 * The IPTC-IIM block (resource 0x0404) among Photoshop's image resources,
 * which a JPEG keeps in APP13.
 */
function iptcResource(resources: Uint8Array): Uint8Array | undefined {
	const view = viewOf(resources);
	let at = 0;
	while (at + 12 <= resources.length && startsWith(resources, '8BIM', at)) {
		const id = view.getUint16(at + 4);
		// A Pascal-string name: length byte plus characters, padded to an even size.
		const nameLength = resources[at + 6];
		const sizeAt = at + 6 + nameLength + 1 + ((nameLength + 1) % 2);
		if (sizeAt + 4 > resources.length) return undefined;
		const size = view.getUint32(sizeAt);
		const start = sizeAt + 4;
		if (size > resources.length - start) return undefined;
		if (id === 0x0404) return wholeDatasets(resources.subarray(start, start + size));
		at = start + size + (size % 2);
	}
	return undefined;
}

/**
 * An IPTC block's whole datasets, as a copy, from its first record-2 one (the
 * only record exifr reads). exifr takes each dataset's declared length on
 * trust and reads it from the underlying buffer, so a dataset that claims
 * more bytes than the block holds would be filled with whatever follows in
 * the file. That dataset and any after it are dropped instead. Starting at
 * record 2 keeps exifr, which seeks for its first record-2 marker byte by
 * byte, walking exactly the datasets checked here.
 */
function wholeDatasets(block: Uint8Array): Uint8Array | undefined {
	let at = block.indexOf(0x1c);
	if (at === -1) return undefined;
	let from = -1;
	let end = at;
	// Each dataset: 0x1C, record, dataset number, 16-bit length, value.
	while (at + 5 <= block.length && block[at] === 0x1c) {
		const size = (block[at + 3] << 8) | block[at + 4];
		// A set top bit marks an extended length, which exifr would misread as a size.
		if (size & 0x8000 || at + 5 + size > block.length) break;
		if (from === -1 && block[at + 1] === 2) from = at;
		at += 5 + size;
		end = at;
	}
	return from === -1 ? undefined : block.slice(from, end);
}

const PNG_XMP_KEYWORD = 'XML:com.adobe.xmp\0';

/** A bare TIFF block, without the `Exif\0\0` preamble some encoders carry over from JPEG. */
const withoutExifPreamble = (data: Uint8Array) =>
	startsWith(data, JPEG_EXIF) ? data.subarray(JPEG_EXIF.length) : data;

/** PNG: eXIf (a bare TIFF block), iTXt keyed for XMP, and iCCP. */
function pngPayloads(bytes: Uint8Array, problems: string[]): Payloads {
	const found: Payloads = { oversized: [] };
	const view = viewOf(bytes);
	// The first of each is the only one tried: a broken zlib stream (or a bomb)
	// costs one inflate, not one per repeated chunk.
	let triedXmp = false;
	let triedIcc = false;
	let at = 8;
	// Metadata may follow the image data, so walk every chunk (each skip is O(1)).
	for (let step = 0; at + 12 <= bytes.length && step < MAX_CONTAINER_STEPS; step++) {
		const length = view.getUint32(at);
		const typeAt = at + 4;
		const start = at + 8;
		const end = start + length;
		if (end + 4 > bytes.length) break;
		if (startsWith(bytes, 'eXIf', typeAt)) {
			found.tiff ??= withoutExifPreamble(bytes.subarray(start, end));
		} else if (
			startsWith(bytes, 'iTXt', typeAt) &&
			!triedXmp &&
			opensWith(bytes, start, end, PNG_XMP_KEYWORD)
		) {
			triedXmp = true;
			found.xmp = pngXmp(bytes.subarray(start, end), found, problems);
		} else if (startsWith(bytes, 'iCCP', typeAt) && !triedIcc) {
			triedIcc = true;
			// Profile name (1-79 bytes), NUL, compression method, then the zlib stream.
			const data = bytes.subarray(start, end);
			const nul = data.indexOf(0);
			if (nul > 0) found.icc = inflate(data.subarray(nul + 2), 'icc', found, problems);
		} else if (startsWith(bytes, 'IEND', typeAt)) {
			break;
		}
		at = end + 4; // past the CRC
	}
	return found;
}

function pngXmp(data: Uint8Array, found: Payloads, problems: string[]): Uint8Array | undefined {
	let at = PNG_XMP_KEYWORD.length;
	const compressed = data[at] === 1;
	at += 2; // compression flag and method
	// Language tag and translated keyword, each NUL-terminated.
	for (let i = 0; i < 2; i++) {
		const nul = data.indexOf(0, at);
		if (nul === -1) return undefined;
		at = nul + 1;
	}
	const text = data.subarray(at);
	return compressed ? inflate(text, 'xmp', found, problems) : text;
}

/** Inflate a zlib stream, refusing (rather than allocating) past the payload cap. */
function inflate(
	data: Uint8Array,
	name: SegmentName,
	found: Payloads,
	problems: string[]
): Uint8Array | undefined {
	try {
		return new Uint8Array(inflateSync(data, { maxOutputLength: MAX_PAYLOAD_BYTES }));
	} catch (error) {
		if ((error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') found.oversized.push(name);
		else problems.push(`PNG ${name}: ${describe(error)}`);
		return undefined;
	}
}

/** WebP: EXIF, `XMP ` and ICCP chunks of the RIFF container. */
function webpPayloads(bytes: Uint8Array): Payloads {
	const found: Payloads = { oversized: [] };
	const view = viewOf(bytes);
	const end = Math.min(bytes.length, 8 + view.getUint32(4, true));
	let at = 12;
	for (let step = 0; at + 8 <= end && step < MAX_CONTAINER_STEPS; step++) {
		const size = view.getUint32(at + 4, true);
		const start = at + 8;
		const stop = start + size;
		if (size > end - start) break;
		if (startsWith(bytes, 'EXIF', at)) {
			// The spec says a bare TIFF block; some encoders keep JPEG's APP1 preamble.
			found.tiff ??= withoutExifPreamble(bytes.subarray(start, stop));
		} else if (startsWith(bytes, 'XMP ', at)) {
			found.xmp ??= bytes.subarray(start, stop);
		} else if (startsWith(bytes, 'ICCP', at)) {
			found.icc ??= bytes.subarray(start, stop);
		}
		at = stop + (size % 2); // chunks are padded to an even size
	}
	return found;
}

/** An ISO-BMFF box: its type and the payload range [start, end). */
type Box = { type: string; start: number; end: number };

/**
 * The boxes laid end to end in [from, to), stopping at the first malformed one
 * (or after MAX_BOXES). Every step advances at least a header, so this always
 * terminates.
 */
function readBoxes(bytes: Uint8Array, view: DataView, from: number, to: number): Box[] {
	const boxes: Box[] = [];
	let at = from;
	while (at + 8 <= to && boxes.length < MAX_BOXES) {
		let size = view.getUint32(at);
		const type = fourCC(bytes, at + 4);
		let header = 8;
		if (size === 1) {
			// A 64-bit size follows the type.
			if (at + 16 > to) break;
			size = view.getUint32(at + 8) * 2 ** 32 + view.getUint32(at + 12);
			header = 16;
		} else if (size === 0) {
			size = to - at; // the last box may run to the end of its container
		}
		if (size < header || size > to - at) break;
		boxes.push({ type, start: at + header, end: at + size });
		at += size;
	}
	return boxes;
}

/** An item from iinf; `xmp` marks a `mime` item whose content type is XMP's. */
type HeifItem = { id: number; type: string; xmp: boolean };
const XMP_CONTENT_TYPE = 'application/rdf+xml\0';
type HeifLocation = { method: number; baseOffset: number; extents: [number, number][] };

/**
 * HEIF/HEIC: the `Exif` item and an XMP `mime` item, located through the
 * meta box's item table (iinf) and item locations (iloc), and the ICC profile
 * from the first `colr` property.
 */
function heifPayloads(bytes: Uint8Array): Payloads {
	const found: Payloads = { oversized: [] };
	const view = viewOf(bytes);
	const meta = readBoxes(bytes, view, 0, bytes.length).find((box) => box.type === 'meta');
	if (!meta || meta.end - meta.start < 4) return found;
	// meta is a full box: version and flags precede its children.
	const children = readBoxes(bytes, view, meta.start + 4, meta.end);
	const child = (type: string) => children.find((box) => box.type === type);

	const items = heifItems(bytes, view, child('iinf'));
	const locations = heifLocations(view, child('iloc'));
	const itemData = (item: HeifItem | undefined, name: SegmentName) => {
		const location = item && locations.get(item.id);
		if (!location) return undefined;
		const data = heifItemData(bytes, location, child('idat'));
		if (data === 'oversized') found.oversized.push(name);
		return data === 'oversized' ? undefined : data;
	};

	const exif = itemData(
		items.find((item) => item.type === 'Exif'),
		'exif'
	);
	// An Exif item starts with the offset of the TIFF header past that field
	// (usually 6, skipping JPEG's `Exif\0\0`; some writers say 0 but keep it).
	if (exif && exif.length >= 4) {
		let tiffAt = 4 + viewOf(exif).getUint32(0);
		if (startsWith(exif, JPEG_EXIF, tiffAt)) tiffAt += JPEG_EXIF.length;
		if (tiffAt < exif.length) found.tiff = exif.subarray(tiffAt);
	}
	found.xmp = itemData(
		items.find((item) => item.xmp),
		'xmp'
	);

	const iprp = child('iprp');
	const ipco = iprp && readBoxes(bytes, view, iprp.start, iprp.end).find((b) => b.type === 'ipco');
	const colr =
		ipco &&
		readBoxes(bytes, view, ipco.start, ipco.end).find(
			(box) =>
				box.type === 'colr' &&
				box.end - box.start > 4 &&
				['prof', 'rICC'].includes(fourCC(bytes, box.start))
		);
	if (colr) found.icc = bytes.subarray(colr.start + 4, colr.end);
	return found;
}

/** Item ids and types from iinf (version-2+ entries; older ones have no type). */
function heifItems(bytes: Uint8Array, view: DataView, iinf: Box | undefined): HeifItem[] {
	if (!iinf || iinf.end - iinf.start < 6) return [];
	// Full box header, then an entry count we don't need: the entries are boxes.
	const entriesAt = iinf.start + 4 + (bytes[iinf.start] === 0 ? 2 : 4);
	const items: HeifItem[] = [];
	for (const infe of readBoxes(bytes, view, entriesAt, iinf.end)) {
		if (infe.type !== 'infe' || infe.end - infe.start < 4) continue;
		const version = bytes[infe.start];
		if (version < 2) continue;
		const idSize = version === 2 ? 2 : 4;
		let at = infe.start + 4;
		if (at + idSize + 6 > infe.end) continue;
		const id = idSize === 2 ? view.getUint16(at) : view.getUint32(at);
		at += idSize + 2; // past item_protection_index
		const type = fourCC(bytes, at);
		at += 4;
		let xmp = false;
		if (type === 'mime') {
			// item_name, then content_type, each NUL-terminated: compared in place,
			// since only XMP's matters and a forged table may hold thousands.
			let nameEnd = at;
			while (nameEnd < infe.end && bytes[nameEnd] !== 0) nameEnd++;
			xmp = opensWith(bytes, nameEnd + 1, infe.end, XMP_CONTENT_TYPE);
		}
		items.push({ id, type, xmp });
	}
	return items;
}

/**
 * Item locations from iloc (versions 0-2). A truncated table keeps the items
 * read before the cut; field sizes other than 0/4/8 bytes make it unreadable.
 */
function heifLocations(view: DataView, iloc: Box | undefined): Map<number, HeifLocation> {
	const locations = new Map<number, HeifLocation>();
	if (!iloc) return locations;
	let at = iloc.start;
	const skip = (size: number) => {
		if (at + size > iloc.end) throw new RangeError('iloc truncated');
		at += size;
		return at - size;
	};
	// An unsigned field of 0, 1, 2, 4 or 8 bytes (the only widths iloc uses).
	const take = (size: 0 | 1 | 2 | 4 | 8): number => {
		const from = skip(size);
		if (size === 0) return 0;
		if (size === 1) return view.getUint8(from);
		if (size === 2) return view.getUint16(from);
		if (size === 4) return view.getUint32(from);
		return view.getUint32(from) * 2 ** 32 + view.getUint32(from + 4);
	};
	// Entries can be zero bytes wide, so bound the work by count rather than by bytes.
	let budget = 1 << 16;
	try {
		const version = take(1);
		skip(3); // flags
		const sizes = take(1);
		const more = take(1);
		const offsetSize = fieldWidth(sizes >> 4);
		const lengthSize = fieldWidth(sizes & 0x0f);
		const baseOffsetSize = fieldWidth(more >> 4);
		const indexSize = version > 0 ? fieldWidth(more & 0x0f) : 0;
		if (
			offsetSize === null ||
			lengthSize === null ||
			baseOffsetSize === null ||
			indexSize === null
		) {
			return locations;
		}
		const wide = version < 2 ? 2 : 4;
		const itemCount = take(wide);
		for (let i = 0; i < itemCount && budget > 0; i++, budget--) {
			const id = take(wide);
			const method = version > 0 ? take(2) & 0x0f : 0;
			skip(2); // data_reference_index
			const baseOffset = take(baseOffsetSize);
			const extentCount = take(2);
			const extents: [number, number][] = [];
			for (let e = 0; e < extentCount && budget > 0; e++, budget--) {
				skip(indexSize);
				extents.push([take(offsetSize), take(lengthSize)]);
			}
			if (!locations.has(id)) locations.set(id, { method, baseOffset, extents });
		}
	} catch (error) {
		if (!(error instanceof RangeError)) throw error;
	}
	return locations;
}

const fieldWidth = (n: number): 0 | 4 | 8 | null => (n === 0 || n === 4 || n === 8 ? n : null);

/** An item's bytes: its extents, from the file (method 0) or from idat (method 1). */
function heifItemData(
	bytes: Uint8Array,
	location: HeifLocation,
	idat: Box | undefined
): Uint8Array | 'oversized' | undefined {
	const source =
		location.method === 0
			? bytes
			: location.method === 1 && idat
				? bytes.subarray(idat.start, idat.end)
				: undefined;
	if (!source || location.extents.length === 0) return undefined;
	const parts: Uint8Array[] = [];
	let total = 0;
	for (const [offset, length] of location.extents) {
		const start = location.baseOffset + offset;
		// Length 0 means "the rest of the file" — not how metadata items are stored.
		if (length === 0 || start + length > source.length) return undefined;
		total += length;
		if (total > MAX_PAYLOAD_BYTES) return 'oversized';
		parts.push(source.subarray(start, start + length));
	}
	return parts.length === 1 ? parts[0] : concat(parts);
}

// ─── Decoding ────────────────────────────────────────────────────────────────

/**
 * exifr options for a bare TIFF block (exifr reads it as a .tif file). Only
 * the IFD0, Exif and GPS blocks: XMP, IPTC and ICC come from the container
 * instead, the thumbnail IFD is image data, and MakerNote/UserComment are
 * opaque vendor bytes, skipped unread. `tiff` itself is left unset on purpose:
 * `tiff: true` switches on *every* TIFF block, thumbnail and interop included.
 * reviveValues stays off so no date string ever passes through `new Date()`,
 * which on a UTC server would shift a wall-clock time.
 */
const TIFF_OPTIONS = {
	ifd1: false,
	exif: true,
	gps: true,
	interop: false,
	makerNote: false,
	userComment: false,
	xmp: false,
	icc: false,
	iptc: false,
	jfif: false,
	ihdr: false,
	translateKeys: true,
	translateValues: true,
	reviveValues: false,
	sanitize: true,
	mergeOutput: false,
	// Keep what parses when one block is broken; errors come back in `errors`.
	silentErrors: true
};

/** exifr's segment parsers, called directly on blocks cut out above (untyped in exifr). */
type SegmentParser = { parse(input: unknown): unknown };
const segmentParser = (name: 'xmp' | 'iptc') => exifr.segmentParsers.get(name) as SegmentParser;

/** Decode each block on its own, so one broken block doesn't cost the others. */
async function decodePayloads(payloads: Payloads, problems: string[]): Promise<ImageMetadata> {
	const metadata: ImageMetadata = {};
	const omitted = new Set<SegmentName>(payloads.oversized);
	const attempt = async (label: string, run: () => unknown) => {
		try {
			await run();
		} catch (error) {
			problems.push(`${label}: ${describe(error)}`);
		}
	};

	const { tiff } = payloads;
	if (tiff) {
		await attempt('EXIF', async () => {
			if (!isTiffHeader(tiff)) throw new Error('no TIFF header');
			const output = await exifr.parse(boundTiff(tiff), TIFF_OPTIONS);
			if (!isPlainObject(output)) return;
			if (Array.isArray(output.errors)) {
				problems.push(...output.errors.map((error: unknown) => `EXIF: ${describe(error)}`));
			}
			const ifd0 = isPlainObject(output.ifd0) ? decodeXpStrings(output.ifd0) : undefined;
			for (const [name, raw] of [
				['ifd0', ifd0],
				['exif', output.exif],
				['gps', output.gps]
			] as const) {
				const segment = jsonSafeSegment(raw);
				if (segment) metadata[name] = normalizeExifDates(segment);
			}
		});
	}

	const { xmp } = payloads;
	if (xmp) {
		await attempt('XMP', () => {
			// UTF-8 spends at most three bytes per UTF-16 unit, so skip decoding a packet sure to be over.
			const text = xmp.length > MAX_XMP_CHARS * 3 ? null : new TextDecoder().decode(xmp);
			if (text === null || text.length > MAX_XMP_CHARS) {
				omitted.add('xmp');
				return;
			}
			if (UNSAFE_XMP.test(text)) {
				throw new Error('refused: it uses a JavaScript built-in name as an XML prefix');
			}
			metadata.xmp = jsonSafeSegment(segmentParser('xmp').parse(text));
		});
	}

	const { iptc } = payloads;
	if (iptc) {
		await attempt('IPTC', () => {
			metadata.iptc = jsonSafeSegment(mapStrings(segmentParser('iptc').parse(iptc), iptcText));
		});
	}

	const { icc } = payloads;
	if (icc) {
		await attempt('ICC', () => {
			metadata.icc = jsonSafeSegment(summarizeIcc(icc));
		});
	}

	for (const name of Object.keys(metadata) as SegmentName[]) {
		if (metadata[name] === undefined) delete metadata[name];
	}
	if (omitted.size > 0) metadata.omitted = [...omitted];
	return metadata;
}

function isTiffHeader(bytes: Uint8Array): boolean {
	if (bytes.length < 8) return false;
	return (
		(bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0) ||
		(bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0 && bytes[3] === 0x2a)
	);
}

/** Bytes per value of each TIFF field type, by type number (13 is IFD; 0 is no type). */
const TIFF_TYPE_BYTES = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4];
const TIFF_ASCII = 2;
const TIFF_LONG = 4;
const TIFF_UNDEFINED = 7;
const TIFF_IFD = 13;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;

/**
 * A copy of a TIFF block (its first MAX_TIFF_BYTES) that exifr can read in
 * bounded time, with every entry exifr would read rewritten as needed:
 *
 *  - exifr reads each entry's whole value, building strings and arrays from
 *    it, even ones the record drops. A forged block can point thousands of
 *    entries at one long value (seconds of work, ~100 MB), so values past
 *    MAX_TIFF_VALUE_BYTES in all are emptied (count 0, read as nothing).
 *  - exifr gives up on a whole IFD over one entry with an unknown type or a
 *    value outside the block (a corrupt count, or a block cut short), so those
 *    entries are emptied too and the rest of the IFD is still read.
 *  - exifr follows the Exif and GPS pointers wherever they point (unlike
 *    IFD0's, offsets below 8 included) and whatever their type, reading
 *    strings and arrays as offsets. So it is only left a pointer to an IFD
 *    bounded here: one that isn't a single LONG, points outside the block, or
 *    overlaps an IFD already bounded (rewriting one would change the other) is
 *    made to read as absent.
 *
 * A real camera's block reads exactly as it would have.
 */
function boundTiff(block: Uint8Array): Uint8Array {
	const tiff = block.slice(0, MAX_TIFF_BYTES);
	const view = viewOf(tiff);
	const le = tiff[0] === 0x49;
	const u16 = (at: number) => view.getUint16(at, le);
	const u32 = (at: number) => view.getUint32(at, le);
	const empty = (entry: number, type?: number) => {
		if (type !== undefined) view.setUint16(entry + 2, type, le);
		view.setUint32(entry + 4, 0, le);
	};
	let budget = MAX_TIFF_VALUE_BYTES;
	const tables: [start: number, end: number][] = [];

	/** Bound the IFD at `at`: its entries' positions, or null when it can't be. */
	const bound = (at: number): number[] | null => {
		if (at < 8 || at + 2 > tiff.length) return null;
		const end = Math.min(at + 2 + 12 * u16(at), tiff.length);
		if (tables.some(([start, stop]) => at < stop && start < end)) return null;
		tables.push([at, end]);
		const entries: number[] = [];
		for (let entry = at + 2; entry + 12 <= end; entry += 12) {
			entries.push(entry);
			const typeBytes = TIFF_TYPE_BYTES[u16(entry + 2)];
			if (!typeBytes) {
				empty(entry, TIFF_UNDEFINED);
				continue;
			}
			const bytes = typeBytes * u32(entry + 4);
			if (bytes <= 4) continue; // held in the entry itself
			if (u32(entry + 8) + bytes > tiff.length || bytes > budget) empty(entry);
			else budget -= bytes;
		}
		return entries;
	};

	// exifr refuses an IFD0 offset below 8 or past the end before reading any of it.
	const ifd0 = bound(u32(4));
	for (const entry of ifd0 ?? []) {
		const tag = u16(entry);
		if (tag !== TAG_EXIF_IFD && tag !== TAG_GPS_IFD) continue;
		const type = u16(entry + 2);
		const single = (type === TIFF_LONG || type === TIFF_IFD) && u32(entry + 4) === 1;
		// An ASCII entry with no characters is one exifr reads as absent.
		if (!single || !bound(u32(entry + 8))) empty(entry, TIFF_ASCII);
	}
	return tiff;
}

/**
 * exifr builds XMP output as `root[prefix][name]` with both taken from the
 * packet; a prefix that names an Object.prototype member (`constructor`,
 * `toString`, `__proto__`…) makes it write onto Object or Object.prototype —
 * process-wide pollution from an uploaded photo. Its patterns capture a prefix
 * only right after `<` or a character outside [A-Za-z0-9-], and only with a
 * name character after the colon; this matches every such capture (and
 * `__proto__` anywhere), at the cost of refusing the rare packet whose text
 * happens to read like `toString:x`.
 */
const UNSAFE_XMP = new RegExp(
	`(?<![A-Za-z0-9-])(?:${Object.getOwnPropertyNames(Object.prototype)
		.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
		.join('|')}):(?=[\\w-])|__proto__`
);

/**
 * Windows' XP* tags (Title, Comment, Author, Keywords, Subject) are UTF-16LE
 * bytes; exifr only decodes them through its revivers, which are off.
 */
function decodeXpStrings(ifd0: Record<string, unknown>): Record<string, unknown> {
	const decoded = { ...ifd0 };
	for (const key of ['XPTitle', 'XPComment', 'XPAuthor', 'XPKeywords', 'XPSubject']) {
		const value = decoded[key];
		if (value instanceof Uint8Array) decoded[key] = new TextDecoder('utf-16le').decode(value);
	}
	return decoded;
}

const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

/**
 * exifr reads IPTC strings as Latin-1, but modern tools write UTF-8 (declaring
 * it in a record exifr skips). Bytes that form valid UTF-8 with non-ASCII in
 * them are, in practice, never Latin-1 text, so decode those as UTF-8.
 */
function iptcText(value: string): string {
	// Re-encoding as bytes only works on Latin-1 text, which is what exifr makes.
	if (!/[\x80-\xff]/.test(value) || /[Ā-￿]/.test(value)) return value;
	try {
		return strictUtf8.decode(Uint8Array.from(value, (char) => char.charCodeAt(0)));
	} catch {
		return value;
	}
}

function mapStrings(value: unknown, map: (value: string) => string): unknown {
	if (typeof value === 'string') return map(value);
	if (Array.isArray(value)) return value.map((item) => mapStrings(item, map));
	if (isPlainObject(value)) {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, map)]));
	}
	return value;
}

const PROFILE_CLASSES: Record<string, string> = {
	scnr: 'Input Device Profile',
	mntr: 'Display Device Profile',
	prtr: 'Output Device Profile',
	link: 'DeviceLink Profile',
	spac: 'ColorSpace Conversion Profile',
	abst: 'Abstract Profile',
	nmcl: 'Named Color Profile'
};
const PLATFORMS: Record<string, string> = {
	APPL: 'Apple Computer Inc.',
	MSFT: 'Microsoft Corporation',
	SGI: 'Silicon Graphics Inc.',
	SUNW: 'Sun Microsystems Inc.'
};
const RENDERING_INTENTS = [
	'Perceptual',
	'Media-Relative Colorimetric',
	'Saturation',
	'ICC-Absolute Colorimetric'
];
/** Tag-table entries examined; real profiles have a few dozen. */
const MAX_ICC_TAGS = 256;
/** Records examined in a multi-localized description. */
const MAX_ICC_RECORDS = 64;

/**
 * A summary of an ICC profile — which profile it is, not its color data —
 * under exifr's field names: the header fields that identify it, plus its
 * description and copyright. Read here rather than by exifr (see the module
 * comment); every offset is checked against the profile's bounds.
 */
function summarizeIcc(icc: Uint8Array): Record<string, unknown> | undefined {
	if (icc.length < 132 || !startsWith(icc, 'acsp', 36)) return undefined;
	const view = viewOf(icc);
	const signature = (at: number) => fourCC(icc, at).replace(/[\0 ]+$/, '') || undefined;
	const named = (names: Record<string, string>, at: number) => {
		const value = signature(at);
		return value !== undefined && Object.hasOwn(names, value) ? names[value] : value;
	};
	return {
		ProfileDescription: iccText(icc, view, 'desc'),
		ProfileClass: named(PROFILE_CLASSES, 12),
		ColorSpaceData: signature(16),
		ProfileConnectionSpace: signature(20),
		ProfileVersion: `${icc[8]}.${icc[9] >> 4}.${icc[9] & 0x0f}`,
		ProfileCMMType: signature(4),
		PrimaryPlatform: named(PLATFORMS, 40),
		DeviceManufacturer: signature(48),
		DeviceModel: signature(52),
		RenderingIntent: RENDERING_INTENTS[view.getUint32(64)],
		ProfileCreator: signature(80),
		ProfileCopyright: iccText(icc, view, 'cprt')
	};
}

/** A text tag's value: `desc` (v2 ASCII), `text`, or `mluc` (v4, English preferred). */
function iccText(icc: Uint8Array, view: DataView, tag: string): string | undefined {
	const count = Math.min(view.getUint32(128), MAX_ICC_TAGS);
	for (let i = 0; i < count; i++) {
		const entry = 132 + 12 * i;
		if (entry + 12 > icc.length) return undefined;
		if (!startsWith(icc, tag, entry)) continue;
		const start = view.getUint32(entry + 4);
		const size = view.getUint32(entry + 8);
		if (size < 12 || start > icc.length - size) return undefined;
		const end = start + size;
		switch (fourCC(icc, start)) {
			case 'desc': {
				const length = Math.min(view.getUint32(start + 8), end - start - 12);
				return latin1(icc, start + 12, length);
			}
			case 'text':
				return latin1(icc, start + 8, size - 8);
			case 'mluc': {
				if (size < 16) return undefined;
				const records = Math.min(view.getUint32(start + 8), MAX_ICC_RECORDS);
				const recordSize = view.getUint32(start + 12);
				if (recordSize < 12) return undefined;
				let chosen: string | undefined;
				for (let r = 0; r < records; r++) {
					const record = start + 16 + r * recordSize;
					if (record + 12 > end) break;
					const length = view.getUint32(record + 4);
					const at = start + view.getUint32(record + 8);
					if (at + length > end) continue;
					let text = '';
					for (let c = 0; c + 1 < length && c < MAX_STRING_CHARS * 2; c += 2) {
						text += String.fromCharCode(view.getUint16(at + c));
					}
					chosen ??= text;
					if (latin1(icc, record, 2) === 'en') return text;
				}
				return chosen;
			}
			default:
				return undefined;
		}
	}
	return undefined;
}

// ─── JSON safety ─────────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

const isByteArray = (value: ArrayBufferView) =>
	value instanceof Uint8Array || value instanceof Uint8ClampedArray || value instanceof Int8Array;

/** Control characters other than tab, line feed and carriage return (global: for replace). */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
/** The same class, non-global: `test` on a global regex would carry state between calls. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function cleanString(value: string): string | undefined {
	let clean = value.replace(CONTROL_CHARS, '').trim();
	if (clean.length > MAX_STRING_CHARS) {
		clean = clean.slice(0, MAX_STRING_CHARS);
		// Don't leave half a surrogate pair at the cut.
		if (/[\ud800-\udbff]$/.test(clean)) clean = clean.slice(0, -1);
	}
	return clean === '' ? undefined : clean;
}

/**
 * `value` as plain JSON data, or undefined when nothing representable is left:
 * binary blobs, numeric tables, functions, non-finite numbers and empty
 * containers go; strings
 * lose control characters and are cut to length; lists are cut short; small
 * byte arrays become numbers or, when printable, text (`ExifVersion` "0232").
 */
function jsonSafe(value: unknown, depth = 0): unknown {
	switch (typeof value) {
		case 'string':
			return cleanString(value);
		case 'number':
			return Number.isFinite(value) ? value : undefined;
		case 'boolean':
			return value;
		case 'object':
			break;
		default:
			// undefined, function, symbol, bigint
			return undefined;
	}
	if (value === null) return null;
	if (depth >= MAX_DEPTH) return undefined;
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
	}
	if (ArrayBuffer.isView(value)) {
		if (value instanceof DataView || value instanceof BigInt64Array) return undefined;
		if (value instanceof BigUint64Array) return undefined;
		const typed = value as unknown as ArrayLike<number>;
		const bytes = isByteArray(value);
		// Measured before copying anything: most typed arrays here are dropped.
		if (typed.length === 0 || typed.length > (bytes ? MAX_SMALL_BYTES : MAX_NUMERIC_ITEMS)) {
			return undefined;
		}
		const numbers = Array.from(typed);
		if (bytes && numbers.length === 1) return numbers[0];
		if (bytes && numbers.every((n) => n >= 0x20 && n <= 0x7e)) {
			return cleanString(String.fromCharCode(...numbers));
		}
		return jsonSafe(numbers, depth);
	}
	if (Array.isArray(value)) {
		// Rationals come back as plain arrays: a long one is a table all the same.
		if (value.length > MAX_NUMERIC_ITEMS && value.every((item) => typeof item === 'number')) {
			return undefined;
		}
		// JSON's own rule: an unrepresentable item becomes null, so positions hold.
		const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => jsonSafe(item, depth + 1) ?? null);
		return items.some((item) => item !== null) ? items : undefined;
	}
	if (isPlainObject(value)) {
		const out: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value)) {
			if (key === '__proto__' || key.length > MAX_KEY_CHARS || CONTROL_CHAR.test(key)) continue;
			const safe = jsonSafe(item, depth + 1);
			if (safe !== undefined) out[key] = safe;
		}
		return Object.keys(out).length > 0 ? out : undefined;
	}
	// ArrayBuffer, Map, Set, class instances: nothing exifr hands back as data.
	return undefined;
}

function jsonSafeSegment(value: unknown): MetadataSegment | undefined {
	const safe = jsonSafe(value);
	return isPlainObject(safe) ? safe : undefined;
}

// ─── Dates ───────────────────────────────────────────────────────────────────

/**
 * A capture date as EXIF (`2024:05:01 14:30:00`) or XMP/ISO 8601
 * (`2024-05-01T14:30:00+02:00`, `2024-05-01`) writes it. Seconds may be
 * missing, fractions and anything after the offset are ignored, and the
 * offset is optional. Shape only — see `parseDateTime`.
 */
const DATE_TIME =
	/^(\d{4})([:-])(\d{2})\2(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:[.,]\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?/i;

/**
 * The day, time and offset a date string names, or null when it names no real
 * day (all zeros, blanks, month 13, 31 April) or an impossible time. A date
 * with no time stays day-only: inventing midnight would be false precision.
 */
function parseDateTime(
	value: unknown
): { day: string; time: string | null; offset: string | null } | null {
	if (typeof value !== 'string') return null;
	const match = DATE_TIME.exec(value.replace(CONTROL_CHARS, '').trim());
	if (!match) return null;
	const [, year, , month, dayOfMonth, hours, minutes, seconds = '00', offset] = match;
	const day = `${year}-${month}-${dayOfMonth}`;
	if (!isFullDate(day)) return null;
	if (hours === undefined) return { day, time: null, offset: null };
	if (Number(hours) > 23 || Number(minutes) > 59 || Number(seconds) > 59) return null;
	return { day, time: `${hours}:${minutes}:${seconds}`, offset: parseOffset(offset) };
}

/**
 * A UTC offset normalized to `+HH:MM`: from `+HH:MM`, `+HHMM` or `Z`, within
 * ±14:00. `-00:00` is RFC 3339's "local offset unknown", so it's null.
 */
function parseOffset(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const raw = value.replace(CONTROL_CHARS, '').trim();
	if (raw === 'Z' || raw === 'z') return '+00:00';
	const match = /^([+-])(\d{2}):?(\d{2})$/.exec(raw);
	if (!match) return null;
	const [, sign, hours, minutes] = match;
	const total = Number(hours) * 60 + Number(minutes);
	if (Number(minutes) > 59 || total > 14 * 60) return null;
	if (sign === '-' && total === 0) return null;
	return `${sign}${hours}:${minutes}`;
}

const XMP_NAMESPACES = {
	photoshop: 'http://ns.adobe.com/photoshop/1.0/',
	exif: 'http://ns.adobe.com/exif/1.0/',
	xmp: 'http://ns.adobe.com/xap/1.0/'
} as const;

/**
 * An XMP property by namespace. exifr groups properties by the prefix the
 * packet used, which is the packet's choice, so look the prefix up from the
 * namespace declarations it recorded, falling back to the conventional one.
 */
function xmpProperty(
	xmp: MetadataSegment | undefined,
	namespace: keyof typeof XMP_NAMESPACES,
	name: string
): unknown {
	if (!xmp) return undefined;
	const bindings = isPlainObject(xmp.xmlns) ? xmp.xmlns : {};
	const declared = Object.keys(bindings).filter((p) => bindings[p] === XMP_NAMESPACES[namespace]);
	for (const prefix of declared.length > 0 ? declared : [namespace]) {
		const properties = xmp[prefix];
		if (!isPlainObject(properties)) continue;
		let value = properties[name];
		// A single-item list, or a language alternative ({ lang, value }).
		if (Array.isArray(value)) value = value[0];
		if (isPlainObject(value)) value = value.value;
		if (value !== undefined) return value;
	}
	return undefined;
}

/**
 * When the photograph was taken: EXIF DateTimeOriginal, then CreateDate
 * (when it was digitized — the same moment for a camera, the scan for a
 * scanned print), each with its own offset tag; then XMP's equivalents,
 * photoshop:DateCreated first (the standard home of the original date in XMP),
 * then exif:DateTimeOriginal and xmp:CreateDate, each with its own inline
 * offset. Never a modification date: editing a photo doesn't move when it was
 * taken.
 *
 * Some cameras record only OffsetTime, which belongs to the modification
 * date. It is taken as the capture offset only when that date is the capture
 * moment itself (a photo never edited), never from a later edit.
 */
function captureTime(
	metadata: ImageMetadata
): Pick<ParsedImageMetadata, 'capturedAt' | 'capturedOffset'> {
	const exif = metadata.exif ?? {};
	const { xmp } = metadata;
	const sources: [date: unknown, offset: unknown][] = [
		[exif.DateTimeOriginal, exif.OffsetTimeOriginal],
		[exif.CreateDate, exif.OffsetTimeDigitized],
		[xmpProperty(xmp, 'photoshop', 'DateCreated'), undefined],
		[xmpProperty(xmp, 'exif', 'DateTimeOriginal'), undefined],
		[xmpProperty(xmp, 'xmp', 'CreateDate'), undefined]
	];
	const modified = parseDateTime(metadata.ifd0?.ModifyDate);
	for (const [date, offset] of sources) {
		const parsed = parseDateTime(date);
		if (!parsed) continue;
		if (parsed.time === null) return { capturedAt: parsed.day, capturedOffset: null };
		const unedited = modified?.day === parsed.day && modified.time === parsed.time;
		return {
			capturedAt: `${parsed.day}T${parsed.time}`,
			// The offset tag, else an offset written into the date itself, else OffsetTime.
			capturedOffset:
				parseOffset(offset) ?? parsed.offset ?? (unedited ? parseOffset(exif.OffsetTime) : null)
		};
	}
	return { capturedAt: null, capturedOffset: null };
}

/** An EXIF-format date (colons in the date part), optionally with time and fraction. */
const EXIF_DATE = /^\d{4}:\d{2}:\d{2}(?: \d{2}:\d{2}:\d{2}(\.\d+)?)?$/;

/**
 * Rewrite EXIF-format dates in a TIFF segment the way the rest of the archive
 * writes dates (`2024-05-01T14:30:00`, `2024-05-01`). Values that name no
 * real date stay as recorded, so the record still shows what the camera wrote.
 */
function normalizeExifDates(segment: MetadataSegment): MetadataSegment {
	for (const [key, value] of Object.entries(segment)) {
		if (typeof value !== 'string') continue;
		const match = EXIF_DATE.exec(value);
		const parsed = match && parseDateTime(value);
		if (!parsed) continue;
		segment[key] = parsed.time ? `${parsed.day}T${parsed.time}${match[1] ?? ''}` : parsed.day;
	}
	return segment;
}

// ─── Size cap ────────────────────────────────────────────────────────────────

/** What a trimmed segment keeps: dates, exposure, camera and position basics. */
const ESSENTIAL_FIELDS: Partial<Record<SegmentName, readonly string[]>> = {
	exif: [
		'DateTimeOriginal',
		'CreateDate',
		'OffsetTime',
		'OffsetTimeOriginal',
		'OffsetTimeDigitized',
		'SubSecTimeOriginal',
		'SubSecTimeDigitized',
		'ExposureTime',
		'FNumber',
		'ISO',
		'ExposureProgram',
		'ExposureCompensation',
		'MeteringMode',
		'Flash',
		'FocalLength',
		'FocalLengthIn35mmFormat',
		'LensMake',
		'LensModel',
		'ExifImageWidth',
		'ExifImageHeight'
	],
	ifd0: ['Make', 'Model', 'Software', 'Orientation', 'ModifyDate', 'Artist', 'Copyright'],
	gps: [
		'latitude',
		'longitude',
		'GPSLatitudeRef',
		'GPSLatitude',
		'GPSLongitudeRef',
		'GPSLongitude',
		'GPSAltitudeRef',
		'GPSAltitude',
		'GPSDateStamp',
		'GPSTimeStamp'
	]
};

/**
 * Shrinking steps, in order, until the record fits: whole segments of the
 * least archival value first, then EXIF cut to its essentials. A real photo
 * fits by then (a JPEG can't hold more EXIF than the cap); the rest is a
 * backstop for forged files, so the cap holds whatever arrives.
 */
const SHRINK_STEPS: [SegmentName, 'drop' | 'trim'][] = [
	['xmp', 'drop'],
	['iptc', 'drop'],
	['icc', 'drop'],
	['exif', 'trim'],
	['ifd0', 'trim'],
	['gps', 'trim'],
	['exif', 'drop'],
	['gps', 'drop'],
	['ifd0', 'drop']
];

const encoder = new TextEncoder();
const jsonBytes = (value: unknown) => encoder.encode(JSON.stringify(value)).length;

/**
 * The record cut down to MAX_METADATA_JSON_BYTES. Each segment that lost data
 * is named once in `omitted`, in the order it was cut: a named segment that is
 * absent was left out whole, one still present was cut to its essentials.
 */
function fitToCap(metadata: ImageMetadata): ImageMetadata {
	const fitted: ImageMetadata = { ...metadata };
	const omitted = [...(metadata.omitted ?? [])];
	delete fitted.omitted;
	const size = () => jsonBytes(omitted.length > 0 ? { ...fitted, omitted } : fitted);
	for (const [name, action] of SHRINK_STEPS) {
		if (size() <= MAX_METADATA_JSON_BYTES) break;
		const segment = fitted[name];
		if (!segment) continue;
		if (action === 'drop') {
			delete fitted[name];
		} else {
			const essentials = ESSENTIAL_FIELDS[name] ?? [];
			const kept = Object.fromEntries(
				Object.entries(segment).filter(([key]) => essentials.includes(key))
			);
			if (Object.keys(kept).length === Object.keys(segment).length) continue;
			if (Object.keys(kept).length > 0) fitted[name] = kept;
			else delete fitted[name];
		}
		if (!omitted.includes(name)) omitted.push(name);
	}
	if (omitted.length > 0) fitted.omitted = omitted;
	return fitted;
}

/** An error as one short log-safe line (no line breaks or control characters). */
function describe(error: unknown): string {
	const raw = error instanceof Error ? error.message : String(error);
	// eslint-disable-next-line no-control-regex
	const message = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
	return message.length > MAX_WARNING_CHARS ? `${message.slice(0, MAX_WARNING_CHARS)}…` : message;
}
