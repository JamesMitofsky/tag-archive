// The sniffer is pure and shared with the browser, which uses it to declare an
// upload's type before asking for an upload URL; the server re-sniffs whatever
// actually landed. Kept here so server imports read as before.
export { IMAGE_TYPES, isImageType, sniffImageType, type ImageType } from '$lib/imageType';
