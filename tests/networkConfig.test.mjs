import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_WS_URL, getWebSocketUrl } from '../networkConfig.js';

function withBrowserEnv({ storage = {}, hostname = 'example.com' }, fn) {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
            localStorage: {
                getItem(key) {
                    return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
                }
            }
        }
    });
    Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: { hostname }
    });
    try {
        return fn();
    } finally {
        if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
        else delete globalThis.window;
        if (previousLocation) Object.defineProperty(globalThis, 'location', previousLocation);
        else delete globalThis.location;
    }
}

test('websocket url can be configured from localStorage', () => {
    withBrowserEnv({ storage: { agen_ws_url: 'https://example.test/relay' } }, () => {
        assert.equal(getWebSocketUrl(), 'wss://example.test/relay');
    });
});

test('websocket url defaults to local server on localhost', () => {
    withBrowserEnv({ hostname: 'localhost' }, () => {
        assert.equal(getWebSocketUrl(), 'ws://localhost:8787');
    });
});

test('websocket url defaults to Render service in production', () => {
    withBrowserEnv({ hostname: 'sibop1.github.io' }, () => {
        assert.equal(getWebSocketUrl(), DEFAULT_WS_URL);
    });
});
