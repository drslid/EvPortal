/* Tesla Theater uses a YouTube redirect; the browser Fullscreen API is separate.
 * Reference: https://mytesla.nu/ — FAQ: how do I get fullscreen.
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.EVTesla = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';
    function message(key, fallback) { return root.EVI18n ? root.EVI18n.t(key) : fallback; }

    function isTesla(userAgent) { return /tesla/i.test(userAgent || ''); }

    function theaterURL(currentURL) {
        const destination = new URL(currentURL);
        if (!['http:', 'https:'].includes(destination.protocol) || destination.username || destination.password) {
            throw new Error(message('state.invalidURL', 'Adresse EvPortal invalide.'));
        }
        // Public backup IDs and harmless navigation fragments can round-trip;
        // private pairing/recovery capabilities must never reach a third party.
        if (/^#(?:receive|download|sync)=/i.test(destination.hash)) destination.hash = '';
        for (const name of Array.from(destination.searchParams.keys())) {
            const value = destination.searchParams.get(name) || '';
            if (/^(?:access_token|token|receiveToken|sendToken|recoveryCode|key)$/i.test(name) || (/^(?:code|config)$/i.test(name) && /^EV1\./.test(value))) {
                destination.searchParams.delete(name);
            }
        }
        return 'https://www.youtube.com/redirect?q=' + encodeURIComponent(destination.href);
    }

    async function enterFullscreen(environment, forceTesla) {
        if (forceTesla || isTesla(environment.navigator.userAgent)) {
            environment.location.assign(theaterURL(environment.location.href));
            return 'theater';
        }
        const doc = environment.document;
        if (doc.fullscreenElement) await doc.exitFullscreen();
        else if (doc.documentElement.requestFullscreen) await doc.documentElement.requestFullscreen();
        else throw new Error(message('app.fullscreenUnavailable', 'Le plein écran n’est pas disponible dans ce navigateur.'));
        return 'browser';
    }

    return { isTesla: isTesla, theaterURL: theaterURL, enterFullscreen: enterFullscreen };
}));
