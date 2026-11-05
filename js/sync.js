/* Optional encrypted configuration sync. Loading this file never contacts a server. */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.EVSync = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';
    const STORAGE_KEY = 'evportal.sync.v1';
    const LOGOUT_KEY = STORAGE_KEY + '.logout';
    const MAX_SNAPSHOT_BYTES = 700 * 1024;
    const CODE = /^EV1\.([A-Za-z0-9_-]{43})$/;
    const encoder = new TextEncoder();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    function failure(code) { const error = new Error(code); error.code = code; return error; }
    function encode(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
        return root.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function decode(value) {
        if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw failure('INVALID_CODE');
        const binary = root.atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
        const bytes = Uint8Array.from(binary, function (character) { return character.charCodeAt(0); });
        if (encode(bytes) !== value) throw failure('INVALID_CODE');
        return bytes;
    }
    function endpointURL(value) {
        if (!value) return '';
        let url;
        try { url = new URL(value); } catch (_) { throw failure('INVALID_ENDPOINT'); }
        if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) throw failure('INVALID_ENDPOINT');
        return url.href.replace(/\/$/, '');
    }
    function createClient(options) {
        options = options || {};
        const endpoint = endpointURL(options.endpoint);
        const webcrypto = options.crypto || root.crypto;
        const fetcher = options.fetch || (root.fetch && root.fetch.bind(root));
        let storage = options.storage;
        if (storage === undefined) { try { storage = root.localStorage; } catch (_) { storage = null; } }
        let identity = null;
        let revision = 0;
        let remembered = false;
        let storageWarning = false;
        let busy = false;
        let savedRecord = null;
        let generation = 0;
        let operationSequence = 0;
        let runningOperation = 0;
        let closed = false;
        let logoutVersion = null;
        const requests = new Set();
        try {
            const value = storage && storage.getItem(STORAGE_KEY);
            logoutVersion = storage && storage.getItem(LOGOUT_KEY);
            if (value) {
                const record = JSON.parse(value);
                if (record.version === 1 && record.endpoint === endpoint && CODE.test(record.recoveryCode) && Number.isSafeInteger(record.revision) && record.revision >= 1) savedRecord = record;
            }
        } catch (_) { /* A blocked/corrupt local record never authorizes a request. */ }
        function status() { return { connected: Boolean(identity || savedRecord), revision: revision || (savedRecord && savedRecord.revision) || 0, remembered: remembered || Boolean(savedRecord), available: Boolean(!closed && endpoint && fetcher && webcrypto && webcrypto.subtle), busy: busy, storageWarning: storageWarning }; }
        function report(event) { if (typeof options.onStatus === 'function') { try { options.onStatus(Object.assign(status(), { event: event })); } catch (_) { /* UI callbacks cannot change protocol outcomes. */ } } }
        function forget(event) {
            generation += 1;
            identity = null; savedRecord = null; revision = 0; remembered = false;
            busy = false; runningOperation = 0;
            requests.forEach(function (controller) { controller.abort(); });
            if (event) report(event);
        }
        function current(epoch) {
            if (storage) {
                try {
                    const latest = storage.getItem(LOGOUT_KEY);
                    if (latest !== logoutVersion) { logoutVersion = latest; forget('FORGOTTEN'); }
                } catch (_) { /* A blocked browser is reported if remembering or forgetting fails. */ }
            }
            if (closed || epoch !== generation) throw failure('SESSION_CHANGED');
        }
        function storageChanged(event) {
            if (!storage || event.storageArea !== storage || ![null, STORAGE_KEY, LOGOUT_KEY].includes(event.key)) return;
            if (event.key === null || event.key === LOGOUT_KEY) {
                try { logoutVersion = storage.getItem(LOGOUT_KEY); } catch (_) { logoutVersion = event.newValue; }
                forget('FORGOTTEN');
                return;
            }
            const code = identity ? identity.code : savedRecord && savedRecord.recoveryCode;
            if (event.newValue && code) {
                try {
                    const record = JSON.parse(event.newValue);
                    // A sibling save of the same identity must not advance this
                    // tab's base revision: its unmerged edits still need CAS.
                    if (record.endpoint === endpoint && record.recoveryCode === code) return;
                } catch (_) { /* A removed, replaced or malformed identity is forgotten. */ }
            }
            forget('FORGOTTEN');
        }
        if (storage && root.addEventListener) root.addEventListener('storage', storageChanged);
        function notifyLogout() {
            if (!storage) return true;
            try {
                const next = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
                storage.setItem(LOGOUT_KEY, next);
                logoutVersion = next;
                return true;
            } catch (_) { storageWarning = true; report('STORAGE_UNAVAILABLE'); return false; }
        }
        async function derive(code) {
            if (!CODE.test(code)) throw failure('INVALID_CODE');
            const secret = decode(code.slice(4));
            if (secret.length !== 32) throw failure('INVALID_CODE');
            async function digest(label) {
                const prefix = encoder.encode('EvPortal-sync-v1:' + label + ':');
                const input = new Uint8Array(prefix.length + secret.length);
                input.set(prefix); input.set(secret, prefix.length);
                return new Uint8Array(await webcrypto.subtle.digest('SHA-256', input));
            }
            const id = encode((await digest('id')).subarray(0, 16));
            const token = encode(await digest('auth'));
            const key = await webcrypto.subtle.importKey('raw', await digest('encryption'), 'AES-GCM', false, ['encrypt', 'decrypt']);
            return { id: id, token: token, key: key, code: code };
        }
        async function active(epoch) {
            if (!identity && savedRecord) {
                const record = savedRecord;
                const credentials = await derive(record.recoveryCode);
                current(epoch);
                identity = credentials; revision = record.revision; remembered = true;
            }
            current(epoch);
            if (!identity) throw failure('NOT_CONNECTED');
            return identity;
        }
        function persist(remember, epoch) {
            if (epoch !== undefined) current(epoch);
            if (remember !== undefined) remembered = Boolean(remember);
            savedRecord = null;
            storageWarning = false;
            if (!storage) { if (remembered) { storageWarning = true; report('STORAGE_UNAVAILABLE'); } remembered = false; return true; }
            try {
                if (remembered && identity) storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, endpoint: endpoint, recoveryCode: identity.code, revision: revision }));
                else storage.removeItem(STORAGE_KEY);
                return true;
            } catch (_) { remembered = false; storageWarning = true; report('STORAGE_UNAVAILABLE'); return false; }
        }
        async function request(path, method, data, credentials) {
            let response;
            const controller = new AbortController();
            requests.add(controller);
            const timeout = root.setTimeout(function () { controller.abort(); }, 15000);
            try {
                response = await fetcher(endpoint + path, { method: method, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
                    signal: controller.signal,
                    headers: Object.assign({ Authorization: 'Bearer ' + credentials.token }, data === undefined ? {} : { 'Content-Type': 'application/json' }),
                    body: data === undefined ? undefined : JSON.stringify(data) });
            } catch (_) { root.clearTimeout(timeout); requests.delete(controller); throw failure('NETWORK'); }
            let result;
            try {
                if (response.status !== 204) {
                    const raw = await response.text();
                    if (encoder.encode(raw).length > 1024 * 1024) throw failure('INVALID_RESPONSE');
                    try { result = JSON.parse(raw); } catch (_) { throw failure('INVALID_RESPONSE'); }
                }
            } catch (error) { if (error.code === 'INVALID_RESPONSE') throw error; throw failure('NETWORK'); }
            finally { root.clearTimeout(timeout); requests.delete(controller); }
            if (!response.ok) {
                const error = failure(({ 401: 'UNAUTHORIZED', 403: 'ORIGIN_DENIED', 404: 'NOT_FOUND', 409: 'CONFLICT', 413: 'TOO_LARGE', 429: 'RATE_LIMITED' })[response.status] || 'SERVER');
                if (error.code === 'CONFLICT' && result && Number.isSafeInteger(result.revision)) error.remoteRevision = result.revision;
                throw error;
            }
            return result;
        }
        async function encrypted(snapshot, credentials) {
            if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw failure('INVALID_SNAPSHOT');
            const bytes = encoder.encode(JSON.stringify({ version: 1, snapshot: snapshot }));
            if (bytes.length > MAX_SNAPSHOT_BYTES) throw failure('TOO_LARGE');
            const iv = webcrypto.getRandomValues(new Uint8Array(12));
            const ciphertext = new Uint8Array(await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: encoder.encode('EvPortal-sync-v1:' + credentials.id) }, credentials.key, bytes));
            return { version: 1, iv: encode(iv), ciphertext: encode(ciphertext) };
        }
        function metadata(result) {
            if (!result || !Number.isSafeInteger(result.revision) || result.revision < 1 || !Number.isSafeInteger(result.updatedAt) || result.updatedAt < 0) throw failure('INVALID_RESPONSE');
            return { revision: result.revision, updatedAt: result.updatedAt };
        }
        async function decrypted(result, credentials) {
            const info = metadata(result);
            try {
                const envelope = result.envelope;
                if (!envelope || envelope.version !== 1) throw new Error();
                const iv = decode(envelope.iv);
                if (iv.length !== 12) throw new Error();
                const plaintext = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: iv, additionalData: encoder.encode('EvPortal-sync-v1:' + credentials.id) }, credentials.key, decode(envelope.ciphertext));
                if (plaintext.byteLength > MAX_SNAPSHOT_BYTES) throw new Error();
                const data = JSON.parse(decoder.decode(plaintext));
                if (!data || data.version !== 1 || !Object.prototype.hasOwnProperty.call(data, 'snapshot')) throw new Error();
                return Object.assign(info, { snapshot: data.snapshot });
            } catch (_) { throw failure('DECRYPT_FAILED'); }
        }
        async function operation(callback) {
            if (!status().available) throw failure('UNAVAILABLE');
            if (busy) throw failure('BUSY');
            const epoch = generation;
            const operationID = ++operationSequence;
            runningOperation = operationID;
            busy = true; report('WORKING');
            try { current(epoch); const result = await callback(epoch); current(epoch); report('SUCCESS'); return result; }
            catch (error) {
                if (epoch !== generation || closed) throw failure('SESSION_CHANGED');
                report(error.code || 'ERROR'); throw error;
            }
            finally { if (runningOperation === operationID) { runningOperation = 0; busy = false; report('IDLE'); } }
        }
        function disconnect() {
            forget();
            const removed = persist(false);
            const notified = notifyLogout();
            if (!removed || !notified) throw failure('STORAGE_UNAVAILABLE');
            report('DISCONNECTED');
        }
        return {
            status: status,
            getRecoveryCode: function () { return identity ? identity.code : savedRecord ? savedRecord.recoveryCode : ''; },
            create: function (snapshot, settings) { return operation(async function (epoch) {
                const credentials = await derive('EV1.' + encode(webcrypto.getRandomValues(new Uint8Array(32))));
                current(epoch);
                const envelope = await encrypted(snapshot, credentials);
                current(epoch);
                const result = await request('/v1/profiles', 'POST', { profileId: credentials.id, envelope: envelope }, credentials);
                const info = metadata(result);
                current(epoch);
                identity = credentials; revision = info.revision; persist(Boolean(settings && settings.remember), epoch);
                return Object.assign(info, { recoveryCode: credentials.code });
            }); },
            connect: function (code, settings) { return operation(async function (epoch) {
                const credentials = await derive(typeof code === 'string' ? code.trim() : '');
                current(epoch);
                const result = await decrypted(await request('/v1/profiles/' + credentials.id, 'GET', undefined, credentials), credentials);
                current(epoch);
                identity = credentials; revision = result.revision; persist(Boolean(settings && settings.remember), epoch);
                return result;
            }); },
            load: function () { return operation(async function (epoch) {
                const credentials = await active(epoch);
                const result = await decrypted(await request('/v1/profiles/' + credentials.id, 'GET', undefined, credentials), credentials);
                current(epoch);
                revision = result.revision; persist(undefined, epoch); return result;
            }); },
            save: function (snapshot) { return operation(async function (epoch) {
                const credentials = await active(epoch);
                const envelope = await encrypted(snapshot, credentials);
                current(epoch);
                const result = metadata(await request('/v1/profiles/' + credentials.id, 'PUT', { baseRevision: revision, envelope: envelope }, credentials));
                current(epoch);
                revision = result.revision; persist(undefined, epoch); return result;
            }); },
            deleteProfile: function () { return operation(async function (epoch) {
                const credentials = await active(epoch);
                await request('/v1/profiles/' + credentials.id, 'DELETE', undefined, credentials);
                current(epoch);
                identity = null; savedRecord = null; revision = 0; persist(false, epoch); notifyLogout();
            }); },
            disconnect: disconnect,
            close: function () {
                closed = true;
                forget();
                if (storage && root.removeEventListener) root.removeEventListener('storage', storageChanged);
            }
        };
    }
    return { STORAGE_KEY: STORAGE_KEY, LOGOUT_KEY: LOGOUT_KEY, MAX_SNAPSHOT_BYTES: MAX_SNAPSHOT_BYTES, createClient: createClient };
}));
