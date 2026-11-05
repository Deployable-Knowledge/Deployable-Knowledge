# Documents and search

## Adding a document

1. The app saves its own copy in `documents/`. Your original file is never touched, and adding
   the same file twice doesn't make a duplicate.
2. It pulls out the text:

   | Type             | How                                              |
   | ---------------- | ------------------------------------------------ |
   | PDF              | Text layer, plus OCR for images and scans        |
   | Word, PowerPoint | Converted to PDF first                           |
   | Excel, CSV       | Cell and row data                                |
   | Text, Markdown   | Read as-is                                       |
   | Audio            | Transcribed on your machine, with speaker labels |
   | YouTube          | The video's captions                             |

3. It cuts the text into **chunks** of about 1,200 characters. Each chunk remembers its page,
   sheet or timestamp, which is how answers link back to the exact spot.
4. Chunks go into a keyword index and get an **embedding** for meaning search. CSV files are
   keyword-only.

## Searching

Only **active** documents are searched.

| Method       | Finds                                | Good for                        |
| ------------ | ------------------------------------ | ------------------------------- |
| **Lexical**  | Chunks with the same words (BM25)    | Names, codes, exact phrases     |
| **Semantic** | Chunks with the same meaning         | Questions in your own words     |
| **Hybrid**   | Both, then a reranker picks the best | Almost everything (the default) |

The code is in `src/lib/server/documents/` (adding files) and `src/lib/server/rag/` (chunking,
embeddings and search).

<img width="2600" height="1600" alt="semantic-search-pipeline" src="https://github.com/user-attachments/assets/c90fe6bf-6a69-41c1-b828-0f503f4c7a81" />
<img width="2600" height="1600" alt="bm25-search-pipeline" src="https://github.com/user-attachments/assets/d1c87729-a392-454e-9478-ae4e9f3f7cae" />
<img width="2600" height="1600" alt="hybrid-search-pipeline" src="https://github.com/user-attachments/assets/6c46792c-637b-4253-801e-57c75ec5797a" />

Return to [docs](README.md).
