import { EMAIL_RE, check, defineSuite, str } from './helpers';

export type EmailData = { email: string };
export type OtpData = { otp: string };

/** Roles an admin can assign when creating an account. Mirrors the better-auth
 *  admin plugin config (`defaultRole: 'contributor'`, `adminRoles: ['admin']`). */
export const ASSIGNABLE_ROLES = ['contributor', 'admin'] as const;
export type Role = (typeof ASSIGNABLE_ROLES)[number];

export type CreateUserData = { name: string; email: string; role: string };

export function parseCreateUserForm(fd: FormData): CreateUserData {
	return {
		name: str(fd.get('name')),
		email: str(fd.get('email')).toLowerCase(),
		role: str(fd.get('role'))
	};
}

/** New-account form: real name, valid email, one of the assignable roles. */
export function createNewUserSuite() {
	return defineSuite<CreateUserData>((data) => {
		check('name', 'Enter a name', (data.name ?? '').length > 0);
		check('email', 'Enter a valid email address', EMAIL_RE.test(data.email ?? ''));
		check('role', 'Pick a role', ASSIGNABLE_ROLES.includes(data.role as Role));
	});
}

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
