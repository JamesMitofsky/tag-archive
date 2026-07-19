import { EMAIL_RE, check, defineSuite, str } from './helpers';

export type EmailData = { email: string };
export type OtpData = { otp: string };

/** Normalised email as the server stores/looks it up (trimmed + lowercased). */
export function parseEmailForm(fd: FormData): EmailData {
	return { email: str(fd.get('email')).toLowerCase() };
}

export function parseOtpForm(fd: FormData): OtpData {
	return { otp: str(fd.get('otp')) };
}

/** Fresh email suite — one per server request, one shared in the browser. */
export function createEmailSuite() {
	return defineSuite<EmailData>((data) => {
		check('email', 'Enter a valid email address', EMAIL_RE.test(data.email ?? ''));
	});
}

export function createOtpSuite() {
	return defineSuite<OtpData>((data) => {
		check('otp', 'Code is 6 digits', /^\d{6}$/.test(data.otp ?? ''));
	});
}
