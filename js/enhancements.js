/* Optional regional catalogue, browser checks and explicit encrypted sync. */
(function (root) {
    'use strict';
    function init(options) {
        const doc = root.document;
        const t = function (key, params) { return root.EVI18n.t(key, params); };
        const $ = function (id) { return doc.getElementById(id); };
        const settings = $('settingsDialog');
        const config = root.EV_CONFIG || {};
        let pending = null;
        let busy = false;
        const sync = root.EVSync && config.syncURL ? root.EVSync.createClient({
            endpoint: config.syncURL, storage: options.storage,
            onStatus: function (status) {
                if (status.event !== 'FORGOTTEN') return;
                pending = null; recovery.value = ''; recovery.type = 'password';
                setMessage('upgrade.disconnected'); refreshSync();
            }
        }) : null;
        const syncAvailable = Boolean(sync && sync.status().available);
        function node(tag, className, text) {
            const item = doc.createElement(tag);
            if (className) item.className = className;
            if (text !== undefined) item.textContent = text;
            return item;
        }
        function textNode(tag, key, className) {
            const item = node(tag, className, t(key)); item.dataset.i18n = key; return item;
        }
        function button(id, key, handler, className) {
            const item = textNode('button', key, className); item.id = id; item.type = 'button';
            item.addEventListener('click', handler); return item;
        }
        function showDialog(dialog) { if (!dialog.open) dialog.showModal(); }
        const asset = function (file) { return root.EVSEO ? root.EVSEO.asset(file) : file; };
        if (config.localPreview) {
            const banner = node('aside', 'local-preview');
            banner.append(textNode('strong', 'upgrade.preview'), textNode('span', 'upgrade.previewHint'));
            const discover = textNode('a', 'upgrade.discover'); discover.href = asset('decouvrir.html');
            banner.append(discover); doc.body.prepend(banner);
        }

        const regionSection = node('details', 'upgrade-section'); regionSection.id = 'regionPreferences';
        const regionSummary = textNode('summary', 'upgrade.adapt'); regionSummary.id = 'adaptCatalogButton';
        regionSection.append(regionSummary);
        const countryLabel = textNode('label', 'upgrade.country'); countryLabel.htmlFor = 'catalogCountrySelect';
        const country = node('select'); country.id = 'catalogCountrySelect';
        const languagesTitle = textNode('p', 'upgrade.languages', 'field-help');
        const languageOptions = node('div', 'content-language-options'); languageOptions.id = 'contentLanguageOptions';
        const allLanguages = button('allContentLanguages', 'upgrade.allLanguages', function () { updateRegions({ contentLanguages: [] }); });
        regionSection.append(countryLabel, country, languagesTitle, languageOptions, allLanguages, textNode('p', 'upgrade.regionHint', 'field-help'));
        country.addEventListener('change', function () { updateRegions({ country: country.value }); });
        function updateRegions(changes) {
            try { options.setRegions(changes); refreshRegions(); options.announce(t('upgrade.regionSaved')); }
            catch (_) { options.announce(t('app.storageUnavailable'), true); }
        }
        function refreshRegions() {
            const prefs = options.getRegions();
            const regions = root.EVRegions;
            country.replaceChildren();
            regions.COUNTRIES.forEach(function (entry) {
                const choice = node('option', '', regions.countryLabel(entry.code, root.EVI18n.language));
                choice.value = entry.code; choice.selected = prefs.country === entry.code; country.append(choice);
            });
            languageOptions.replaceChildren();
            regions.LANGUAGES.forEach(function (entry) {
                const label = node('label'); const input = node('input'); input.type = 'checkbox'; input.value = entry.code;
                input.checked = prefs.contentLanguages.includes(entry.code);
                input.addEventListener('change', function () {
                    const next = new Set(options.getRegions().contentLanguages);
                    if (input.checked) next.add(entry.code); else next.delete(entry.code);
                    updateRegions({ contentLanguages: Array.from(next) });
                });
                label.append(input, node('span', '', entry.label)); languageOptions.append(label);
            });
            allLanguages.setAttribute('aria-pressed', String(!prefs.contentLanguages.length));
        }

        const deviceSection = node('details', 'upgrade-section'); deviceSection.id = 'deviceSyncPreferences';
        deviceSection.append(textNode('summary', 'upgrade.syncTitle'), textNode('p', 'upgrade.syncHint', 'field-help'));
        const localNotice = textNode('p', 'upgrade.localSync', 'field-help'); localNotice.hidden = !config.localPreview;
        const unavailable = textNode('p', 'upgrade.syncUnavailable', 'field-help'); unavailable.hidden = syncAvailable;
        deviceSection.append(localNotice, unavailable);
        const panel = node('div', 'sync-panel'); panel.hidden = !syncAvailable;
        const rememberLabel = node('label', 'preference-check');
        const remember = node('input'); remember.id = 'rememberSyncConnection'; remember.type = 'checkbox';
        rememberLabel.append(remember, textNode('span', 'upgrade.remember'));
        const initialButtons = node('div', 'upgrade-buttons');
        initialButtons.append(button('createSyncProfile', 'upgrade.createProfile', function () {
            runSync(async function () { await sync.create(options.getState(), { remember: remember.checked }); pending = null; setMessage('upgrade.saved'); });
        }, 'primary-button'));
        const codeBox = node('div', 'sync-code-box');
        const recoveryLabel = textNode('label', 'upgrade.recovery'); recoveryLabel.htmlFor = 'syncRecoveryCode';
        const recovery = node('input'); recovery.id = 'syncRecoveryCode'; recovery.type = 'password'; recovery.dir = 'ltr'; recovery.spellcheck = false;
        recovery.autocomplete = 'off'; recovery.maxLength = 512;
        const joinButtons = node('div', 'upgrade-buttons');
        const reveal = button('revealSyncCode', 'upgrade.showCode', function () {
            recovery.type = recovery.type === 'password' ? 'text' : 'password';
            reveal.dataset.i18n = recovery.type === 'password' ? 'upgrade.showCode' : 'upgrade.hideCode';
            reveal.textContent = t(reveal.dataset.i18n);
            reveal.setAttribute('aria-pressed', String(recovery.type === 'text'));
        });
        joinButtons.append(button('connectSyncProfile', 'upgrade.connect', function () {
            runSync(async function () { const remote = await sync.connect(recovery.value.trim(), { remember: remember.checked }); preview(remote); });
        }), button('copySyncCode', 'upgrade.copy', async function () {
            try { await root.navigator.clipboard.writeText(sync.getRecoveryCode() || recovery.value); options.announce(t('upgrade.codeCopied')); }
            catch (_) { recovery.focus(); recovery.select(); }
        }));
        codeBox.append(recoveryLabel, recovery, textNode('p', 'upgrade.keepCode', 'field-help'), reveal, joinButtons);
        const connectedButtons = node('div', 'upgrade-buttons');
        connectedButtons.append(button('saveSyncProfile', 'upgrade.save', function () {
            runSync(async function () { await sync.save(options.getState()); setMessage('upgrade.saved'); });
        }, 'primary-button'), button('loadSyncProfile', 'upgrade.load', function () {
            runSync(async function () { preview(await sync.load()); });
        }), button('disconnectSyncProfile', 'upgrade.disconnect', function () {
            try { sync.disconnect(); setMessage('upgrade.disconnected'); }
            catch (_) { setMessage('app.storageUnavailable', true); }
            finally { pending = null; recovery.value = ''; recovery.type = 'password'; refreshSync(); }
        }), button('deleteSyncProfile', 'upgrade.revokeProfile', function () {
            if (!root.confirm(t('upgrade.revokeConfirm'))) return;
            runSync(async function () {
                await sync.deleteProfile();
                pending = null; recovery.value = ''; recovery.type = 'password';
                setMessage('upgrade.revoked');
            });
        }, 'danger'));
        const syncState = node('p', 'field-help'); syncState.id = 'syncConnectionState'; syncState.setAttribute('role', 'status');
        const syncMessage = node('p', 'sync-message'); syncMessage.id = 'syncStatusMessage'; syncMessage.setAttribute('role', 'status');
        let messageKey = '';
        function setMessage(key, error) { messageKey = key; syncMessage.textContent = t(key); syncMessage.classList.toggle('is-error', Boolean(error)); }
        const remoteBox = node('div', 'remote-preview'); remoteBox.id = 'syncRemotePreview'; remoteBox.hidden = true;
        const remoteText = node('p', 'field-help');
        const remoteActions = node('div', 'upgrade-buttons');
        remoteActions.append(button('applySyncProfile', 'upgrade.apply', function () {
            runSync(async function () {
                if (!pending) return;
                const next = root.EVState.normalizeState(pending.snapshot);
                await options.backups.add({ title: t('upgrade.beforeSync'), state: options.getState(), source: 'created' });
                options.applyState(next);
                pending = null; setMessage('upgrade.applied');
            });
        }, 'primary-button'), button('keepLocalSyncProfile', 'upgrade.keepLocal', function () { pending = null; refreshSync(); }));
        remoteBox.append(remoteText, remoteActions);
        panel.append(rememberLabel, initialButtons, codeBox, syncState, connectedButtons, syncMessage, remoteBox);
        deviceSection.append(panel);
        function preview(remote) {
            root.EVState.normalizeState(remote.snapshot);
            pending = remote; messageKey = ''; syncMessage.textContent = '';
        }
        function refreshSync() {
            if (!sync) return;
            const status = sync.status();
            if (status.connected) recovery.value = sync.getRecoveryCode();
            recovery.readOnly = status.connected;
            remember.disabled = status.connected || busy;
            if (status.connected) remember.checked = status.remembered;
            initialButtons.hidden = status.connected;
            connectedButtons.hidden = !status.connected;
            $('connectSyncProfile').hidden = status.connected;
            $('copySyncCode').disabled = busy || !recovery.value.trim();
            syncState.textContent = status.connected ? t('upgrade.connected', { revision: status.revision }) : t('upgrade.disconnected');
            if (status.storageWarning) syncState.textContent += ' ' + t('app.storageUnavailable');
            panel.querySelectorAll('button').forEach(function (item) { item.disabled = busy; });
            $('saveSyncProfile').disabled = busy || Boolean(pending);
            remoteBox.hidden = !pending;
            if (pending) remoteText.textContent = t('upgrade.remotePreview', { count: root.EVState.shortcutsForCategory(pending.snapshot, 'all').length });
            if (messageKey) syncMessage.textContent = t(messageKey);
            reveal.dataset.i18n = recovery.type === 'password' ? 'upgrade.showCode' : 'upgrade.hideCode';
            reveal.textContent = t(reveal.dataset.i18n);
        }
        async function runSync(task) {
            if (!sync || busy) return;
            busy = true; setMessage('upgrade.busy'); refreshSync();
            try { await task(); }
            catch (error) {
                if (error.code === 'SESSION_CHANGED') {
                    pending = null; recovery.value = ''; recovery.type = 'password';
                    setMessage('upgrade.disconnected');
                } else setMessage(error.code === 'CONFLICT' ? 'upgrade.conflict' : (error.i18nKey ? error.i18nKey : 'upgrade.syncError'), true);
            }
            finally { busy = false; refreshSync(); }
        }

        const localButtons = node('div', 'upgrade-buttons');
        localButtons.append(button('createLocalBackup', 'upgrade.localBackup', async function () {
            $('createLocalBackup').disabled = true;
            try { await options.backups.add({ title: t('upgrade.localTitle'), state: options.getState(), source: 'created' }); options.announce(t('upgrade.localSaved')); }
            catch (_) { options.announce(t('upgrade.backupFailed'), true); }
            finally { $('createLocalBackup').disabled = false; }
        }));
        $('backupSettings').append(localButtons, textNode('p', 'upgrade.storageHint', 'field-help'));

        const diagnostic = node('dialog'); diagnostic.id = 'diagnosticDialog'; diagnostic.setAttribute('aria-labelledby', 'diagnosticTitle');
        const heading = node('div', 'dialog-heading'); const title = textNode('h2', 'upgrade.diagnostic'); title.id = 'diagnosticTitle';
        const close = node('button', 'icon-button', '×'); close.type = 'button'; close.setAttribute('aria-label', t('static.close')); close.dataset.i18nAriaLabel = 'static.close';
        close.addEventListener('click', function () { diagnostic.close(); }); heading.append(title, close);
        const results = node('ul', 'diagnostic-results'); results.id = 'browserDiagnosticResults'; results.setAttribute('aria-live', 'polite');
        const run = button('runBrowserChecks', 'upgrade.runTests', async function () {
            run.disabled = true; results.replaceChildren();
            function result(label, value) { const row = node('li'); row.append(node('span', '', t(label)), node('span', '', value)); results.append(row); }
            try {
                result('upgrade.secure', t(root.isSecureContext ? 'upgrade.supported' : 'upgrade.unsupported'));
                const status = options.backups.status ? options.backups.status() : { backend: 'localstorage' };
                const copies = await options.backups.list();
                result('upgrade.database', (status.backend === 'indexeddb' ? 'IndexedDB' : 'localStorage') + ' · ' + copies.length);
                const audio = doc.createElement('audio'); const video = doc.createElement('video');
                result('upgrade.audio', t(audio.canPlayType('audio/mpeg') ? 'upgrade.supported' : 'upgrade.unsupported'));
                result('upgrade.video', t(video.canPlayType('video/mp4; codecs="avc1.42E01E"') ? 'upgrade.supported' : 'upgrade.unsupported'));
                result('upgrade.location', t(root.navigator.geolocation ? 'upgrade.supported' : 'upgrade.unsupported'));
                result('upgrade.screen', root.innerWidth + ' × ' + root.innerHeight);
            } catch (_) { result('upgrade.database', t('upgrade.unsupported')); }
            finally { run.disabled = false; }
        });
        diagnostic.append(heading, textNode('p', 'upgrade.diagnosticHint', 'field-help'), textNode('p', 'upgrade.mediaUntested', 'field-help'), run, results);
        doc.body.append(diagnostic);
        const diagnosticButton = button('browserDiagnosticButton', 'upgrade.diagnostic', function () { showDialog(diagnostic); });
        settings.querySelector('.settings-list').insertBefore(regionSection, $('backupSettings'));
        settings.querySelector('.settings-list').insertBefore(deviceSection, $('backupSettings'));
        settings.querySelector('.settings-list').insertBefore(diagnosticButton, $('backupSettings'));
        root.addEventListener('evportal:languagechange', function () { refreshRegions(); refreshSync(); results.replaceChildren(); });
        settings.addEventListener('close', function () { recovery.type = 'password'; refreshSync(); });
        root.addEventListener('pagehide', function (event) { if (!event.persisted && sync && sync.close) sync.close(); });
        root.addEventListener('evportal:regionschange', refreshRegions);
        root.addEventListener('storage', function (event) {
            if (event.key === root.EVRegions.STORAGE_KEY || event.key === null) refreshRegions();
        });
        refreshRegions(); refreshSync();
        return { refresh: function () { refreshRegions(); refreshSync(); } };
    }
    root.EVEnhancements = { init: init };
}(window));
