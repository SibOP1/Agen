# Agen Browser FPS

Free online play is built around a small WebSocket room server. The frontend can stay on GitHub Pages, while the realtime relay runs on Render.

## Play With Friends Online

1. Push this repo to GitHub.
2. In GitHub, open `Settings -> Pages` and set the source to `GitHub Actions`.
3. Push to the `master` branch, or run the `Deploy to GitHub Pages` workflow manually.
4. Open the deployed Pages URL, choose `PC` or `Mobile`, then copy the lobby link.
5. Send that link to friends anywhere in the world. Keep the host tab open while everyone joins.

## Render Game Server

This repo includes `render.yaml` for a free Render web service named `agen-multiplayer`.

1. Push this repo to GitHub.
2. In Render, create a new Blueprint from this repo.
3. Render will start `npm run server` and expose the WebSocket relay.
4. Set the frontend config to the Render URL:

```sh
VITE_WS_URL=wss://agen-multiplayer.onrender.com
```

If you need a local browser override:

```js
localStorage.setItem('agen_ws_url', 'wss://agen-multiplayer.onrender.com');
location.reload();
```

For API/CLI setup, copy `.env.render.example` to `.env.render` and fill in `RENDER_API_KEY`. Do not commit the filled file.

## Local Testing

Run the dev server:

```sh
npm install
npm run server
npm run dev
```

The local frontend uses `ws://localhost:8787` automatically.

Local links such as `localhost` and `192.168.x.x` only work for you or your LAN. For global play, use the deployed GitHub Pages link with the Render WebSocket server online.

## Public URL Override

If you host somewhere other than the current page URL, set:

```sh
VITE_PUBLIC_URL=https://example.com/agen/
```

For a one-off browser override, open DevTools on the host page and run:

```js
localStorage.setItem('agen_public_url', 'https://example.com/agen/');
location.reload();
```

## WebSocket Server Override

If your Render service uses a different name, set:

```sh
VITE_WS_URL=wss://your-render-service.onrender.com
```

The browser also supports `localStorage.agen_ws_url` for quick testing.

## Debug Logs

The lobby has `Copy Debug` and `Download Debug` buttons. Use them after a failed join attempt and share the generated `agen-debug-*.txt` file.

The log includes WebSocket server setup, join flow, room/player-list events, message routing, browser online/offline status, console errors, and global JavaScript errors.

You can also use DevTools:

```js
AGEN_DEBUG.download()
AGEN_DEBUG.copy()
AGEN_DEBUG.clear()
```
