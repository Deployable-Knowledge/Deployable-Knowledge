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
- **Selection and activation** (see **3. Your corpus**): only active documents are searched, and only ticked ones if any are ticked.
- **Chat modes → Search** searches once before every reply.
- With **Tools** on, the model can run its own searches, choose the method, and read neighbouring passages.

## Search your documents yourself
The **Search Context** window shows exactly what retrieval finds.
1. Type in **Enter search text…**.
2. Optionally change the number next to it (how many results).
3. Click **Search** or press Enter.
4. Switch between **Semantic**, **Lexical** and **Hybrid** to compare results instantly; there is no need to search again.

Each result shows its rank, document, page and full text, with **Save chunk**, **Send to notebook** and **Open document**. Changes here don't alter your settings.
