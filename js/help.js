/* Kept external so the help page can reject inline executable scripts. */
(function () {
    'use strict';
    try {
        document.documentElement.dataset.theme = JSON.parse(localStorage.getItem('evportal.state.v2') || '{}').theme === 'light' ? 'light' : 'dark';
    } catch (_) { document.documentElement.dataset.theme = 'dark'; }
    document.addEventListener('DOMContentLoaded', function () {
        const i18n = window.EVI18n;
        const selector = document.getElementById('languageSelect');
        if (!i18n || !selector) return;
        selector.value = i18n.language;
        selector.addEventListener('change', function () {
            if (window.EVSEO) window.EVSEO.selectLanguage(selector.value);
            else i18n.setLanguage(selector.value);
        });
        window.addEventListener('evportal:languagechange', function () { selector.value = i18n.language; });
    });
}());
