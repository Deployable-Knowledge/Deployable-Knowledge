# Architecture

Deployable Knowledge is one SvelteKit app that runs on your own machine. There's one user, no
login, and everything is stored in a local SQLite database. The desktop app is the same server
wrapped in Electron.

## How the pieces talk

In the browser, each layer only talks to the one below it:

1. **Components** draw the screen and pass on what you click.
2. **Stores** hold the app's state and decide what to do.
3. **Services** make the HTTP calls.
4. **Endpoints** on the server do the work, using the modules in `src/lib/server/`.

## Where things are

| Folder                    | What's in it                                        |
| ------------------------- | --------------------------------------------------- |
| `src/lib/components/app/` | The windows and dialogs, one folder per feature     |
| `src/lib/stores/`         | App state                                           |
| `src/lib/services/`       | HTTP clients                                        |
| `src/routes/(app)/`       | Pages and API endpoints                             |
| `src/lib/server/`         | Database, documents, search, models, chat and tools |
| `electron/`               | The desktop shell                                   |
| `drizzle/`                | Database migrations                                 |

## Where your data is

Everything sits in the folder the server runs from (in the desktop app, your user data folder):

| Path         | Holds                             |
| ------------ | --------------------------------- |
| `app.db`     | The database                      |
| `documents/` | Copies of everything you've added |
| `models/`    | Downloaded chat models            |
| `.cache/`    | Embedding, speech and OCR models  |
| `logs/`      | Log files                         |

More detail: [Chat pipeline](CHAT_PIPELINE.md), [Documents and search](DOCUMENTS_AND_SEARCH.md),
[Agent tools](TOOLS.md).

Return to [docs](README.md).
