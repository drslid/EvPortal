/* Deployment-relative assets and explicit navigation between translated pages. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(null);
    else root.EVSEO = factory(root);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    function createSEO(win) {
        const doc = win && win.document;
        let baseURL = null;
        try {
            // Capture this synchronously: currentScript is unavailable in later handlers.
            const source = doc && doc.currentScript && doc.currentScript.src;
            if (source) baseURL = new URL('../', source);
        } catch (_) { /* The legacy root page can still use relative assets. */ }

        if (doc && win.location) {
            try {
                const current = new URL(win.location.href);
                if (current.searchParams.has('code') || current.searchParams.has('config')) {
                    let robots = doc.querySelector('meta[name="robots"]');
                    if (!robots && doc.head) {
                        robots = doc.createElement('meta');
                        robots.setAttribute('name', 'robots');
                        doc.head.appendChild(robots);
                    }
                    if (robots) robots.setAttribute('content', 'noindex,follow');
                }
            } catch (_) { /* No query value is ever copied into metadata. */ }
        }

        function asset(relative) {
            return baseURL ? new URL(relative, baseURL).href : relative;
        }

        function selectLanguage(value) {
            const i18n = win && win.EVI18n;
            if (!i18n) return null;
            const next = i18n.setLanguage(value);
            if (baseURL && i18n.pageLanguage && next !== i18n.pageLanguage && win.location) {
                const current = new URL(win.location.href);
                const filename = /\/aide\.html$/.test(current.pathname) ? 'aide.html' : '';
                const target = new URL(next + '/' + filename, baseURL);
                target.search = current.search;
                target.hash = current.hash;
                win.location.assign(target.href);
            }
            return next;
        }

        return { asset: asset, selectLanguage: selectLanguage };
    }

    const api = createSEO(root);
    api.createSEO = createSEO;
    return api;
}));
