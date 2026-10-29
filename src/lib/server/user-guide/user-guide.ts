import type { UserGuideChapter } from '#lib/types';

// Vite inlines the chapter text into the server build, so the guide never
// depends on files existing beside the installed app.
const chapterFiles = import.meta.glob<string>('./chapters/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
});

const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n+/;

function parseChapter(id: string, source: string): UserGuideChapter {
	const text = source.replace(/\r\n?/g, '\n');
	const frontMatter = text.match(FRONT_MATTER);
	const description = frontMatter?.[1].match(/^description:\s*(.+)$/m)?.[1].trim() ?? null;

	return {
		id,
		title: id.replace(/\.md$/i, ''),
		description,
		content: frontMatter ? text.slice(frontMatter[0].length) : text
	};
}

const chapters: UserGuideChapter[] = Object.entries(chapterFiles)
	.map(([path, source]) => parseChapter(path.slice(path.lastIndexOf('/') + 1), source))
	.sort((left, right) =>
		left.id.localeCompare(right.id, undefined, { numeric: true, sensitivity: 'base' })
	);

export function listUserGuideChapters(): UserGuideChapter[] {
	return chapters;
}
