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
| **Python** | Runs calculations and draws charts using Python libraries; can read your CSV and text files | "Chart the monthly totals in sales.csv." |
| **Goal tracking** (off by default) | Keeps a checklist for long, multi-step requests | "Summarize each chapter, then write a conclusion." |
| **Date & time** | Checks today's date instead of guessing | "How many days until the deadline?" |

- Every tool call appears as a row above the answer ("Searching …", "Ran Python"). Click it to see exactly what was sent and returned.
- Charts made with Python appear as images in the reply.
- With **Goal tracking** on, a **Goals** bar appears at the top of the chat showing progress.
- **Settings → Tools → Agent turns** limits how many rounds of tool calls the model can make before answering (default 6).
