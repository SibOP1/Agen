const LOG_KEY = 'agen_debug_log_v1';
const MAX_ENTRIES = 900;

let entries = [];
let installed = false;
let originalConsole = null;

function readStoredEntries() {
    try {
        const parsed = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.slice(-MAX_ENTRIES) : [];
    } catch {
        return [];
    }
}

function writeStoredEntries() {
    try {
        localStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
    } catch {
        // Keep the in-memory log if storage is blocked or full.
    }
}

function normalize(value, depth = 0, seen = new WeakSet()) {
    if (value === null || typeof value === 'undefined') return value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            stack: value.stack,
            type: value.type
        };
    }
    if (depth > 3) return '[MaxDepth]';
    if (typeof value !== 'object') return String(value);
    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    if (Array.isArray(value)) {
        return value.slice(0, 30).map(item => normalize(item, depth + 1, seen));
    }

    const out = {};
    Object.keys(value).slice(0, 40).forEach(key => {
        if (key.toLowerCase().includes('credential') || key.toLowerCase().includes('password')) {
            out[key] = '[redacted]';
            return;
        }
        out[key] = normalize(value[key], depth + 1, seen);
    });
    return out;
}

function emit(level, scope, message, data = undefined) {
    const entry = {
        at: new Date().toISOString(),
        elapsedMs: Math.round(performance.now()),
        level,
        scope,
        message,
        data: normalize(data)
    };
    entries.push(entry);
    entries = entries.slice(-MAX_ENTRIES);
    writeStoredEntries();

    const logger = originalConsole?.[level] || originalConsole?.log || console.log;
    if (logger) logger.call(console, `[AGEN:${scope}] ${message}`, entry.data ?? '');
    return entry;
}

function makeReport() {
    const header = {
        generatedAt: new Date().toISOString(),
        href: location.href,
        origin: location.origin,
        protocol: location.protocol,
        secureContext: window.isSecureContext,
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        online: navigator.onLine,
        entries: entries.length
    };

    return [
        'AGEN DEBUG LOG',
        JSON.stringify(header, null, 2),
        '',
        ...entries.map(entry => JSON.stringify(entry))
    ].join('\n');
}

function download() {
    const blob = new Blob([makeReport()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.href = url;
    link.download = `agen-debug-${stamp}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function copy() {
    const report = makeReport();
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(report);
        return report.length;
    }
    throw new Error('Clipboard API is unavailable.');
}

function clear() {
    entries = [];
    writeStoredEntries();
    emit('info', 'Debug', 'Log cleared');
}

export const debugLogger = {
    info: (scope, message, data) => emit('info', scope, message, data),
    warn: (scope, message, data) => emit('warn', scope, message, data),
    error: (scope, message, data) => emit('error', scope, message, data),
    dump: makeReport,
    download,
    copy,
    clear,
    get entries() {
        return entries.slice();
    }
};

export function installGlobalDiagnostics() {
    if (installed) return;
    installed = true;
    entries = readStoredEntries();
    originalConsole = {
        log: console.log.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console)
    };

    console.warn = (...args) => {
        emit('warn', 'Console', args.map(String).join(' '), args);
    };
    console.error = (...args) => {
        emit('error', 'Console', args.map(String).join(' '), args);
    };

    window.addEventListener('error', event => {
        emit('error', 'Window', event.message || 'Unhandled window error', {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            error: event.error
        });
    });
    window.addEventListener('unhandledrejection', event => {
        emit('error', 'Window', 'Unhandled promise rejection', event.reason);
    });
    window.addEventListener('online', () => emit('info', 'Network', 'Browser went online'));
    window.addEventListener('offline', () => emit('warn', 'Network', 'Browser went offline'));

    window.AGEN_DEBUG = debugLogger;
    emit('info', 'Debug', 'Diagnostics installed', {
        href: location.href,
        secureContext: window.isSecureContext,
        online: navigator.onLine,
        userAgent: navigator.userAgent
    });
}
