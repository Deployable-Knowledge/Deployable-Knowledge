# Welcome to Deployable Knowledge

Deployable Knowledge is a private research workbench that runs on your own computer. You give it documents, ask questions about them in a chat, and collect what you learn in this notebook. Nothing leaves your machine unless you connect an online model yourself.

> **This is an ordinary notebook page.** You can scroll it, edit it, add your own notes to it, or delete it when you no longer need it.

**What's in this guide**

1. Quick start: your first answer in 5 minutes
2. The workspace: windows and layout tabs
3. Your corpus: adding and managing documents
4. Chatting with your documents
5. Tools: letting the assistant take actions
6. Models: switching and downloading
7. The notebook: notes, chat replies and citations
8. Search and retrieval: how answers find their sources
9. Viewing the original source
10. Troubleshooting and glossary

Tip: press **Ctrl+F** while this page is open to find a word in the guide.

# 1. Quick start

Follow these six steps once and you will have used every main part of the app.

1. **Get a model.** At the bottom-right of the **Assistant Chat** window, click the model name (it says **Select a model** the first time). Under **Local models**, click the download entry for **Gemma 4 E2B** (needs about 8 GB of memory) or **Gemma 4 E4B** (about 16 GB). Wait for the percentage to reach 100%, then click the model to select it.
2. **Add a document.** In the **Document Library** window, click **Add to corpus** at the bottom, then **Add files**, and pick a PDF, Word file or text file.
3. **Wait for it to finish.** A progress bar shows the document being read and then "Embedding X of Y chunks". When the bar disappears, the document is ready.
4. **Ask a question.** Click in the chat box ("Type a message…"), type a question about your document, and press **Enter**.
5. **Check the source.** Under the answer you will see the passages it used. Click **Open source** (the arrow icon) to see the original page.
6. **Keep the answer.** Click **Send to notebook** (the book icon) under the answer. It is added to the bottom of the notebook page that is currently open.

> **Watch out:** step 6 adds the answer to whatever page is open in the Notebook window. If this guide is open, the answer lands at the bottom of this page. Create your own page first (see section 7).

# 2. The workspace

The main screen is made of **windows** arranged in **two columns**. A saved arrangement of windows is called a **layout**, and each layout is a tab at the top of the screen.

**The top toolbar, from left to right**

| Control | What it does |
|---|---|
| Panel icon | **Collapse left column** / **Expand left column**: hides or shows the whole left column |
| Eye icon | **Workspace windows**: lists every window; click one to open it |
| Layout tabs | One tab per saved layout; click to switch |
| **+** | **New layout**: copies the current arrangement into a new tab |
| Gear icon (far right) | **Settings** |

**The five windows**

| Window | Use it to | Default column |
|---|---|---|
| **Document Library** | Add, organize and activate documents | Left |
| **Chat History** | Reopen, rename or delete past chats | Left |
| **Assistant Chat** | Ask questions | Right |
| **Search Context** | Search your documents yourself | Right |
| **Notebook** | Write notes and keep answers | Right |

## Open (add) a window
1. Click the **Eye** icon, **Workspace windows**.
2. Click the window you want. Windows that are already open have a check mark.

## Move a window
1. Press and hold on the window's title bar (the dotted grip on the left).
2. Drag it to the other column, or above or below another window, and let go.

## Resize windows
- Drag the thin line **between two windows** to change their heights.
- Drag the vertical line **between the columns** to change their widths.

## Collapse or close (hide) a window
- **Collapse** (the up-arrow on the title bar) shrinks a window to just its title bar. Click **Expand** to bring it back.
- **Close** (the X) hides the window. Nothing inside it is lost. Reopen it from the **Eye** menu.

## Workspace (layout) tabs
Use tabs to keep different arrangements for different jobs, for example a "Reading" tab with a large Search Context window and a "Writing" tab with a large Notebook.

1. **Create:** click **+** (**New layout**). The new tab starts as a copy of the current one and is named "Layout 2", "Layout 3" and so on.
2. **Rename:** right-click the tab, choose **Rename layout**, type a name and click **Rename**.
3. **Lock:** right-click the tab and tick **Lock layout** to stop windows being dragged by accident.
4. **Reorder:** drag a tab left or right.
5. **Delete:** click the **X** on the tab. This happens straight away, without asking.

Every change you make (open windows, sizes, positions) is saved automatically to the tab you are on.

# 3. Your corpus

Your **corpus** is the set of documents the assistant can read. Everything is managed in the **Document Library** window.

## Add files
1. Click **Add to corpus** at the bottom of the Document Library.
2. Choose **Add files** and select one or more files.
3. Each file shows as **Queued**, then a progress bar while it is read and indexed.

