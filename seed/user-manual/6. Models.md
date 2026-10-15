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

## Ollama models (optional)
> **Only relevant if you already use Ollama.** If you don't know what Ollama is, skip this section: the **Local models** above do the same job without installing anything else.

Ollama is a separate, free program that runs AI models on your computer. Deployable Knowledge can use the models it has installed, but **Ollama must be installed and running on the same computer** for them to appear.

1. Install Ollama from [ollama.com/download](https://ollama.com/download) and start it.
2. Download a model in a terminal, for example `ollama pull gemma4:e4b`.
3. Open the model picker in **Assistant Chat**. The model appears in the **Ollama** group. If there is no Ollama group, Ollama isn't running or has no models yet.

Good to know:
- Ollama models run on your computer and work offline once downloaded. Models with `cloud` in their name are the exception: they run on Ollama's servers and need an internet connection.
- New models are always downloaded through Ollama itself; the app can't download them for you.
- Close Ollama and its models disappear from the picker until you start it again.
- If a model can't use tools, **Tools** is greyed out in **Chat modes**.

## Add an online or self-hosted provider
1. **Settings → Models → Add provider → OpenAI-compatible**.
2. Enter a **Name**, the **Base URL** (including `/v1`), and an **API key** if the service needs one.
3. Click **Add provider**. Its models appear in the model picker.

## Profiles
A **profile** (**Settings → Agent → Profile**) saves your model, prompt, generation and retrieval choices together. Create one per task, for example "Quick answers" and "Deep research", and switch between them.
