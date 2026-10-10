import { check, defineSuite, EMAIL_RE, str } from './helpers';

/**
 * The optional "how can a keeper reach you?" form a public contributor may fill
 * in after submitting. Either field alone is enough; together they can't both
 * be blank.
 */
export type ContactData = {
	name: string;
	email: string;
};

/** Read the contact form. Shared by the action and `use:enhance`. */
export function parseContactForm(fd: FormData): ContactData {
	return {
		name: str(fd.get('name')),
		email: str(fd.get('email')).toLowerCase()
	};
}

export function createContactSuite() {
	return defineSuite<ContactData>((data) => {
		const name = data.name ?? '';
		const email = data.email ?? '';
		check('name', 'Leave a name or an email', name.length > 0 || email.length > 0);
		check('name', 'Keep the name under 200 characters', name.length <= 200);
		check('email', 'Enter a valid email address', email === '' || EMAIL_RE.test(email));
		check('email', 'Keep the email under 254 characters', email.length <= 254);
	});
}
