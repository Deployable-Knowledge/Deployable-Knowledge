import AdmZip from 'adm-zip';
import type { NotebookPage, NotebookWithPages } from '#lib/types';
import { filenameSlug } from '#lib/server/utils/filename';

export function notebookPageMarkdown(page: Pick<NotebookPage, 'content' | 'title'>): string {
	const content = page.content.trimEnd();
	return content ? `${content}\n` : '';
}

export function notebookPageMarkdownFilename(title: string): string {
	return `${filenameSlug(title, 'notebook-page')}.md`;
}

export function notebookZip(notebook: NotebookWithPages): ArrayBuffer {
	const archive = new AdmZip();
	const usedNames = new Set<string>();

	notebook.pages.forEach((page, index) => {
		const base = filenameSlug(page.title, `page-${index + 1}`);
		let filename = `${base}.md`;
		let suffix = 2;

		while (usedNames.has(filename.toLowerCase())) {
			filename = `${base}-${suffix}.md`;
			suffix += 1;
		}

		usedNames.add(filename.toLowerCase());

		archive.addFile(filename, Buffer.from(notebookPageMarkdown(page), 'utf8'));
	});

	return Uint8Array.from(archive.toBuffer()).buffer;
}

export function notebookZipFilename(title: string): string {
	return `${filenameSlug(title, 'notebook')}.zip`;
}
