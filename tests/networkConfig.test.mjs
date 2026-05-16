import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_ICE_SERVERS,
    getIceServers,
    getPeerOptions,
    parseConfigObject
} from '../networkConfig.js';

function withLocalStorage(values, fn) {
    const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window');
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
            localStorage: {
                getItem(key) {
                    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
                }
            }
        }
    });
    try {
        return fn();
    } finally {
        if (hadWindow && previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
        else delete globalThis.window;
    }
}

test('default ICE servers include TCP and TLS TURN fallbacks', () => {
    const urls = DEFAULT_ICE_SERVERS.flatMap(server => Array.isArray(server.urls) ? server.urls : [server.urls]);

    assert.ok(urls.includes('turn:openrelay.metered.ca:80?transport=tcp'));
    assert.ok(urls.includes('turn:openrelay.metered.ca:443?transport=tcp'));
    assert.ok(urls.includes('turns:openrelay.metered.ca:443?transport=tcp'));
});

test('relay-only peer options force TURN relay transport', () => {
    const options = getPeerOptions({ relayOnly: true });

    assert.equal(options.config.iceTransportPolicy, 'relay');
    assert.ok(Array.isArray(options.config.iceServers));
});

test('normal peer options do not force relay transport', () => {
    const options = getPeerOptions();

    assert.equal(options.config.iceTransportPolicy, undefined);
});

test('localStorage ICE override is parsed when provided', () => {
    const override = [{ urls: 'stun:example.test:3478' }];

    withLocalStorage({ agen_ice_servers: JSON.stringify(override) }, () => {
        assert.deepEqual(getIceServers(), override);
    });
});

test('invalid JSON config returns null instead of throwing', () => {
    const previousWarn = console.warn;
    console.warn = () => {};
    try {
        assert.equal(parseConfigObject('{nope', 'test'), null);
    } finally {
        console.warn = previousWarn;
    }
});
