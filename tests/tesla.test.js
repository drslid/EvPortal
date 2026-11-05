'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Tesla = require('../js/tesla.js');

test('theater redirect preserves deployment, shared configuration, and fragment', () => {
    const current = 'https://example.org/EvPortal/?code=evportal-09-10&lang=fr#favorites';
    const url = new URL(Tesla.theaterURL(current));
    assert.equal(url.origin + url.pathname, 'https://www.youtube.com/redirect');
    assert.equal(url.searchParams.get('q'), current);
    for (const bad of ['javascript:alert(1)', 'file:///tmp/index.html', 'https://user:password@example.org/']) {
        assert.throws(() => Tesla.theaterURL(bad));
    }
});

test('theater never discloses private pairing or recovery capabilities to YouTube', () => {
    for (const hash of ['receive=private-pairing-capability', 'download=private-read-capability', 'sync=EV1.private-recovery-capability']) {
        const forwarded = new URL(new URL(Tesla.theaterURL('https://example.org/EvPortal/?lang=fr#' + hash)).searchParams.get('q'));
        assert.equal(forwarded.hash, '');
        assert.equal(forwarded.searchParams.get('lang'), 'fr');
    }
    const forwarded = new URL(new URL(Tesla.theaterURL('https://example.org/EvPortal/?code=EV1.private&token=private&key=private&lang=en#favorites')).searchParams.get('q'));
    assert.equal(forwarded.search, '?lang=en');
    assert.equal(forwarded.hash, '#favorites');
});

test('Tesla uses the Theater redirect even when the standard Fullscreen API is disabled', async () => {
    let redirected;
    const environment = {
        navigator: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Tesla/2026.20' },
        location: { href: 'https://example.org/EvPortal/?code=shared-09-10', assign: url => { redirected = url; } },
        document: { fullscreenEnabled: false, documentElement: {} }
    };
    assert.equal(await Tesla.enterFullscreen(environment), 'theater');
    assert.equal(new URL(redirected).searchParams.get('q'), environment.location.href);
});

test('manual Tesla mode covers firmware without a Tesla user agent', async () => {
    let redirected;
    const environment = {
        navigator: { userAgent: 'Mozilla/5.0 Chrome/130' },
        location: { href: 'https://example.org/portal/', assign: url => { redirected = url; } },
        document: { documentElement: {} }
    };
    assert.equal(await Tesla.enterFullscreen(environment, true), 'theater');
    assert.ok(redirected.startsWith('https://www.youtube.com/redirect?q='));
});

test('ordinary browsers enter and leave native fullscreen, or report lack of support', async () => {
    let enters = 0;
    let exits = 0;
    const environment = {
        navigator: { userAgent: 'Mozilla/5.0 Chrome/130' },
        document: { fullscreenElement: null, documentElement: { requestFullscreen: async () => { enters++; } }, exitFullscreen: async () => { exits++; } }
    };
    assert.equal(await Tesla.enterFullscreen(environment), 'browser');
    environment.document.fullscreenElement = {};
    await Tesla.enterFullscreen(environment);
    assert.equal(enters, 1);
    assert.equal(exits, 1);
    environment.document.fullscreenElement = null;
    delete environment.document.documentElement.requestFullscreen;
    await assert.rejects(Tesla.enterFullscreen(environment), /n’est pas disponible/);
});
