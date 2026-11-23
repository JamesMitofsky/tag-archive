import { MAX_TRACK_BYTES, MAX_TRACK_SECONDS } from './limits';
import type {
	TrackFinalizeRequest,
	TrackUploadGrant,
	TrackUploadRequest,
	UploadedTrack
} from './types';
import { sniffAudio, type AudioSniff, type AudioType } from '#lib/audioType.ts';
import {
	postJson,
	putWithProgress,
	UNLIMITED,
	UploadError,
	type Limiter
} from '#lib/uploads/transfer.ts';

/**
 * The browser side of uploading one album track (see #lib/server/trackUploads
 * for the server side). The file goes straight to the bucket in one presigned
 * PUT, untouched: unlike a photograph there is no display copy to make, since
 * the browser plays the file as it was recorded. Finalize then has the server
 * check what landed and record it.
 */

const UPLOAD_URL_ENDPOINT = '/api/tracks/upload-url';
const FINALIZE_ENDPOINT = '/api/tracks/finalize';
const trackEndpoint = (id: number) => `/api/tracks/${id}`;

/**
 * PUTs in flight at once across an album's tracks. Two, not the photographs'
 * three: a track is tens of megabytes, so more at once only makes every one
 * of them finish later, and the first tracks done is what lets the keeper
 * start naming them.
 */
export const MAX_TRACK_PUTS_IN_FLIGHT = 2;

/** Where one upload is, for its row to say. */
export type TrackUploadStage = 'reading' | 'uploading' | 'finalizing' | 'done' | 'error';

const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;
export const TRACK_TOO_LARGE = `Tracks can be at most ${megabytes(MAX_TRACK_BYTES)}`;

/**
 * What a file's bytes say it is (see #lib/audioType), read through
 * `File.slice` so even a gigabyte file is only touched where it is looked at.
 */
export async function sniffTrackFile(file: Blob): Promise<AudioSniff> {
	try {
		return await sniffAudio(
			async (start, length) => new Uint8Array(await file.slice(start, start + length).arrayBuffer())
		);
	} catch {
		// Moved, deleted, or still downloading from a cloud drive.
		return { refused: 'This file could not be read' };
	}
}

/** How long a file takes to report its length before it is left unmeasured. */
const MEASURE_TIMEOUT_MS = 15_000;

/**
 * The track's length in seconds as this browser reads it from the file's
 * own header, or null when it can't (a format it doesn't play, a stream with
 * no stated length). Only ever shown, never relied on; see `track.duration`.
 */
export function measureDuration(file: Blob, signal?: AbortSignal): Promise<number | null> {
	return new Promise((resolve) => {
		const audio = new Audio();
		const url = URL.createObjectURL(file);
		const done = (value: number | null) => {
			clearTimeout(timer);
			signal?.removeEventListener('abort', abort);
			audio.removeAttribute('src');
			audio.load();
			URL.revokeObjectURL(url);
			resolve(value);
		};
		const abort = () => done(null);
		// Declared after `done`, which only ever runs once this is set.
		const timer = setTimeout(abort, MEASURE_TIMEOUT_MS);
		signal?.addEventListener('abort', abort, { once: true });
		audio.preload = 'metadata';
		audio.onloadedmetadata = () => {
			const seconds = audio.duration;
			done(
				Number.isFinite(seconds) && seconds > 0 && seconds <= MAX_TRACK_SECONDS ? seconds : null
			);
		};
		audio.onerror = () => done(null);
		audio.src = url;
	});
}

/** Ask for the track's upload URL, for its exact type and size. */
function requestTrackUpload(
	file: File,
	type: AudioType,
	signal?: AbortSignal
): Promise<TrackUploadGrant> {
	const body: TrackUploadRequest = { type, size: file.size, name: file.name };
	return postJson<TrackUploadGrant>(UPLOAD_URL_ENDPOINT, body, signal);
}

/**
 * Delete a finalized track that no form will attach. Best-effort: the server
 * sweeps unattached tracks anyway, so a failure here is only a delay.
 * `keepalive` lets a removal made just before leaving the page land.
 */
export async function deleteUploadedTrack(id: number): Promise<void> {
	try {
		await fetch(trackEndpoint(id), { method: 'DELETE', keepalive: true });
	} catch {
		// Best-effort cleanup
	}
}

export type TrackUploadOptions = {
	/** Bounds the PUTs in flight across every upload sharing it; unbounded without one. */
	slots?: Limiter;
	onStage?: (stage: TrackUploadStage) => void;
	/** 0–1 over the file's bytes; never moves back. */
	onProgress?: (fraction: number) => void;
	signal?: AbortSignal;
};

/**
 * Upload one track: sniff it (a file the archive can't play is refused
 * before any request), measure its length meanwhile, ask for its URL once a
 * slot is free, PUT it, then finalize.
 *
 * Aborting `signal` stops whatever is still running and rejects with the
 * abort reason, except once finalize has been asked: by then the track may
 * already exist on the server, so finalize is left to finish and the upload
 * resolves with it, for the caller to delete if it no longer wants it. A file
 * PUT but never finalized is swept by the server.
 */
export async function uploadTrack(
	file: File,
	options: TrackUploadOptions = {}
): Promise<UploadedTrack> {
	const { slots = UNLIMITED, onStage, onProgress, signal } = options;
	let settled = false;
	const report = (stage: TrackUploadStage) => {
		if (!settled && !signal?.aborted) onStage?.(stage);
	};
	let last = 0;
	const progress = (loaded: number) => {
		const fraction = Math.min(1, loaded / Math.max(1, file.size));
		if (settled || signal?.aborted || fraction <= last) return;
		last = fraction;
		onProgress?.(fraction);
	};

	try {
		report('reading');
		if (file.size === 0) throw new UploadError('This file is empty', 413);
		if (file.size > MAX_TRACK_BYTES) throw new UploadError(TRACK_TOO_LARGE, 413);
		const sniffed = await sniffTrackFile(file);
		if ('refused' in sniffed) throw new UploadError(sniffed.refused, 415);
		signal?.throwIfAborted();

		// Read from the file alongside the upload; nothing waits on it until finalize.
		const duration = measureDuration(file, signal);

		const release = await slots.acquire({ signal });
		try {
			const grant = await requestTrackUpload(file, sniffed.type, signal);
			report('uploading');
			await putWithProgress(grant.upload, file, { signal, onProgress: progress });

			signal?.throwIfAborted();
			const request: TrackFinalizeRequest = {
				key: grant.key,
				ticket: grant.ticket,
				name: file.name,
				duration: await duration
			};
			report('finalizing');
			// Deliberately not abortable (see above): an abort would only stop us
			// hearing the answer, not the server recording the track.
			const uploaded = await postJson<UploadedTrack>(FINALIZE_ENDPOINT, request);
			report('done');
			return uploaded;
		} finally {
			release();
		}
	} catch (e) {
		report('error');
		throw e;
	} finally {
		settled = true;
	}
}
