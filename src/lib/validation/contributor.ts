import { check, defineSuite, str } from './helpers';

/** Normalised rename-form values — validated, then used for the DB write. */
export type RenameData = {
	name: string;
};

/** Read a contributor rename form. Shared by the action and `use:enhance`. */
export function parseRenameForm(fd: FormData): RenameData {
	return {
		name: str(fd.get('name'))
	};
}

export function createRenameSuite() {
	return defineSuite<RenameData>((data) => {
		const name = data.name ?? '';
		check('name', 'Name is required', name.length > 0);
		check('name', 'Keep the name under 200 characters', name.length <= 200);
	});
}
