# API reference

The app's own HTTP endpoints. They're meant for the browser, not as a public API. All paths are
listed in `src/lib/constants/api-endpoints.ts`.

| Path                 | For                                                           |
| -------------------- | ------------------------------------------------------------- |
| `/sessions`          | Chats: list, create, rename, delete, and send a message       |
| `/search`            | Search the documents with all three methods at once           |
| `/documents`         | Add, remove, tag, activate, sync, export and import documents |
| `/notebooks`         | Notebooks, pages and their saved sources                      |
| `/profiles`          | Saved model, prompt and retrieval settings                    |
| `/prompt-templates`  | System prompts                                                |
| `/skills`            | Your skills                                                   |
| `/providers`         | Ollama and OpenAI-compatible providers                        |
| `/local-models`      | Download and delete local chat models                         |
| `/embedding`         | The embedding model                                           |
| `/tools`             | The list of agent tools                                       |
| `/workspace-layouts` | Layout tabs                                                   |
| `/theme`             | Light, dark and color theme                                   |
| `/setup`             | First-run downloads                                           |
| `/diagnostics`       | Health, counts and logs                                       |
| `/user-guide`        | The in-app guide chapters                                     |

## Sending a message

`POST /sessions/{id}/messages` streams back one JSON event per line:

| Event        | Means                                          |
| ------------ | ---------------------------------------------- |
| `agent`      | The model or a tool started or finished        |
| `text`       | A piece of the answer                          |
| `text-reset` | Drop the text so far, the model is using tools |
| `goals`      | The task checklist changed                     |
| `complete`   | The answer is done                             |
| `title`      | A new chat got its name                        |
| `error`      | Something went wrong                           |

Return to [docs](README.md).
