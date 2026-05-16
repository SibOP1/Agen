export const DEFAULT_WS_URL = 'wss://agen-multiplayer.onrender.com';

export function getStoredValue(key) {
    try {
        const storage = typeof window !== 'undefined' ? window.localStorage : null;
        return storage?.getItem(key) || null;
    } catch {
        return null;
    }
}

export function getWebSocketUrl() {
    const configured = globalThis.AGEN_WS_URL ||
        import.meta.env?.VITE_WS_URL ||
        getStoredValue('agen_ws_url');
    if (configured) return String(configured).replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');

    if (typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname)) {
        return 'ws://localhost:8787';
    }

    return DEFAULT_WS_URL;
}
