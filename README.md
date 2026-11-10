# Verity Room Notes

Verity Room Notes is a browser dashboard for live fact-checking with ElevenLabs. Checks arrive at the top of the feed with a speaker, verdict, explanation, and source links. While you read an earlier card, the feed preserves your position and **New checks** jumps back to the latest card.

Open the [live dashboard](https://verity.pokegodalden66.chatgpt.site/) and select **Watch demo** for a short walkthrough.

## Run locally

Use Node.js 24 and npm. From this folder, run the following commands and open the local URL Vite prints.

```sh
npm ci
npm run dev
```

Dismiss the Welcome Guide, select **Turn on mic**, allow microphone access, and wait for **Mic on**. After the greeting, say “The capital city of France is Paris.” Wait for the fact-check card, then select **Turn off mic**. Verity’s current ElevenLabs settings record voice during sessions.

**Turn off mic** can also cancel an in-progress connection. If the connection drops, the feed stays visible until you start a new session.

## Build

```sh
npm run build
npm run preview
```

The build writes the site to `dist/`. The microphone works on localhost or an HTTPS origin. This prototype uses the configured Verity agent ID and its current unauthenticated browser connection.
