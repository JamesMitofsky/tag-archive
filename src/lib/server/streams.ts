/**
 * Reading HTTP bodies without trusting their size: shared by the upload
 * checks (./imageUploads), the dev upload proxy, and the iCloud copy
 * (./icloud), each of which reads bytes from somewhere it doesn't control.
 */

/**
 * Stop a body that won't be read. Canceling drops its connection, so the rest
 * is never transferred. Cleanup only: it never fails the caller.
 */
export async function release(body: ReadableStream | null): Promise<void> {
	await body?.cancel().catch(() => {});
}

/**
 * Read a request or response body into memory, giving up (null) as soon as it
 * passes `cap` bytes: a declared `Content-Length` over the cap is refused
 * before a byte is read, and an undeclared or understated one is cut off
 * mid-stream. Either way no body larger than `cap` is ever buffered whole.
 */
export async function readCapped(
	message: { body: ReadableStream<Uint8Array> | null; headers: Headers },
	cap: number
): Promise<Uint8Array | null> {
	const declared = Number(message.headers.get('content-length') ?? NaN);
	if (declared > cap) {
		await release(message.body);
		return null;
	}
	if (!message.body) return new Uint8Array(0);

	const reader = message.body.getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		length += value.byteLength;
		if (length > cap) {
			await reader.cancel().catch(() => {});
			return null;
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}
