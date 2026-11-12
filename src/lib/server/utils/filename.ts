export function filenameSlug(title: string, fallback: string): string {
	return (
		title
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 80)
			.replace(/-+$/g, '') || fallback
	);
}
