import quickStart from './01-quick-start.md?raw';
import workspace from './02-workspace.md?raw';
import corpus from './03-corpus.md?raw';
import chat from './04-chat.md?raw';
import tools from './05-tools.md?raw';
import models from './06-models.md?raw';
import notebook from './07-notebook.md?raw';
import searchAndRetrieval from './08-search-and-retrieval.md?raw';
import viewingSources from './09-viewing-sources.md?raw';
import troubleshooting from './10-troubleshooting.md?raw';

export const USER_MANUAL_TITLE = 'Deployable Knowledge User Manual';

export const USER_MANUAL_PAGES = [
	{ title: '1. Quick start', content: quickStart },
	{ title: '2. The workspace', content: workspace },
	{ title: '3. Your corpus', content: corpus },
	{ title: '4. Chatting with your documents', content: chat },
	{ title: '5. Tools', content: tools },
	{ title: '6. Models', content: models },
	{ title: '7. The notebook', content: notebook },
	{ title: '8. Search and retrieval', content: searchAndRetrieval },
	{ title: '9. Viewing the original source', content: viewingSources },
	{ title: '10. Troubleshooting and glossary', content: troubleshooting }
];
