'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const config = require('../seo.config.json');
const PUBLIC = config.baseURL;
const languages = ['en', 'fr', 'es', 'de', 'it', 'ru', 'ar', 'pt'];
const locales = { en: 'en_US', fr: 'fr_FR', es: 'es_ES', de: 'de_DE', it: 'it_IT', ru: 'ru_RU', ar: 'ar_SA', pt: 'pt_PT' };
const dictionaries = require('../js/translations.js');
const pages = ['', ...languages].flatMap(language => [false, true].map(guide => ({
    language: language || 'fr', explicit: Boolean(language), guide,
    file: (language ? language + '/' : '') + (guide ? 'aide.html' : 'index.html'),
    url: PUBLIC + (language ? language + '/' : '') + (guide ? 'aide.html' : '')
})));
const attributes = node => Object.fromEntries((node.attrs || []).map(item => [item.name, item.value]));
const text = node => (node.nodeName === '#text' ? node.value : (node.childNodes || []).map(text).join(''));
function descendants(node) { return [node, ...(node.childNodes || []).flatMap(descendants)]; }
function matching(nodes, tag, attribute, value) {
    return nodes.filter(node => node.tagName === tag && (!attribute || attributes(node)[attribute] === value));
}
function one(nodes, tag, attribute, value) {
    const matches = matching(nodes, tag, attribute, value);
    assert.equal(matches.length, 1, 'Exactly one ' + tag + ' ' + (attribute || '') + '=' + (value || ''));
    return matches[0];
}
function schemaNodes(value) {
    if (Array.isArray(value)) return value.flatMap(schemaNodes);
    if (!value || typeof value !== 'object') return [];
    return [value, ...Object.values(value).flatMap(schemaNodes)];
}

