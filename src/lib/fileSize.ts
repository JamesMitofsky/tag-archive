/** A byte count as people read file sizes: "812 bytes", "640 KB", "4.2 MB", "1.3 GB". */
export function formatFileSize(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return '';
	if (bytes < 1024) return bytes === 1 ? '1 byte' : `${Math.round(bytes)} bytes`;
	const kilobytes = Math.round(bytes / 1024);
	// Checked after rounding, so 1023.6 KB reads "1.0 MB", never "1024 KB".
	if (kilobytes < 1024) return `${kilobytes} KB`;
	const megabytes = bytes / (1024 * 1024);
	// Likewise, so 1023.96 MB reads "1.0 GB", never "1024.0 MB".
	if (Number(megabytes.toFixed(1)) < 1024) return `${megabytes.toFixed(1)} MB`;
	return `${(megabytes / 1024).toFixed(1)} GB`;
}
