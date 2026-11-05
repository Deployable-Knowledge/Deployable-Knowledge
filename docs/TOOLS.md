# Agent tools

Tools let the model do more than write text. It decides when to use them. You switch them on with
the **Tools** button in the chat box and pick which ones in **Settings → Tools**.

| Tool             | What it does                                               | Modes            |
| ---------------- | ---------------------------------------------------------- | ---------------- |
| `search`         | Searches your documents                                    | Search           |
| `read_chunks`    | Reads the text around a passage it found                   | Search           |
| `corpus_details` | Lists the documents in the library                         | Search, Notebook |
| `get_datetime`   | Checks the current date and time                           | Search, Notebook |
| `python`         | Runs calculations and draws charts, can read CSVs          | Search, Notebook |
| `use_skill`      | Loads one of your skills when a request matches it         | Search, Notebook |
| `goals`          | Keeps a checklist for multi-part requests (off by default) | Search, Notebook |

Python runs in a sandbox (Pyodide), so it doesn't need Python installed.

## Adding a tool

1. Add a file in `src/lib/server/tools/` that exports an `AgentTool`: an id, a label, the modes
   it works in, a JSON schema for its arguments, and an `execute` function.
2. Register it in `src/lib/server/tools/index.ts`.

That's it. It shows up in Settings and the model can call it.

Return to [docs](README.md).
