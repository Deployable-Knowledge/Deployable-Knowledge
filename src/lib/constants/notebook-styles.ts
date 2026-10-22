// The hex values are only written into exported Markdown; inside the app each
// name resolves to a theme-aware --nb-color-* / --nb-highlight-* token.
export const NOTEBOOK_TEXT_COLORS = [
	{ name: 'red', label: 'Red', hex: '#dc2626' },
	{ name: 'orange', label: 'Orange', hex: '#ea580c' },
	{ name: 'yellow', label: 'Yellow', hex: '#ca8a04' },
	{ name: 'green', label: 'Green', hex: '#16a34a' },
	{ name: 'blue', label: 'Blue', hex: '#2563eb' },
	{ name: 'violet', label: 'Violet', hex: '#7c3aed' },
	{ name: 'pink', label: 'Pink', hex: '#db2777' },
	{ name: 'gray', label: 'Gray', hex: '#6b7280' }
] as const;

export const NOTEBOOK_HIGHLIGHTS = [
	{ name: 'yellow', label: 'Yellow', hex: '#fef08a' },
	{ name: 'orange', label: 'Orange', hex: '#fed7aa' },
	{ name: 'green', label: 'Green', hex: '#bbf7d0' },
	{ name: 'teal', label: 'Teal', hex: '#99f6e4' },
	{ name: 'blue', label: 'Blue', hex: '#bfdbfe' },
	{ name: 'violet', label: 'Violet', hex: '#e9d5ff' },
	{ name: 'pink', label: 'Pink', hex: '#fbcfe8' },
	{ name: 'gray', label: 'Gray', hex: '#e5e7eb' }
] as const;

export type NotebookTextColor = (typeof NOTEBOOK_TEXT_COLORS)[number]['name'];
export type NotebookHighlight = (typeof NOTEBOOK_HIGHLIGHTS)[number]['name'];
