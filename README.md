# Agen Browser FPS

Free online play is built around PeerJS/WebRTC. The app only needs to be hosted at a public HTTPS URL; the actual match traffic is peer-to-peer, with public STUN/TURN fallbacks for players on different networks.

## Play With Friends Online

1. Push this repo to GitHub.
2. In GitHub, open `Settings -> Pages` and set the source to `GitHub Actions`.
3. Push to the `master` branch, or run the `Deploy to GitHub Pages` workflow manually.
4. Open the deployed Pages URL, choose `PC` or `Mobile`, then copy the lobby link.
5. Send that link to friends anywhere in the world. Keep the host tab open while everyone joins.

## Local Testing

Run the dev server:

```sh
npm install
npm run dev
```

Local links such as `localhost` and `192.168.x.x` only work for you or your LAN. For global play, use the deployed GitHub Pages link or a public HTTPS tunnel URL.

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

## Optional Relay Settings

The default PeerJS cloud and bundled STUN/TURN config are free defaults. If your region or network blocks the PeerJS cloud, point the client at another PeerJS-compatible signaling server:

```sh
VITE_PEER_SERVER={"host":"your-peer-server.example.com","port":443,"path":"/","secure":true}
```

If you have your own TURN credentials, you can replace the ICE list:

```sh
VITE_ICE_SERVERS=[{"urls":"turn:turn.example.com:3478","username":"user","credential":"pass"}]
```

## Debug Logs

The lobby has `Copy Debug` and `Download Debug` buttons. Use them after a failed join attempt and share the generated `agen-debug-*.txt` file.

The log includes PeerJS setup, join flow, connection open/close/error events, ICE state changes, mesh routing, host relay fallback, browser online/offline status, console errors, and global JavaScript errors.

For cross-network joins, the client first tries normal WebRTC ICE. If that fails before the host data channel opens, it automatically retries in TURN relay-only mode. You can force that path manually by adding `&relay=1` to an invite URL.

You can also use DevTools:

```js
AGEN_DEBUG.download()
AGEN_DEBUG.copy()
AGEN_DEBUG.clear()
```
