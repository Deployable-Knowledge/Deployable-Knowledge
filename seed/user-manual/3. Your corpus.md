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
