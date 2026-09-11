/* Generate crawlable translations from the editable root pages and locale bundle. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parse, parseFragment, serialize } from 'parse5';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const translations = require('../js/translations.js');
const languages = ['en', 'fr', 'es', 'de', 'it', 'ru', 'ar', 'pt'];
const names = { en: '🇬🇧 English', fr: '🇫🇷 Français', es: '🇪🇸 Español', de: '🇩🇪 Deutsch', it: '🇮🇹 Italiano', ru: '🇷🇺 Русский', ar: '🇸🇦 العربية', pt: '🇵🇹 Português' };
const locales = { en: 'en_US', fr: 'fr_FR', es: 'es_ES', de: 'de_DE', it: 'it_IT', ru: 'ru_RU', ar: 'ar_SA', pt: 'pt_PT' };
const config = JSON.parse(fs.readFileSync(path.join(root, 'seo.config.json'), 'utf8'));
const base = new URL(config.baseURL);
if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !base.pathname.endsWith('/')) throw new Error('seo.config.json: baseURL must be a clean HTTPS directory URL');
const checkOnly = process.argv.includes('--check');
if (process.argv.slice(2).some(value => value !== '--check')) throw new Error('Only --check is supported');
const output = new Map();
const source = Object.fromEntries(['index.html', 'aide.html'].map(name => [name, fs.readFileSync(path.join(root, name), 'utf8')]));

function attr(node, name) { return node.attrs?.find(item => item.name === name)?.value; }
function set(node, name, value) {
    const old = node.attrs.find(item => item.name === name);
    if (old) old.value = String(value); else node.attrs.push({ name, value: String(value) });
}
function unset(node, name) { node.attrs = node.attrs.filter(item => item.name !== name); }
function walk(node, visit) { visit(node); for (const child of node.childNodes || []) walk(child, visit); }
function all(node, predicate) { const found = []; walk(node, child => { if (predicate(child)) found.push(child); }); return found; }
function remove(node) { node.parentNode.childNodes = node.parentNode.childNodes.filter(child => child !== node); }
function append(parent, node) { node.parentNode = parent; parent.childNodes.push(node); return node; }
function text(node, value) { node.childNodes = [{ nodeName: '#text', value: String(value), parentNode: node }]; }
function make(tag, attributes = {}, value) {
    const node = parseFragment('<' + tag + '></' + tag + '>').childNodes[0];
    for (const [name, item] of Object.entries(attributes)) set(node, name, item);
    if (value !== undefined) text(node, value);
    return node;
}
function escapeXML(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
function pageURL(kind, language) { return new URL((language ? language + '/' : '') + (kind === 'help' ? 'aide.html' : ''), base).href; }
function t(language, key) {
    const value = translations[language]?.[key];
    if (!value) throw new Error(language + ': missing ' + key + '; build locales first');
    return value;
}
function translate(doc, language) {
    walk(doc, node => {
        if (!node.attrs) return;
        for (const kind of ['text', 'content', 'title', 'placeholder', 'aria-label', 'value']) {
            const key = attr(node, 'data-i18n' + (kind === 'text' ? '' : '-' + kind));
            if (!key) continue;
            const params = JSON.parse(attr(node, 'data-i18n-params') || '{}');
            const value = t(language, key).replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(params, name) ? String(params[name]) : match);
            if (kind === 'text') text(node, value); else set(node, kind, value);
        }
        if (node.tagName === 'option' && languages.includes(attr(node, 'value'))) {
            if (attr(node, 'value') === language) set(node, 'selected', ''); else unset(node, 'selected');
        }
    });
}
function build(kind, language, localized) {
    const filename = kind === 'help' ? 'aide.html' : 'index.html';
    const doc = parse(source[filename], { scriptingEnabled: false });
    const html = all(doc, node => node.tagName === 'html')[0];
    const head = all(doc, node => node.tagName === 'head')[0];
    const url = pageURL(kind, localized ? language : null);
    set(html, 'lang', language); set(html, 'dir', language === 'ar' ? 'rtl' : 'ltr');
    if (localized) set(html, 'data-page-language', language); else unset(html, 'data-page-language');
    const generated = all(doc, node => attr(node, 'data-seo-generated') !== undefined);
    generated.forEach(remove);
    all(head, node => node.tagName === 'meta' && (attr(node, 'name') === 'description'
        || attr(node, 'name')?.startsWith('twitter:') || attr(node, 'property')?.startsWith('og:'))).forEach(remove);
    // The two root files stay editable sources. All generated nodes are replaced,
    // so repeating the build never duplicates metadata or language navigation.
    const metadata = (attribute, name, value, translationKey) => {
        const found = all(head, node => node.tagName === 'meta' && attr(node, attribute) === name);
        const node = found.shift() || append(head, make('meta', { [attribute]: name }));
        found.forEach(remove); set(node, 'content', value);
        if (translationKey) set(node, 'data-i18n-content', translationKey);
        return node;
    };
    const titleKey = kind === 'help' ? 'help.title' : 'static.title';
    const descriptionKey = kind === 'help' ? 'help.description' : 'static.description';
    const title = all(head, node => node.tagName === 'title')[0];
    set(title, 'data-i18n', titleKey);
    metadata('name', 'description', t(language, descriptionKey), descriptionKey);
    metadata('name', 'robots', 'index, follow, max-image-preview:large');
    const canonicals = all(head, node => node.tagName === 'link' && attr(node, 'rel') === 'canonical');
    const canonical = canonicals.shift() || append(head, make('link', { rel: 'canonical' }));
    canonicals.forEach(remove); set(canonical, 'href', url);
    all(head, node => node.tagName === 'link' && attr(node, 'hreflang') !== undefined).forEach(remove);
    for (const code of [...languages, 'x-default']) append(head, make('link', {
        rel: 'alternate', hreflang: code, href: pageURL(kind, code === 'x-default' ? null : code), 'data-seo-generated': ''
    }));
    metadata('property', 'og:type', 'website');
    metadata('property', 'og:site_name', 'EvPortal');
    metadata('property', 'og:locale', locales[language]);
    all(head, node => node.tagName === 'meta' && attr(node, 'property') === 'og:locale:alternate').forEach(remove);
    for (const code of languages.filter(code => code !== language)) append(head, make('meta', { property: 'og:locale:alternate', content: locales[code], 'data-seo-generated': '' }));
    metadata('property', 'og:title', t(language, titleKey), titleKey);
    metadata('property', 'og:description', t(language, descriptionKey), descriptionKey);
    metadata('property', 'og:url', url);
    const image = new URL('img/evportal-preview.png', base).href;
    metadata('property', 'og:image', image);
    metadata('property', 'og:image:width', '1200'); metadata('property', 'og:image:height', '630');
    metadata('property', 'og:image:alt', t(language, 'static.previewAlt'), 'static.previewAlt');
    metadata('name', 'twitter:card', 'summary_large_image');
    metadata('name', 'twitter:title', t(language, titleKey), titleKey);
    metadata('name', 'twitter:description', t(language, descriptionKey), descriptionKey);
    metadata('name', 'twitter:image', image);
    metadata('name', 'twitter:image:alt', t(language, 'static.previewAlt'), 'static.previewAlt');
    for (const [provider, name] of [['google', 'google-site-verification'], ['bing', 'msvalidate.01']]) {
        const value = config.verification?.[provider]?.trim();
        if (value) {
            const node = metadata('name', name, value); set(node, 'data-seo-generated', '');
        }
    }
    all(head, node => node.tagName === 'script' && attr(node, 'type') === 'application/ld+json').forEach(remove);
    const applicationURL = pageURL('portal', localized ? language : null);
    const schema = kind === 'portal' ? {
        '@context': 'https://schema.org', '@type': 'WebApplication', '@id': url + '#application', name: 'EvPortal', url,
        description: t(language, descriptionKey), applicationCategory: 'UtilitiesApplication',
        operatingSystem: t(language, 'seo.operatingSystem'), browserRequirements: t(language, 'seo.browserRequirements'),
        inLanguage: localized ? language : languages, isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, image,
        author: { '@type': 'Person', name: 'DrSliD' }, sameAs: 'https://github.com/drslid/EvPortal',
        featureList: ['seo.featureFavorites', 'seo.featureDrag', 'seo.featureQR', 'seo.featureBackup'].map(key => t(language, key))
    } : {
        '@context': 'https://schema.org', '@graph': [
            { '@type': 'WebPage', '@id': url + '#page', name: t(language, titleKey), description: t(language, descriptionKey), url, inLanguage: language,
                isAccessibleForFree: true, about: { '@type': 'WebApplication', name: 'EvPortal', url: applicationURL },
                isPartOf: { '@type': 'WebSite', name: 'EvPortal', url: base.href } },
            { '@type': 'BreadcrumbList', itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'EvPortal', item: applicationURL },
                { '@type': 'ListItem', position: 2, name: t(language, 'help.heading'), item: url }
            ] }
        ]
    };
    append(head, make('script', { type: 'application/ld+json', 'data-seo-generated': '' }, JSON.stringify(schema, null, 2).replace(/</g, '\\u003c')));
    if (kind === 'help') {
        const main = all(doc, node => node.tagName === 'main')[0];
        const footer = all(main, node => attr(node, 'class') === 'help-footer')[0];
        const nav = make('nav', { class: 'seo-languages', 'aria-label': t(language, 'seo.languages'), 'data-i18n-aria-label': 'seo.languages', 'data-seo-generated': '' });
        for (const code of languages) {
            const link = make('a', { href: (localized ? '../' : './') + code + '/aide.html', lang: code, hreflang: code }, names[code]);
            if (localized && code === language) set(link, 'aria-current', 'page');
            append(nav, link);
        }
        nav.parentNode = main;
        main.childNodes.splice(main.childNodes.indexOf(footer), 0, nav);
    }
    translate(doc, language);
    if (localized) {
        walk(doc, node => {
            if (!node.attrs) return;
            for (const name of ['src', 'href', 'content']) {
                const value = attr(node, name);
                if (value && /^\.\/(?:js|css|img|fonts)\//.test(value)) set(node, name, '../' + value.slice(2));
            }
        });
    }
    // parse5 moves whitespace after </html> into <body>. Normalize that final
    // text node so each rebuild cannot add another blank line to every page.
    const body = all(doc, node => node.tagName === 'body')[0];
    while (body.childNodes.at(-1)?.nodeName === '#text' && !body.childNodes.at(-1).value.trim()) body.childNodes.pop();
    append(body, { nodeName: '#text', value: '\n' });
    const headContent = head.childNodes.filter(node => node.nodeName !== '#text' || node.value.trim());
    head.childNodes = [];
    for (const node of headContent) {
        append(head, { nodeName: '#text', value: '\n    ' });
        append(head, node);
    }
    append(head, { nodeName: '#text', value: '\n' });
    output.set((localized ? language + '/' : '') + filename, serialize(doc).trimEnd() + '\n');
}
for (const kind of ['portal', 'help']) {
    build(kind, 'fr', false);
    for (const language of languages) build(kind, language, true);
}
const urls = [];
for (const kind of ['portal', 'help']) for (const language of [null, ...languages]) urls.push(pageURL(kind, language));
output.set('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map(url => '    <url><loc>' + escapeXML(url) + '</loc></url>').join('\n') + '\n</urlset>\n');
output.set('robots.txt', 'User-agent: *\nDisallow:\n\n# This project file is not the host-root /robots.txt.\n# Submit the sitemap directly in Google Search Console and Bing Webmaster Tools.\nSitemap: ' + new URL('sitemap.xml', base).href + '\n');
const changed = [];
for (const [filename, value] of output) {
    const target = path.join(root, filename);
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== value) {
        changed.push(filename);
        if (!checkOnly) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value); }
    }
}
if (checkOnly && changed.length) { console.error('Rebuild SEO pages: ' + changed.join(', ')); process.exitCode = 1; }
else console.log((checkOnly ? 'Verified' : 'Built') + ' 18 crawlable HTML pages, sitemap and robots.txt.');