**What you can add**

| Kind | File types | Notes |
|---|---|---|
| PDF | .pdf | Images inside the PDF are read with OCR (English) |
| Word, PowerPoint | .docx, .pptx | Converted to PDF automatically |
| Spreadsheets | .xlsx, .csv | CSV files are found by keyword search only |
| Text | .txt, .md, .markdown | |
| Audio | .mp3, .wav, .m4a, .flac, .ogg and more | Transcribed on your computer (English, up to 100 MB / 2 hours) |
| YouTube | a video link | Imports the video's captions |

> **Good to know:** standalone image files (.png, .jpg) can't be added. Adding the exact same file twice does not create a duplicate.

## Add pasted text or a YouTube video
- **Add to corpus → Add text:** give it a **Title**, paste the **Text**, and click **Embed text**.
- **Add to corpus → Add video:** paste the YouTube link and click **Import transcript**. Videos without captions can't be imported.

Both appear in the **Manually Loaded** group.

## Selecting vs. activating: the most important idea on this page
Every document has **two** separate controls:

| Control | Where | What it does |
|---|---|---|
| **Checkbox** ("Use … in chat") | Left of the document name | **Narrows** chat and search to only the ticked documents. With nothing ticked, all active documents are used. |
| **Power button** (Activate / Deactivate) | Right side of the row | An **inactive** document is never searched, even if it is ticked. It shows "· inactive". |

Use the checkbox for "only look at these for this question". Use the power button for "ignore this document until I turn it back on".

- The buttons **All / Active in RAG / Inactive** filter the list.
- **Deactivate all** turns every document off at once.
- Tick several documents to get the bulk bar with **Activate**, **Deactivate**, **Apply tag** and **Remove tag**.

## Organize: filter, sort and tag
- Type in **Filter documents by name & tags…** to narrow the list.
- **Sort** orders by name, date or number of chunks.
- **Tags:** click **Filter**, type a **New tag** and click **Add**. Then add it to documents with the small **+** under a document or with **Apply tag**.
- **Autotag** (the magic-wand icon) suggests tags from the ones you have already created, for one document or a whole group.

## Sync a folder
Syncing keeps a folder on your computer and the corpus in step.

1. **Add to corpus → Sync folder**, then choose the folder. Subfolders are included.
2. The folder gets its own group in the library and is read straight away.
3. From then on, new or edited files are picked up automatically (status **watching**), or checked every 5 minutes (status **synced**).

Folder group buttons:
- **Sync now** (circular arrows): check the folder immediately.
- **Stop watching**: stop syncing but keep the documents.
- **Remove folder and its documents**: stop syncing and delete them from the corpus.
- **Reconnect**: shown if the app lost permission to the folder.
- **Retry malformed files**: shown in red if some files failed to load.

> **Good to know:** deleting a file from the folder removes it from the corpus. Deleting a synced document inside the app makes the app ignore that file from then on.

## Remove documents
- Click the trash icon on a row to remove one document.
- **Remove all** clears the whole library. This cannot be undone.

# 4. Chatting with your documents

## Send a message
1. Type in the chat box at the bottom of **Assistant Chat**.
2. Press **Enter** to send. Press **Shift+Enter** for a new line.
3. To stop an answer early, click the square **Stop generation** button.

While it works you will see "Thinking…", "Starting tools…" or "Writing response…".

## Start a new chat and find old ones
- Click **New chat** (the speech bubble with a +) next to the chat box. The current chat is kept in history.
- Open **Chat History** to see past chats. Click one to reopen it.
- Click **⋯** on a chat to **Rename** or **Delete** it.

New chats are named automatically from your first message.

## Chat modes
Click the round icon at the bottom-left of the chat box (**Chat modes**) and tick any of:

| Mode | What it does | Default |
|---|---|---|
| **Search** | Searches your documents before every reply | On |
| **Tools** | Lets the model call tools (section 5) | Off |
| **Notebook** | Uses the open notebook instead of the corpus as context | Off |

When **Notebook** is on, **Search** is switched off, because the notebook is the context.

## Reasoning effort
The brain icon sets how hard the model thinks: **Low**, **Medium**, **High** or **Extra High**. Higher is slower but more careful.

## Reading an answer
- **Above the answer:** collapsible rows such as **Thought process** or "Searched …". Click one to see what the model did.
- **The answer** itself.
- **Below the answer:** the sources it used, each with **Open source** and **Save chunk**. Click **Show N more sources** to see them all.
- **Footer:** counts of tools and turns used, and **Send to notebook**.

# 5. Tools

Tools let the assistant do things during an answer instead of just writing text.

