import { NotebooksRepository } from '#lib/server/repositories';
import { spansToStyledSyntax } from '#lib/utils/notebook-styles';

/**
 * Pages written before the `[text]{color=…}` syntax stored colors as
 * `<span style>` HTML. Converting them on every boot is idempotent: once a page
 * is converted it no longer changes, and spans that cannot convert (other CSS)
 * are left alone, so no app_state flag is needed.
 */
export async function convertLegacyNotebookStyles(): Promise<void> {
	const pages = await NotebooksRepository.findPageContentsContaining('<span');
	const converted = pages
		.map(({ id, content }) => ({ id, content: spansToStyledSyntax(content) }))
		.filter(({ content }, index) => content !== pages[index].content);
	await NotebooksRepository.replacePageContents(converted);
}
