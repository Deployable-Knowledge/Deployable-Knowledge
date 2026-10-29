import type { Editor } from '@tiptap/core';

export type ClipboardAction = 'cut' | 'copy' | 'paste';

const CLIPBOARD_TYPES = ['text/html', 'text/plain'];

async function writeSelection(editor: Editor, cut: boolean): Promise<void> {
	const { view } = editor;
	const { dom, text } = view.serializeForClipboard(view.state.selection.content());
	await navigator.clipboard.write([
		new ClipboardItem({
			'text/html': new Blob([dom.innerHTML], { type: 'text/html' }),
			'text/plain': new Blob([text], { type: 'text/plain' })
		})
	]);
	if (!cut) return;
	view.dispatch(view.state.tr.deleteSelection().scrollIntoView().setMeta('uiEvent', 'cut'));
}

async function pasteClipboard(editor: Editor): Promise<void> {
	const data = new DataTransfer();
	for (const item of await navigator.clipboard.read()) {
		for (const type of item.types.filter((type) => CLIPBOARD_TYPES.includes(type))) {
			data.setData(type, await (await item.getType(type)).text());
		}
	}
	const event = new ClipboardEvent('paste', { clipboardData: data });
	const html = data.getData('text/html');
	if (html) editor.view.pasteHTML(html, event);
	else editor.view.pasteText(data.getData('text/plain'), event);
}

export function runClipboardAction(editor: Editor, action: ClipboardAction): Promise<void> {
	editor.commands.focus();
	if (action === 'paste') return pasteClipboard(editor);
	return writeSelection(editor, action === 'cut');
}