## Turn tools on
1. Pick a model that supports tools (if it doesn't, **Tools** is greyed out with "Not supported by this model").
2. Open **Chat modes** and tick **Tools**.
3. To choose which tools are allowed, open **Settings → Tools** and tick or untick each one.

## The tools

| Tool | What it does | Try asking |
|---|---|---|
| **Document search** | Searches your corpus as many times as it needs | "Compare what these reports say about costs." |
| **Read document chunks** | Reads the text around a passage it found | "Read the section before that quote." |
| **Corpus details** | Lists the documents in your corpus | "Which documents do I have about safety?" |
| **Python** | Runs calculations and draws charts; can read your CSV and text files | "Chart the monthly totals in sales.csv." |
| **Goal tracking** (off by default) | Keeps a checklist for long, multi-step requests | "Summarize each chapter, then write a conclusion." |
| **Date & time** | Checks today's date instead of guessing | "How many days until the deadline?" |

- Every tool call appears as a row above the answer ("Searching …", "Ran Python"). Click it to see exactly what was sent and returned.
- Charts made with Python appear as images in the reply.
- With **Goal tracking** on, a **Goals** bar appears at the top of the chat showing progress.
- **Settings → Tools → Agent turns** limits how many rounds of tool calls the model can make before answering (default 6).

# 6. Models

The **model** is the AI that writes the answers.

## Switch models
Click the model name at the bottom-right of the chat box and pick another. Models are grouped by where they come from:
- **Local models**: run inside the app, fully offline.
- **Ollama**: models you have installed with Ollama.
- **Your own providers**: online or self-hosted services you've added.

You can also switch in **Settings → Agent → Provider and model**.

## Download a local model
1. Open **Settings → Models** (or **Manage models** at the bottom of the model picker).
2. Under **Local models**, click **Download** on a model. Check the memory each one needs:
   - **Gemma 4 E2B**: about 3.1 GB download, needs about 8 GB of memory.
   - **Gemma 4 E4B**: about 5 GB download, needs about 16 GB of memory.
3. When the download finishes, click **Use this model**.

Only one download can run at a time. Click **Delete** to remove a model from disk; you can download it again later. If you have a graphics card, **Local runtime → Compute device** lets you choose it.

## Ollama models
The app lists models already installed in Ollama. To get a new one, install it with Ollama itself (for example `ollama pull <model>`); it then appears in the picker.

## Add an online or self-hosted provider
1. **Settings → Models → Add provider → OpenAI-compatible**.
2. Enter a **Name**, the **Base URL** (including `/v1`), and an **API key** if the service needs one.
3. Click **Add provider**. Its models appear in the model picker.

## Profiles
A **profile** (**Settings → Agent → Profile**) saves your model, prompt, generation and retrieval choices together. Create one per task, for example "Quick answers" and "Deep research", and switch between them.

# 7. The notebook

The notebook is where you write notes and keep answers. It is organized as **notebooks → pages**.

## Find your way around
- The **Notebook** window opens on a page. Use the back arrow (**Back to pages**, then **Back to notebooks**) to move up a level.
- Use **Search notebooks...** or **Search pages...** to find text across everything.

## Create notebooks and pages
1. Go to the notebooks list or a notebook's page list.
2. Click **+** (**Create notebook** or **Create page**), type a title and click **Save**.

A new notebook starts with an empty "Page 1".

## Write and format
Just type; the page is in Markdown and is formatted as you write. **There is no save button: everything saves automatically.** The toolbar above the page offers:

| Button | Does |
|---|---|
| **Bold** (Ctrl+B), **Italic** (Ctrl+I), **Strikethrough** | Text style |
| **Text color**, **Highlight** | Color the selected text |
| **Heading 1–3** | Section titles |
| **Bulleted list**, **Numbered list**, **Quote** | Structure |
| **Inline code**, **Code block** | Code |
| **Link** | Insert a link |

- **Find in page** (Ctrl+F) searches the current page.
- The counter at the bottom shows how much space is left. A notebook can hold **60,000 characters across all its pages**.

## Organize
Click **⋯** next to a notebook or page for:
- **Rename** (you can also click the title at the top)
- **Move to notebook** (pages only)
- **Export as ZIP** (notebook) or **Export as Markdown** (page)
- **Delete**

Drag the grip next to an item to reorder it. To bring files in, use **Import Markdown or text file** (adds pages) or **Import notebook from folder** (creates a notebook).

## Send chat answers to the notebook
1. Open the page you want the answer on.
2. In the chat, click **Send to notebook** under the answer.
3. The answer is added to the **bottom of the open page**, and its sources are attached to the notebook as **Loaded sources**.

You can do the same with a passage in **Search Context**: click **Send to notebook** on a result card. **Save chunk** attaches a source without adding any text.

## Add citations
1. While editing a page, click **View loaded sources** (the files icon with a number).
2. Put your cursor where the citation should go.
3. Click **Insert citation** on a source. A link like *(Report title, p. 4)* is added.
4. To list every source at the end of the page, click **Insert citations table**. It adds or updates a "Citations" table.

Click a citation link to open that page of the original document. **Open document** in the sources panel does the same. **Clear all** removes the attached sources but keeps your text.

> **Good to know:** links inside a table can't be clicked. Click the table to see its text, or use the sources panel instead.

## Chat about your notebook
Turn on **Chat modes → Notebook**. The assistant then reads **every page of the open notebook** plus its loaded sources, which is good for "Tidy up my notes" or "What's missing from this outline?".

## Put a notebook page into your corpus
There is no one-click button yet. Either:
- **⋯ → Export as Markdown**, then **Document Library → Add to corpus → Add files** and pick the exported file, or
- copy the page text and use **Add to corpus → Add text**.

# 8. Search and retrieval

## How the assistant finds information
When a document is added it is cut into short passages called **chunks** (up to about 1,200 characters each). When you ask a question, the app finds the most relevant chunks and gives only those to the model. This is called **retrieval**.

## The three retrieval methods

| Method | How it works | Best for |
|---|---|---|
| **Lexical** | Matches the exact words you typed (keyword search) | Names, codes, part numbers, exact phrases |
| **Semantic** | Matches meaning, even when the wording is different | Questions in your own words, concepts |
| **Hybrid** (default) | Runs both, then a second model re-ranks the combined results by how well each passage answers the question | Almost everything; the best starting point |

> **Good to know:** CSV files are only found by Lexical search, or the keyword half of Hybrid.

## Set retrieval options
1. Open **Settings → Agent → Retrieval**.
2. Choose **Semantic**, **Lexical** or **Hybrid**.
3. Set **Retrieved chunks**, the number of passages given to the model (default 5, up to 20 in chat).

More chunks give the model more to work with but can add noise and slow down small local models. Start with 5; try 8–10 for broad questions.

These settings are saved in the current **profile**.

## What else affects retrieval
- **Selection and activation** (section 3): only active documents are searched, and only ticked ones if any are ticked.
- **Chat modes → Search** searches once before every reply.
- With **Tools** on, the model can run its own searches, choose the method, and read neighbouring passages.

## Search your documents yourself
The **Search Context** window shows exactly what retrieval finds.
1. Type in **Enter search text…**.
2. Optionally change the number next to it (how many results).
3. Click **Search** or press Enter.
4. Switch between **Semantic**, **Lexical** and **Hybrid** to compare results instantly; there is no need to search again.

Each result shows its rank, document, page and full text, with **Save chunk**, **Send to notebook** and **Open document**. Changes here don't alter your settings.

# 9. Viewing the original source

You can always check what an answer is based on. Click **Open source** under a chat answer, **Open document** on a search result, or a document's name in the Document Library.

| Source type | What opens |
|---|---|
| PDF, Word, PowerPoint, Excel | The document, opened at the cited page |
| Text, Markdown, CSV | The file, with the cited passage highlighted and scrolled into view |
| Audio | A transcript player. Click any passage to play from that moment; change speed with **Playback speed** |
| YouTube | The transcript. Click a passage to open the video at that moment, or **Watch on YouTube** |

# 10. Troubleshooting and glossary

| Problem | Try this |
|---|---|
| A window is missing | **Eye** menu → click it |
| The answer ignores my document | Check the document is active (power button) and, if any boxes are ticked, that it is ticked |
| **Tools** is greyed out | Pick a model that supports tools |
| A file failed to load | Check the type is supported; for synced folders, click **Retry malformed files** |
| Answers are slow | Use a smaller model, lower **Retrieved chunks**, or set **Reasoning effort** to Low |
| "Engine disconnected" banner | Wait a moment; the app reconnects automatically |
| Folder sync isn't available | It needs the desktop app, Chrome or Edge |

**Glossary**
- **Corpus:** all the documents the assistant can search.
- **Chunk:** a short passage of a document; the unit that search finds.
- **Embedding:** a numeric fingerprint of a chunk's meaning, used by Semantic search. The embedding model downloads automatically the first time you start the app.
- **Retrieval:** finding the chunks that answer a question.
- **Profile:** a saved set of model, prompt and retrieval choices.
- **Layout:** a saved window arrangement, shown as a tab.
- **Loaded sources:** chunks attached to a notebook, used for citations.

> **You're ready.** Create your own notebook with **+** and start your first project. You can come back to this page at any time.
