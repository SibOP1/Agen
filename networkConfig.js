export const DEFAULT_ICE_SERVERS = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:openrelay.metered.ca:80'] },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:80?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
];

export function getStoredValue(key) {
    try {
        const storage = typeof window !== 'undefined' ? window.localStorage : null;
        return storage?.getItem(key) || null;
    } catch {
        return null;
    }
}

export function parseConfigObject(source, label = 'JSON') {
    if (!source) return null;
    if (typeof source === 'object') return source;
    try {
        const parsed = JSON.parse(source);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        console.warn(`Invalid ${label} configuration ignored.`);
        return null;
    }
}

export function getIceServers() {
    const sources = [
        globalThis.AGEN_ICE_SERVERS,
        import.meta.env?.VITE_ICE_SERVERS,
        getStoredValue('agen_ice_servers')
    ];

    for (const source of sources) {
        if (!source) continue;
        if (Array.isArray(source)) return source;
        try {
            const parsed = JSON.parse(source);
            if (Array.isArray(parsed)) return parsed;
        } catch {
            console.warn('Invalid ICE server configuration ignored.');
        }
    }

    return DEFAULT_ICE_SERVERS;
}

export function getPeerServerOptions() {
    const serverConfig = parseConfigObject(
        globalThis.AGEN_PEER_SERVER || import.meta.env?.VITE_PEER_SERVER || getStoredValue('agen_peer_server'),
        'PeerJS server'
    );
    const options = serverConfig ? { ...serverConfig } : {};

    const host = import.meta.env?.VITE_PEER_HOST || getStoredValue('agen_peer_host');
    const port = import.meta.env?.VITE_PEER_PORT || getStoredValue('agen_peer_port');
    const path = import.meta.env?.VITE_PEER_PATH || getStoredValue('agen_peer_path');
    const secure = import.meta.env?.VITE_PEER_SECURE || getStoredValue('agen_peer_secure');

    if (host) options.host = host;
    if (port) options.port = Number(port);
    if (path) options.path = path;
    if (secure) options.secure = String(secure).toLowerCase() !== 'false';

    return options;
}

export function getPeerOptions({ relayOnly = false } = {}) {
    const peerServerOptions = getPeerServerOptions();
    const peerConfig = peerServerOptions.config || {};
    delete peerServerOptions.config;

    return {
        ...peerServerOptions,
        debug: 1,
        config: {
            iceServers: getIceServers(),
            sdpSemantics: 'unified-plan',
            ...(relayOnly ? { iceTransportPolicy: 'relay' } : {}),
            ...peerConfig
        }
    };
}
