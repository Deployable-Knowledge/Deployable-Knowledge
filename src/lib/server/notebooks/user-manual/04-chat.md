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
| **Tools** | Lets the model call tools (see **5. Tools**) | Off |
| **Notebook** | Uses the open notebook instead of the corpus as context | Off |

When **Notebook** is on, **Search** is switched off because the model will exclusively refer to the notebook instead of the loaded documents.

## Reasoning effort
The brain icon sets how hard the model thinks: **Low**, **Medium**, **High** or **Extra High**. Higher is slower but more careful.

## Reading an answer
- **Above the answer:** collapsible rows such as **Thought process** or "Searched …". Click one to see what the model did.
- **The answer** itself.
- **Below the answer:** the sources it used, each with **Open source** and **Save chunk**. Click **Show N more sources** to see them all.
- **Footer:** counts of tools and turns used, and **Send to notebook**.