for (const page of pages) test('Published HTML has complete localized SEO before JavaScript: ' + page.file, async () => {
    const { parse } = await import('parse5');
    const source = await fs.readFile(path.join(root, page.file), 'utf8');
    const document = parse(source, { scriptingEnabled: false });
    const nodes = descendants(document);
    const html = attributes(one(nodes, 'html'));
    assert.equal(html.lang, page.language);
    assert.equal(html.dir || 'ltr', page.language === 'ar' ? 'rtl' : 'ltr');
    if (page.explicit) assert.equal(html['data-page-language'], page.language);
    else assert.equal(html['data-page-language'], undefined, 'The root retains automatic interface language');
    const head = descendants(one(nodes, 'head'));
    assert.equal(attributes(one(head, 'link', 'rel', 'canonical')).href, page.url);
    assert.equal(attributes(one(head, 'meta', 'property', 'og:url')).content, page.url);
    assert.equal(attributes(one(head, 'meta', 'property', 'og:locale')).content, locales[page.language]);
    const image = await fs.readFile(path.join(root, config.socialImage || 'img/evportal-preview.png'));
    const imageURL = new URL(config.socialImage || 'img/evportal-preview.png', PUBLIC).href;
    assert.equal(attributes(one(head, 'meta', 'property', 'og:image')).content, imageURL);
    assert.equal(attributes(one(head, 'meta', 'property', 'og:image:secure_url')).content, imageURL);
    assert.equal(attributes(one(head, 'meta', 'property', 'og:image:type')).content, 'image/png');
    assert.equal(Number(attributes(one(head, 'meta', 'property', 'og:image:width')).content), image.readUInt32BE(16));
    assert.equal(Number(attributes(one(head, 'meta', 'property', 'og:image:height')).content), image.readUInt32BE(20));
    assert.equal(attributes(one(head, 'meta', 'name', 'twitter:image')).content, imageURL);
    const title = text(one(head, 'title')).trim();
    const description = attributes(one(head, 'meta', 'name', 'description')).content;
    assert.ok(title.includes('EvPortal') && title.length > 20, 'A descriptive branded title exists');
    assert.ok(description.length > 60, 'A useful description exists in the response HTML');
    assert.doesNotMatch(title + description, /(?:static|help|seo)\.[a-zA-Z]+|undefined|\{[a-z]+\}/);
    const robots = matching(head, 'meta', 'name', 'robots');
    for (const node of robots) assert.doesNotMatch(attributes(node).content, /noindex/i, 'Normal pages are indexable without JavaScript');
    const alternates = matching(head, 'link', 'rel', 'alternate').filter(node => attributes(node).hreflang);
    assert.equal(alternates.length, 9);
    const expected = Object.fromEntries(languages.map(language => [language, PUBLIC + language + '/' + (page.guide ? 'aide.html' : '')]));
    expected['x-default'] = PUBLIC + (page.guide ? 'aide.html' : '');
    assert.deepEqual(Object.fromEntries(alternates.map(node => [attributes(node).hreflang, attributes(node).href])), expected);

    const structured = matching(head, 'script', 'type', 'application/ld+json').flatMap(node => schemaNodes(JSON.parse(text(node))));
    const type = page.guide ? 'WebPage' : 'WebApplication';
    const entity = structured.find(node => node['@type'] === type || Array.isArray(node['@type']) && node['@type'].includes(type));
    assert.ok(entity, type + ' structured data exists');
    assert.equal(entity.url, page.url);
    assert.ok(entity.inLanguage === page.language || Array.isArray(entity.inLanguage) && entity.inLanguage.includes(page.language));
    if (!page.guide) assert.equal(entity.softwareHelp.url, new URL((page.explicit ? page.language + '/' : '') + 'aide.html', PUBLIC).href);
    assert.ok(structured.every(node => !('aggregateRating' in node) && !('reviewRating' in node) && node['@type'] !== 'FAQPage'), 'No invented rating or FAQ rich result markup');

    const translations = dictionaries[page.language];
    for (const node of nodes) {
        const attrs = attributes(node);
        const key = attrs['data-i18n'];
        if (key && Object.hasOwn(translations, key) && !/\{[a-zA-Z]/.test(translations[key])) {
            assert.equal(text(node).trim(), translations[key].trim(), page.file + ': untranslated response text ' + key);
        }
        for (const name of ['content', 'aria-label', 'title', 'placeholder', 'alt']) {
            const attributeKey = attrs['data-i18n-' + name];
            if (attributeKey && Object.hasOwn(translations, attributeKey) && !/\{[a-zA-Z]/.test(translations[attributeKey])) {
                assert.equal(attrs[name], translations[attributeKey], page.file + ': untranslated ' + name + ' ' + attributeKey);
            }
        }
    }
    if (page.guide) {
        const nav = nodes.find(node => node.tagName === 'nav' && (attributes(node).class || '').split(/\s+/).includes('seo-languages'));
        assert.ok(nav, 'A crawlable language navigation is present in the guide');
        const links = matching(descendants(nav), 'a');
        assert.equal(links.length, 8);
        assert.deepEqual(links.map(node => new URL(attributes(node).href, page.url).href).sort(), languages.map(language => expected[language]).sort());
        assert.ok(links.every(node => text(node).trim()), 'Language links have visible names');
        assert.equal(text(one(nodes, 'h1')), translations['help.heading']);
        assert.ok(matching(nodes, 'p').map(text).join(' ').length > 1000, 'The guide has real translated content without JavaScript');
        const preview = one(nodes, 'img', 'data-i18n-alt', 'help.dashboardPreviewAlt');
        assert.equal(attributes(preview).alt, translations['help.dashboardPreviewAlt']);
        assert.equal(attributes(preview).width, '1440');
        assert.equal(attributes(preview).height, '900');
        assert.equal(attributes(preview).loading, 'lazy', 'The guide image does not block the first view');
    } else {
        const help = nodes.find(node => node.tagName === 'a' && (attributes(node).class || '').split(/\s+/).includes('settings-help'));
        assert.ok(help);
        assert.equal(new URL(attributes(help).href, page.url).href, PUBLIC + (page.explicit ? page.language + '/' : '') + 'aide.html');
    }
    const base = matching(head, 'base')[0];
    const assetBase = base ? new URL(attributes(base).href, page.url).href : page.url;
    for (const node of nodes) {
        const attrs = attributes(node);
        const asset = ['script', 'img'].includes(node.tagName) ? attrs.src
            : node.tagName === 'link' && ['stylesheet', 'icon', 'manifest', 'apple-touch-icon'].includes(attrs.rel) ? attrs.href : null;
        if (!asset || /^(?:data:|#)/.test(asset)) continue;
        const url = new URL(asset, assetBase);
        assert.ok(url.href.startsWith(PUBLIC), 'Startup asset remains local: ' + url.pathname);
        await fs.access(path.join(root, decodeURIComponent(url.pathname.slice(new URL(PUBLIC).pathname.length))));
    }
});

test('Sitemap contains exactly 18 canonical URLs and no transfer data or invented dates', async () => {
    const source = await fs.readFile(path.join(root, 'sitemap.xml'), 'utf8');
    const urls = [...source.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map(match => match[1]);
    assert.equal(urls.length, 18);
    assert.deepEqual(urls.sort(), pages.map(page => page.url).sort());
    assert.equal(new Set(urls).size, urls.length);
    assert.ok(urls.every(value => !new URL(value).search && !new URL(value).hash));
    assert.doesNotMatch(source, /<(?:lastmod|priority|changefreq)>/, 'Do not invent update dates or crawler priorities');
});

test('SEO build output is reproducible and committed artifacts are current', () => {
    execFileSync(process.execPath, ['scripts/build-seo.mjs', '--check'], { cwd: root, stdio: 'pipe' });
});
