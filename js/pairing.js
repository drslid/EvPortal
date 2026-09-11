/* Ephemeral, end-to-end encrypted phone-to-screen transfer. Secrets live in memory and QR fragments only. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(root, require('./state.js'), require('./locales/pair-fr.json'));
    else root.EVPairing = factory(root, root.EVState);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root, Core, fallback) {
    'use strict';
    const PUBLIC_URL = 'https://drslid.github.io/EvPortal/';
    const MAX_BYTES = 64 * 1024;
    const TTL_MS = 5 * 60 * 1000;
    const ID = /^[a-f0-9]{32}$/;
    const TOKEN = /^[a-f0-9]{64}$/;
    let activeController = null;

    function t(key, params) {
        if (root.EVI18n) return root.EVI18n.t(key, params);
        return (fallback && fallback[key] || key).replace(/\{(\w+)\}/g, function (_, name) { return String((params || {})[name] ?? ''); });
    }
    function fail(key) {
        const error = new Error(t(key));
        error.i18nKey = key;
        return error;
    }
    function encode(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i += 4096) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 4096));
        return root.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function decode(text, max) {
        if (typeof text !== 'string' || !/^[A-Za-z0-9_-]+$/.test(text) || text.length > Math.ceil(max * 4 / 3) || text.length % 4 === 1) throw fail('pair.invalidResponse');
        let binary;
        try { binary = root.atob(text.replace(/-/g, '+').replace(/_/g, '/')); } catch (_) { throw fail('pair.invalidResponse'); }
        const bytes = Uint8Array.from(binary, function (character) { return character.charCodeAt(0); });
        if (bytes.length > max || encode(bytes) !== text) throw fail('pair.invalidResponse');
        return bytes;
    }
    function cryptoAPI(value) {
        const api = value || root.crypto;
        if (!api || !api.subtle || typeof api.getRandomValues !== 'function') throw fail('pair.unsupported');
        return api;
    }
    function createKey(api) {
        return encode(cryptoAPI(api).getRandomValues(new Uint8Array(32)));
    }
    function sessionID(value) {
        if (typeof value !== 'string' || !ID.test(value)) throw fail('pair.invalidResponse');
        return value;
    }
    function validateCredentials(raw, now) {
        if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !ID.test(raw.id) || typeof raw.token !== 'string' || !TOKEN.test(raw.token) || !Number.isSafeInteger(raw.expiresAt)) throw fail('pair.invalidLink');
        try { if (decode(raw.key, 32).length !== 32) throw new Error(); } catch (_) { throw fail('pair.invalidLink'); }
        if (raw.expiresAt <= (now === undefined ? Date.now() : now)) throw fail('pair.expired');
        return { v: 1, id: raw.id, token: raw.token, key: raw.key, expiresAt: raw.expiresAt };
    }
    function pairingURL(session, key) {
        const credentials = validateCredentials({ id: session.id, token: session.sendToken, expiresAt: session.expiresAt, key: key });
        return PUBLIC_URL + '#receive=' + encode(new TextEncoder().encode(JSON.stringify(credentials)));
    }
    function parseFragment(hash, now) {
        if (typeof hash !== 'string' || !hash.startsWith('#receive=') || hash.length > 1200) throw fail('pair.invalidLink');
        let raw;
        try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decode(hash.slice(9), 800))); }
        catch (_) { throw fail('pair.invalidLink'); }
        if (!raw || raw.v !== 1 || Object.keys(raw).sort().join(',') !== 'expiresAt,id,key,token,v') throw fail('pair.invalidLink');
        return validateCredentials(raw, now);
    }
    function normalizedState(state) {
        let next;
        try { next = Core.normalizeState(state); } catch (_) { throw fail('pair.invalidConfig'); }
        const data = new TextEncoder().encode(JSON.stringify(next));
        if (data.length > MAX_BYTES) throw fail('pair.tooLarge');
        return { state: next, bytes: data };
    }
    function validatePayload(payload) {
        if (!payload || typeof payload !== 'object' || Object.keys(payload).sort().join(',') !== 'ciphertext,iv') throw fail('pair.invalidResponse');
        const iv = decode(payload.iv, 12);
        const ciphertext = decode(payload.ciphertext, MAX_BYTES + 16);
        if (iv.length !== 12 || ciphertext.length < 16) throw fail('pair.invalidResponse');
        return { iv: iv, ciphertext: ciphertext };
    }
    async function encryptState(state, key, id, api) {
        api = cryptoAPI(api);
        sessionID(id);
        const bytes = normalizedState(state).bytes;
        const rawKey = decode(key, 32);
        if (rawKey.length !== 32) throw fail('pair.invalidLink');
        const imported = await api.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
        const iv = api.getRandomValues(new Uint8Array(12));
        const ciphertext = await api.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: new TextEncoder().encode('evportal-pairing-v1:' + id) }, imported, bytes);
        return { iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) };
    }
    async function decryptState(payload, key, id, api) {
        api = cryptoAPI(api);
        sessionID(id);
        const raw = validatePayload(payload);
        let decrypted;
        try {
            const rawKey = decode(key, 32);
            if (rawKey.length !== 32) throw new Error();
            const imported = await api.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
            decrypted = await api.subtle.decrypt({ name: 'AES-GCM', iv: raw.iv, additionalData: new TextEncoder().encode('evportal-pairing-v1:' + id) }, imported, raw.ciphertext);
        } catch (_) { throw fail('pair.decryptFailed'); }
        if (decrypted.byteLength > MAX_BYTES) throw fail('pair.tooLarge');
        let state;
        try { state = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decrypted)); } catch (_) { throw fail('pair.invalidConfig'); }
        return normalizedState(state).state;
    }
    function relayURL(value) {
        let url;
        try { url = new URL(value); } catch (_) { throw fail('pair.notConfigured'); }
        const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
        if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash) throw fail('pair.notConfigured');
        return url.href.replace(/\/$/, '');
    }
    function createClient(options) {
        options = options || {};
        const base = relayURL(options.relayURL);
        const fetcher = options.fetch || root.fetch.bind(root);
        const timeoutMs = options.timeoutMs || 10000;
        async function request(method, path, token, body, signal) {
            const controller = new AbortController();
            let timedOut = false;
            const abort = function () { controller.abort(); };
            if (signal) { signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort(); }
            const timer = setTimeout(function () { timedOut = true; controller.abort(); }, timeoutMs);
            try {
                const response = await fetcher(base + '/v1/sessions' + path, {
                    method: method, signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'error',
                    headers: Object.assign({ Accept: 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}, body ? { 'Content-Type': 'application/json' } : {}),
                    body: body ? JSON.stringify(body) : undefined
                });
                if (!response.ok) {
                    const keys = { 401: 'pair.unauthorized', 403: 'pair.unauthorized', 404: 'pair.expired', 410: 'pair.expired', 409: 'pair.alreadySent', 413: 'pair.tooLarge', 429: 'pair.serviceUnavailable' };
                    throw fail(keys[response.status] || 'pair.serviceUnavailable');
                }
                if (response.status === 204) return null;
                const text = await response.text();
                if (text.length > 100 * 1024) throw fail('pair.invalidResponse');
                try { return JSON.parse(text); } catch (_) { throw fail('pair.invalidResponse'); }
            } catch (error) {
                if (signal && signal.aborted) { const cancelled = new Error('Aborted'); cancelled.name = 'AbortError'; throw cancelled; }
                if (timedOut) throw fail('pair.timeout');
                throw error.i18nKey ? error : fail('pair.networkError');
            } finally {
                clearTimeout(timer);
                if (signal) signal.removeEventListener('abort', abort);
            }
        }
        return {
            create: async function (signal) {
                const session = await request('POST', '', '', {}, signal);
                if (!session || typeof session.id !== 'string' || !ID.test(session.id) || typeof session.receiveToken !== 'string' || !TOKEN.test(session.receiveToken) || typeof session.sendToken !== 'string' || !TOKEN.test(session.sendToken) || session.receiveToken === session.sendToken || !Number.isSafeInteger(session.expiresAt) || session.expiresAt <= Date.now() || session.expiresAt > Date.now() + TTL_MS + 60000) throw fail('pair.invalidResponse');
                return { id: session.id, receiveToken: session.receiveToken, sendToken: session.sendToken, expiresAt: session.expiresAt };
            },
            read: async function (session, signal) {
                const result = await request('GET', '/' + sessionID(session.id), session.receiveToken, null, signal);
                if (!result || !['waiting', 'ready'].includes(result.status) || result.expiresAt !== session.expiresAt) throw fail('pair.invalidResponse');
                if (result.status === 'ready') validatePayload(result.payload);
                return result;
            },
            send: async function (session, payload, signal) {
                validatePayload(payload);
                const result = await request('PUT', '/' + sessionID(session.id), session.token, payload, signal);
                if (!result || result.status !== 'sent') throw fail('pair.invalidResponse');
                return result;
            },
            remove: function (session, signal) { return request('DELETE', '/' + sessionID(session.id), session.receiveToken, null, signal); }
        };
    }

    function init(options) {
        const doc = root.document;
        if (!doc || !options || typeof options.getState !== 'function' || typeof options.applyState !== 'function') return null;
        const $ = function (id) { return doc.getElementById(id); };
        const receiverDialog = $('pairReceiveDialog');
        const senderDialog = $('pairSendDialog');
        if (!receiverDialog || !senderDialog || receiverDialog.dataset.initialized) return null;
        receiverDialog.dataset.initialized = 'true';
        let client;
        let receiver = null;
        let receiverKey = '';
        let received = null;
        let receiveAbort = null;
        let receiveEpoch = 0;
        let pollTimer;
        let clockTimer;
        let retries = 0;
        let sender = null;
        let senderState = null;
        let senderPayload = null;
        let sendAbort = null;
        let senderPaused = false;
        let sending = false;
        let sent = false;
        let sendAmbiguous = false;
        let sendClock;
        function message(id, key, params) {
            const node = $(id);
            if (!node) return;
            node.hidden = !key;
            if (!key) { node.textContent = ''; node.removeAttribute('data-i18n'); node.removeAttribute('data-i18n-params'); return; }
            node.dataset.i18n = key;
            node.dataset.i18nParams = JSON.stringify(params || {});
            node.textContent = t(key, params);
        }
        function error(id, issue) { if (issue && issue.name !== 'AbortError') message(id, issue.i18nKey || 'pair.networkError', issue.i18nParams); }
        function summary(id, state) { message(id, 'pair.summary', { categories: state.categories.length, count: state.categories.reduce(function (sum, category) { return sum + category.shortcuts.length; }, 0) }); }
        function open(dialog) {
            Array.from(doc.querySelectorAll('dialog[open]')).forEach(function (other) { if (other !== dialog) other.close(); });
            if (!dialog.open) dialog.showModal();
        }
        function getClient() {
            cryptoAPI();
            if (!client) client = createClient({ relayURL: root.EV_CONFIG && root.EV_CONFIG.pairingRelayURL });
            return client;
        }
        function clearQR() {
            $('pairReceiveQRCode').hidden = true;
            $('pairReceiveQRCode').replaceChildren();
            $('pairReceiveQRCode').removeAttribute('title');
        }
        function cleanupReceiver(removeRemote) {
            receiveEpoch += 1;
            clearTimeout(pollTimer);
            clearInterval(clockTimer);
            if (receiveAbort) receiveAbort.abort();
            receiveAbort = null;
            const old = receiver;
            receiver = null;
            receiverKey = '';
            clearQR();
            if (removeRemote && old && client) client.remove(old).catch(function () {});
        }
        function remaining(expiresAt) {
            const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
            return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
        }
        function receiveClock() {
            if (!receiver) return;
            if (receiver.expiresAt <= Date.now()) {
                cleanupReceiver(true);
                message('pairReceiveStatus', '');
                message('pairReceiveError', 'pair.receiverExpired');
                $('pairNewButton').hidden = false;
            } else message('pairReceiveStatus', retries ? 'pair.retrying' : 'pair.waiting', { time: remaining(receiver.expiresAt) });
        }
        async function poll(epoch) {
            if (!receiver || epoch !== receiveEpoch || !receiverDialog.open) return;
            const session = receiver;
            try {
                const result = await client.read(session, receiveAbort.signal);
                if (epoch !== receiveEpoch || !receiver) return;
                if (result.status === 'ready') {
                    const next = await decryptState(result.payload, receiverKey, session.id);
                    if (epoch !== receiveEpoch || !receiverDialog.open) return;
                    received = next;
                    cleanupReceiver(true);
                    message('pairReceiveError', '');
                    message('pairReceiveStatus', 'pair.ready');
                    summary('pairReceiveSummary', next);
                    $('pairApplyButton').hidden = false;
                    $('pairNewButton').hidden = true;
                    $('pairApplyButton').focus();
                    return;
                }
                retries = 0;
                receiveClock();
            } catch (issue) {
                if (epoch !== receiveEpoch || issue.name === 'AbortError') return;
                if (['pair.networkError', 'pair.timeout', 'pair.serviceUnavailable'].includes(issue.i18nKey)) { retries += 1; receiveClock(); }
                else {
                    cleanupReceiver(true);
                    message('pairReceiveStatus', '');
                    error('pairReceiveError', issue.i18nKey === 'pair.expired' ? fail('pair.receiverExpired') : issue);
                    $('pairNewButton').hidden = false;
                    return;
                }
            }
            if (epoch === receiveEpoch && receiver) pollTimer = setTimeout(function () { poll(epoch); }, Math.min(10000, 2000 * Math.pow(2, Math.min(retries, 3))));
        }
        async function startReceiver() {
            cleanupReceiver(true);
            received = null;
            message('pairReceiveError', '');
            message('pairReceiveSummary', '');
            message('pairReceiveStatus', 'pair.preparing');
            $('pairApplyButton').hidden = true;
            $('pairNewButton').hidden = true;
            open(receiverDialog);
            const epoch = receiveEpoch;
            receiveAbort = new AbortController();
            try {
                getClient();
                if (!root.QRCode) throw fail('pair.unsupported');
                const key = createKey();
                const session = await client.create(receiveAbort.signal);
                if (epoch !== receiveEpoch || !receiverDialog.open) { client.remove(session).catch(function () {}); return; }
                receiver = session;
                receiverKey = key;
                retries = 0;
                const qr = $('pairReceiveQRCode');
                new root.QRCode(qr, { text: pairingURL(session, key), width: 256, height: 256, colorDark: '#10151f', colorLight: '#ffffff', correctLevel: root.QRCode.CorrectLevel.M });
                qr.setAttribute('role', 'img');
                const image = qr.querySelector('img');
                if (image) image.alt = '';
                qr.hidden = false;
                receiveClock();
                clockTimer = setInterval(receiveClock, 1000);
                pollTimer = setTimeout(function () { poll(epoch); }, 2000);
            } catch (issue) {
                if (epoch !== receiveEpoch) return;
                cleanupReceiver(true);
                message('pairReceiveStatus', '');
                error('pairReceiveError', issue);
                $('pairNewButton').hidden = false;
            }
        }
        function clearSender() {
            clearInterval(sendClock);
            if (sendAbort) sendAbort.abort();
            sendAbort = null;
            sender = null;
            senderState = null;
            senderPayload = null;
            senderPaused = false;
            sending = false;
            sent = false;
            sendAmbiguous = false;
        }
        function senderClock() {
            if (!sender || sent) return;
            if (sender.expiresAt <= Date.now()) {
                if (sendAbort) sendAbort.abort();
                message('pairSendError', 'pair.expired');
                message('pairSendStatus', '');
                $('pairSendButton').disabled = true;
                if ($('pairChooseBackupButton')) $('pairChooseBackupButton').disabled = true;
                clearInterval(sendClock);
            }
        }
        function showSender() {
            senderPaused = false;
            message('pairSendError', '');
            message('pairSendStatus', '');
            $('pairSendButton').disabled = true;
            if ($('pairChooseBackupButton')) $('pairChooseBackupButton').disabled = false;
            open(senderDialog);
            try {
                getClient();
                validateCredentials(sender);
                senderState = normalizedState(options.getState()).state;
                senderPayload = null;
                sendAmbiguous = false;
                summary('pairSendSummary', senderState);
                $('pairSendButton').disabled = false;
                clearInterval(sendClock);
                sendClock = setInterval(senderClock, 1000);
            } catch (issue) { error('pairSendError', issue); }
        }
        async function send() {
            if (!sender || sending || sent) return;
            const current = sender;
            sending = true;
            $('pairSendButton').disabled = true;
            if ($('pairChooseBackupButton')) $('pairChooseBackupButton').disabled = true;
            message('pairSendError', '');
            message('pairSendStatus', 'pair.sending');
            sendAbort = new AbortController();
            let attempted = false;
            try {
                validateCredentials(current);
                if (!senderPayload) senderPayload = await encryptState(senderState, current.key, current.id);
                if (sender !== current || sendAbort.signal.aborted) return;
                attempted = true;
                await client.send(current, senderPayload, sendAbort.signal);
                if (sender !== current) return;
                sent = true;
                current.key = '';
                current.token = '';
                senderPayload = null;
                senderState = null;
                clearInterval(sendClock);
                message('pairSendStatus', 'pair.sent');
            } catch (issue) {
                if (sender !== current) return;
                message('pairSendStatus', '');
                const uncertain = sendAmbiguous && ['pair.expired', 'pair.alreadySent'].includes(issue.i18nKey);
                error('pairSendError', uncertain ? fail('pair.deliveryUnknown') : issue);
                if (attempted && ['pair.networkError', 'pair.timeout', 'pair.serviceUnavailable'].includes(issue.i18nKey)) sendAmbiguous = true;
                if (['pair.expired', 'pair.alreadySent', 'pair.unauthorized'].includes(issue.i18nKey)) {
                    current.expiresAt = Date.now();
                    clearInterval(sendClock);
                }
            } finally {
                if (sender === current) {
                    sending = false;
                    $('pairSendButton').disabled = sent || current.expiresAt <= Date.now();
                    if ($('pairChooseBackupButton')) $('pairChooseBackupButton').disabled = sent || Boolean(senderPayload);
                }
            }
        }
        $('pairReceiveButton').addEventListener('click', startReceiver);
        $('pairNewButton').addEventListener('click', startReceiver);
        receiverDialog.addEventListener('close', function () { if (!receiverDialog.open) { cleanupReceiver(true); received = null; } });
        receiverDialog.addEventListener('cancel', function () { cleanupReceiver(true); received = null; });
        senderDialog.addEventListener('close', function () { if (!senderDialog.open && !senderPaused) clearSender(); });
        senderDialog.addEventListener('cancel', clearSender);
        $('pairSendButton').addEventListener('click', send);
        $('pairApplyButton').addEventListener('click', async function () {
            if (!received || this.disabled) return;
            this.disabled = true;
            try {
                const next = Core.normalizeState(received);
                if (await options.applyState(next) === false) throw fail('pair.applyFailed');
                receiverDialog.close();
                if (options.announce) options.announce(t('pair.applied'));
            } catch (issue) { error('pairReceiveError', issue.i18nKey ? issue : fail('pair.applyFailed')); }
            finally { this.disabled = false; }
        });
        if ($('pairChooseBackupButton')) $('pairChooseBackupButton').addEventListener('click', function () {
            if (!sender || sending || sent || !options.chooseBackup) return;
            senderPaused = true;
            senderDialog.close();
            options.chooseBackup();
        });
        const controller = {
            startReceiver: startReceiver,
            resumeSender: function () { if (senderPaused && sender) { showSender(); return true; } return false; },
            destroy: function () { cleanupReceiver(true); clearSender(); }
        };
        activeController = controller;
        root.addEventListener('pagehide', function () {
            cleanupReceiver(false);
            received = null;
            clearSender();
            if (receiverDialog.open) receiverDialog.close();
            if (senderDialog.open) senderDialog.close();
        });
        function incomingLink() {
            const hash = root.location.hash;
            if (!hash.startsWith('#receive=')) return;
            // Remove credentials before opening UI or making any request; never copy them into storage.
            root.history.replaceState(null, '', root.location.pathname + root.location.search);
            clearSender();
            message('pairSendSummary', '');
            message('pairSendStatus', '');
            message('pairSendError', '');
            try { sender = parseFragment(hash); showSender(); }
            catch (issue) {
                open(senderDialog);
                $('pairSendButton').disabled = true;
                if ($('pairChooseBackupButton')) $('pairChooseBackupButton').disabled = true;
                error('pairSendError', issue);
            }
        }
        root.addEventListener('hashchange', incomingLink);
        incomingLink();
        return controller;
    }
    return { PUBLIC_URL, MAX_BYTES, TTL_MS, encode, decode, createKey, pairingURL, parseFragment, encryptState, decryptState, validatePayload, relayURL, createClient, init, resumeSender: function () { return activeController ? activeController.resumeSender() : false; } };
}));
