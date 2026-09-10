/* Explicit Telegra.ph publication and local QR generation. No account request on startup. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(root, require('./state.js'), require('./locales/share-fr.json'));
    else root.EVTelegraph = factory(root, root.EVState);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root, Core, fallback) {
    'use strict';
    function t(key, parameters) {
        if (root.EVI18n) return root.EVI18n.t(key, parameters);
        const message = fallback && fallback[key] || key;
        return message.replace(/\{(\w+)\}/g, function (_, name) {
            return parameters && parameters[name] !== undefined ? String(parameters[name]) : '{' + name + '}';
        });
    }

    function localizedError(key, parameters) {
        const error = new Error(t(key, parameters));
        error.i18nKey = key;
        error.i18nParams = parameters;
        return error;
    }

    const STORAGE_KEY = 'evportal.telegraph.v1';
    const PUBLIC_URL = 'https://drslid.github.io/EvPortal/';
    const MAX_CONTENT_BYTES = 64 * 1024;
    const TIMEOUT_MS = 15000;

    function validToken(value) {
        return typeof value === 'string' && /^[a-zA-Z0-9_-]{16,256}$/.test(value);
    }

    function contentForState(state) {
        // Validation selects only portable settings. Account secrets and unrelated storage never enter the page.
        const content = JSON.stringify([{ tag: 'pre', children: [JSON.stringify(Core.normalizeState(state))] }]);
        if (new TextEncoder().encode(content).length > MAX_CONTENT_BYTES) {
            throw localizedError('share.tooLarge');
        }
        return content;
    }

    function normalizeBaseURL(value) {
        const url = new URL(Core.normalizeURL(value));
        url.search = '';
        url.hash = '';
        return url.href;
    }

    function isLoopback(value) {
        const host = new URL(value).hostname;
        return host === 'localhost' || host.endsWith('.localhost') || /^127\./.test(host) || host === '[::1]' || host === '0.0.0.0';
    }

    function defaultBaseURL(currentURL) {
        try { return isLoopback(currentURL) ? PUBLIC_URL : normalizeBaseURL(currentURL); }
        catch (_) { return PUBLIC_URL; }
    }

    function shareURL(baseURL, path) {
        const url = new URL(normalizeBaseURL(baseURL));
        url.searchParams.set('code', Core.telegraphPath(path));
        return url.href;
    }

    function readAccount(storage) {
        let current = null;
        let legacy = null;
        let canWrite = Boolean(storage);
        try {
            if (storage) {
                current = storage.getItem(STORAGE_KEY);
                if (current !== null) {
                    try {
                        const parsed = JSON.parse(current);
                        if (parsed && parsed.version === 1 && validToken(parsed.accessToken)) {
                            return { token: parsed.accessToken, persistent: true, canWrite: true };
                        }
                    } catch (_) { /* Keep an unrecognized entry intact. */ }
                    canWrite = false;
                }
                legacy = storage.getItem('config');
            }
        } catch (_) { canWrite = false; }
        try {
            const parsed = legacy && JSON.parse(legacy);
            if (parsed && validToken(parsed.accesstoken)) {
                if (canWrite) {
                    try { storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, accessToken: parsed.accesstoken })); }
                    catch (_) { canWrite = false; }
                }
                // Keep config and its token untouched: old EvPortal versions can still access the account.
                return { token: parsed.accesstoken, persistent: true, canWrite: canWrite };
            }
        } catch (_) { /* An unrelated or damaged legacy config is never overwritten. */ }
        return { token: null, persistent: false, canWrite: canWrite };
    }

    function createClient(options) {
        options = options || {};
        const storage = options.storage || null;
        const fetcher = options.fetch || (root.fetch && root.fetch.bind(root));
        const account = readAccount(storage);
        let publication = null;
        let accountCreation = null;
        let historyRequest = null;
        const timeoutMs = options.timeoutMs === undefined ? TIMEOUT_MS : options.timeoutMs;

        async function request(method, parameters) {
            if (!fetcher) throw localizedError('share.noConnection');
            const controller = new AbortController();
            let timer;
            const timeout = new Promise(function (_, reject) {
                timer = setTimeout(function () {
                    controller.abort();
                    reject(localizedError(method === 'createPage' ? 'share.publishTimeout' : 'share.timeout'));
                }, timeoutMs);
            });
            try {
                return await Promise.race([timeout, (async function () {
                    let response;
                    try {
                        response = await fetcher('https://api.telegra.ph/' + method, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            body: new URLSearchParams(parameters),
                            signal: controller.signal,
                            credentials: 'omit',
                            referrerPolicy: 'no-referrer'
                        });
                    } catch (_) {
                        if (controller.signal.aborted) throw localizedError('share.timeout');
                        throw localizedError('share.networkError');
                    }
                    if (!response.ok) throw localizedError('share.unavailable');
                    let data;
                    try { data = await response.json(); }
                    catch (_) { throw localizedError('share.badResponse'); }
                    if (!data || data.ok !== true || !data.result || typeof data.result !== 'object') {
                        if (/^FLOOD_WAIT_\d+$/.test(data && data.error || '')) throw localizedError('share.rateLimited');
                        if (data && data.error === 'ACCESS_TOKEN_INVALID') throw localizedError('share.invalidAccount');
                        // Never display raw service errors: they may contain request parameters.
                        throw localizedError('share.refused');
                    }
                    return data.result;
                }())]);
            } finally { clearTimeout(timer); }
        }

        async function ensureAccount() {
            if (account.token) return account.token;
            if (!accountCreation) {
                accountCreation = (async function () {
                    const created = await request('createAccount', { short_name: 'EvPortal', author_name: 'EvPortal', author_url: PUBLIC_URL });
                    if (!validToken(created.access_token)) throw localizedError('share.accountNotCreated');
                    account.token = created.access_token;
                    if (account.canWrite) {
                        try {
                            storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, accessToken: account.token }));
                            account.persistent = true;
                        } catch (_) { account.canWrite = false; }
                    }
                    return account.token;
                }());
            }
            try { return await accountCreation; }
            finally { accountCreation = null; }
        }

        function publish(state, baseURL, title) {
            if (publication) return publication;
            // Snapshot and validate before the first network request, including account creation.
            let content;
            let base;
            let pageTitle;
            try {
                content = contentForState(state);
                base = normalizeBaseURL(baseURL);
                pageTitle = title === undefined || title === '' ? 'EvPortal' : title;
                if (typeof pageTitle !== 'string' || !pageTitle.trim() || pageTitle.trim().length > 256) throw localizedError('share.invalidTitle');
                pageTitle = pageTitle.trim();
            } catch (error) { return Promise.reject(error); }
            publication = (async function () {
                const token = await ensureAccount();
                const result = await request('createPage', {
                    access_token: token, title: pageTitle, author_name: 'EvPortal', author_url: PUBLIC_URL, content: content
                });
                const path = Core.telegraphPath(result.path);
                return {
                    path: path,
                    shareURL: shareURL(base, path),
                    telegraphURL: 'https://telegra.ph/' + path,
                    warning: account.persistent ? '' : t('share.sessionOnly')
                };
            }()).finally(function () { publication = null; });
            return publication;
        }

        function listPages(offset) {
            offset = offset || 0;
            if (!Number.isSafeInteger(offset) || offset < 0) return Promise.reject(localizedError('share.invalidPage'));
            if (!account.token) return Promise.resolve({ pages: [], total: 0, nextOffset: 0 });
            if (historyRequest) return historyRequest;
            historyRequest = request('getPageList', { access_token: account.token, offset: String(offset), limit: '200' }).then(function (result) {
                if (!Array.isArray(result.pages) || !Number.isSafeInteger(result.total_count) || result.total_count < 0) throw localizedError('share.badHistory');
                const pages = result.pages.filter(function (page) { return page && page.title !== 'Deleted Page'; }).map(function (page) {
                    return { path: Core.telegraphPath(page.path), title: typeof page.title === 'string' ? page.title.slice(0, 256) : 'EvPortal' };
                });
                return { pages: pages, total: result.total_count, nextOffset: offset + result.pages.length };
            }).finally(function () { historyRequest = null; });
            return historyRequest;
        }

        return { publish: publish, listPages: listPages };
    }

    function init(options) {
        const doc = root.document;
        if (!doc || !Core || !options || typeof options.getState !== 'function') return null;
        const $ = function (id) { return doc.getElementById(id); };
        const dialog = $('shareDialog');
        if (!dialog || !$('shareButton') || dialog.dataset.initialized) return null;
        dialog.dataset.initialized = 'true';
        let storage;
        try { storage = root.localStorage; } catch (_) { storage = null; }
        const client = createClient({ storage: storage });
        let pending = false;
        let selectedPath = null;
        let historyLoading = false;
        let currentShareURL = '';
        const announce = typeof options.announce === 'function' ? options.announce : function () {};
        const baseInput = $('shareBaseURL');
        if (baseInput && !baseInput.value) baseInput.value = defaultBaseURL(root.location.href);

        let lastError = null;
        function error(message) {
            lastError = message;
            if ($('shareError')) $('shareError').textContent = message && message.i18nKey
                ? t(message.i18nKey, message.i18nParams) : (message && message.message || message || '');
        }

        function updatePreviewNote() {
            const note = $('sharePreviewNote');
            if (!note) return;
            const local = isLoopback(root.location.href);
            note.hidden = !local;
            if (local) {
                let production = false;
                try { production = normalizeBaseURL(baseInput.value) === PUBLIC_URL; } catch (_) { /* Editing in progress. */ }
                note.textContent = t(production ? 'share.localPreviewOld' : 'share.localPreview');
                const advanced = baseInput && baseInput.closest('details');
                if (advanced) advanced.open = true;
            }
        }

        function displayShare(path) {
            const url = shareURL(baseInput ? baseInput.value : defaultBaseURL(root.location.href), path);
            selectedPath = path;
            currentShareURL = url;
            if ($('shareCode')) $('shareCode').value = path;
            const link = $('shareLink');
            if (link) { link.href = url; link.textContent = url; }
            const qr = $('shareQRCode');
            if (qr) {
                qr.replaceChildren();
                qr.setAttribute('role', 'img');
                qr.setAttribute('aria-label', t('share.qrLabel'));
                if (root.QRCode) {
                    try {
                        new root.QRCode(qr, { text: url, width: 220, height: 220, colorDark: '#10151f', colorLight: '#ffffff', correctLevel: root.QRCode.CorrectLevel.M });
                        qr.querySelectorAll('img').forEach(function (img) { img.alt = ''; });
                        qr.hidden = false;
                    } catch (_) {
                        qr.hidden = true;
                        error(localizedError('share.qrAddressUnavailable'));
                    }
                } else { qr.hidden = true; error(localizedError('share.qrUnavailable')); }
            }
            if ($('shareResult')) $('shareResult').hidden = false;
        }

        $('shareButton').addEventListener('click', function () {
            error('');
            updatePreviewNote();
            if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
            else dialog.setAttribute('open', '');
        });

        async function publish(event) {
            event.preventDefault();
            if (pending) return;
            pending = true;
            error('');
            if ($('shareResult')) $('shareResult').hidden = true;
            const button = $('sharePublishButton');
            if (button) { button.disabled = true; button.textContent = t('share.publishing'); }
            dialog.setAttribute('aria-busy', 'true');
            try {
                const result = await client.publish(options.getState(), baseInput ? baseInput.value : defaultBaseURL(root.location.href), $('shareTitle') ? $('shareTitle').value : 'EvPortal');
                displayShare(result.path);
                if (result.warning) error(localizedError('share.sessionOnly'));
                announce(t('share.created'));
                if ($('shareResult')) $('shareResult').scrollIntoView({ block: 'nearest' });
            } catch (failure) { error(failure); }
            finally {
                pending = false;
                dialog.removeAttribute('aria-busy');
                if (button) { button.disabled = false; button.textContent = t('share.publish'); }
            }
        }
        if ($('shareForm')) $('shareForm').addEventListener('submit', publish);
        else if ($('sharePublishButton')) $('sharePublishButton').addEventListener('click', publish);

        if (baseInput) baseInput.addEventListener('input', function () {
            updatePreviewNote();
            if (selectedPath) {
                error('');
                try { displayShare(selectedPath); }
                catch (_) { currentShareURL = ''; if ($('shareResult')) $('shareResult').hidden = true; }
            }
        });

        async function copyShareText(text, buttonID, successKey) {
            if (!text) return;
            let copied = false;
            try {
                if (root.navigator.clipboard && root.navigator.clipboard.writeText) {
                    await root.navigator.clipboard.writeText(text);
                    copied = true;
                }
            } catch (_) { /* HTTP LAN previews may require the legacy copy API. */ }
            if (!copied) {
                const field = doc.createElement('textarea');
                field.value = text;
                field.setAttribute('readonly', '');
                field.style.position = 'fixed';
                field.style.opacity = '0';
                dialog.appendChild(field);
                field.select();
                try { copied = doc.execCommand('copy'); } catch (_) { copied = false; }
                field.remove();
                if ($(buttonID)) $(buttonID).focus();
            }
            if (copied) { error(''); announce(t(successKey)); }
            else error(localizedError('share.copyUnavailable'));
        }
        if ($('shareCopyButton')) $('shareCopyButton').addEventListener('click', function () {
            copyShareText(currentShareURL, 'shareCopyButton', 'share.linkCopied');
        });
        if ($('shareCopyCodeButton')) $('shareCopyCodeButton').addEventListener('click', function () {
            copyShareText(selectedPath, 'shareCopyCodeButton', 'share.codeCopied');
        });

        async function refreshHistory(offset) {
            if (historyLoading) return;
            historyLoading = true;
            const button = $('shareRefreshButton');
            const pages = $('sharePages');
            if (!pages) { historyLoading = false; return; }
            if (button) button.disabled = true;
            pages.setAttribute('aria-busy', 'true');
            error('');
            try {
                const result = await client.listPages(offset);
                if (!offset) { pages.replaceChildren(); pages.removeAttribute('data-i18n'); }
                const oldMore = pages.querySelector('[data-more-shares]');
                if (oldMore) oldMore.remove();
                result.pages.forEach(function (page) {
                    const row = doc.createElement('div');
                    row.className = 'share-history-row';
                    const select = doc.createElement('button');
                    select.type = 'button';
                    select.className = 'button button-secondary';
                    select.textContent = page.title || page.path;
                    select.addEventListener('click', function () { error(''); try { displayShare(page.path); } catch (failure) { error(failure); } });
                    const open = doc.createElement('a');
                    open.className = 'button button-quiet';
                    open.dataset.i18n = 'share.import';
                    open.textContent = t('share.import');
                    open.setAttribute('data-i18n-aria-label', 'share.importNamed');
                    open.dataset.i18nParams = JSON.stringify({ name: page.title || page.path });
                    open.setAttribute('aria-label', t('share.importNamed', { name: page.title || page.path }));
                    open.href = shareURL(root.location.href, page.path);
                    row.append(select, open);
                    pages.appendChild(row);
                });
                if (result.nextOffset < result.total && result.nextOffset > (offset || 0)) {
                    const more = doc.createElement('button');
                    more.type = 'button';
                    more.className = 'button button-quiet';
                    more.dataset.moreShares = 'true';
                    more.dataset.i18n = 'share.more';
                    more.textContent = t('share.more');
                    more.addEventListener('click', function () { refreshHistory(result.nextOffset); });
                    pages.appendChild(more);
                }
                if (!pages.childElementCount) { pages.dataset.i18n = 'share.empty'; pages.textContent = t('share.empty'); }
            } catch (failure) { error(failure); }
            finally { historyLoading = false; pages.removeAttribute('aria-busy'); if (button) button.disabled = false; }
        }
        if ($('shareRefreshButton')) $('shareRefreshButton').addEventListener('click', function () { refreshHistory(0); });
        root.addEventListener('evportal:languagechange', function () {
            updatePreviewNote();
            if (lastError) error(lastError);
            if ($('sharePublishButton')) $('sharePublishButton').textContent = t(pending ? 'share.publishing' : 'share.publish');
            if ($('shareQRCode')) $('shareQRCode').setAttribute('aria-label', t('share.qrLabel'));
            if (root.EVI18n) root.EVI18n.translateDOM(dialog);
            // Static annotations must not replace the in-progress label.
            if (pending && $('sharePublishButton')) $('sharePublishButton').textContent = t('share.publishing');
        });
        updatePreviewNote();
        return client;
    }

    return { STORAGE_KEY, PUBLIC_URL, MAX_CONTENT_BYTES, contentForState, normalizeBaseURL, defaultBaseURL, shareURL, readAccount, createClient, init };
}));
