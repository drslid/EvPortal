const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const context = { window: {} };
for (const file of ['catalog.js', 'icons.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), context);
}
const catalog = JSON.parse(JSON.stringify(context.window.EV_CATALOG));
const services = catalog.categories.flatMap(category => category.shortcuts);
const find = id => services.find(service => service.serviceId === id);
const icons = context.window.EV_ICONS;
const sources = JSON.parse(fs.readFileSync(path.join(root, 'img/services/sources.json'), 'utf8'));

test('catalogue services have one stable identity, one URL and valid category memberships', () => {
    assert.equal(catalog.version, '2026-09-curated');
    assert.equal(services.length, 147);
    assert.equal(new Set(services.map(service => service.serviceId)).size, services.length);
    assert.equal(new Set(services.map(service => service.url)).size, services.length);
    const categories = new Set(catalog.categories.map(category => category.id));
    for (const category of catalog.categories) {
        for (const service of category.shortcuts) {
            assert.match(service.serviceId, /^[a-z0-9][a-z0-9-]*$/);
            assert.equal(new URL(service.url).protocol, 'https:');
            assert.ok(service.categoryIds.includes(category.id), service.name);
            assert.equal(new Set(service.categoryIds).size, service.categoryIds.length);
            assert.ok(service.categoryIds.every(id => categories.has(id)), service.name);
            if (service.countries) {
                assert.ok(service.countries.length > 0, service.name);
                assert.ok(service.countries.every(country => /^[A-Z]{2}$/.test(country)), service.name);
                assert.equal(new Set(service.countries).size, service.countries.length);
            }
        }
    }
});

test('shared categories retain one ABRP, CANAL+ and Pluto identity, while Gulli belongs to TV', () => {
    assert.deepEqual(find('abrp').categoryIds, ['charging', 'navigation']);
    assert.deepEqual(find('canal-plus').categoryIds, ['cinema', 'tv']);
    assert.deepEqual(find('pluto-tv').categoryIds, ['cinema', 'tv']);
    assert.equal(find('pluto-tv').url, 'https://pluto.tv/');
    for (const url of ['https://pluto.tv/fr/', 'https://pluto.tv/fr/watch/live-tv/', 'https://pluto.tv/live-tv']) {
        assert.ok(find('pluto-tv').legacyAliases.some(alias => alias.url === url));
        assert.equal(catalog.replacements.find(replacement => replacement.from === url).to, 'https://pluto.tv/');
    }
    assert.deepEqual(find('gulli').categoryIds, ['tv']);
    assert.deepEqual(find('gulli').legacyCategoryIds, ['cinema', 'tv']);
    assert.ok(catalog.categories.find(category => category.id === 'tv').shortcuts.includes(find('gulli')));
});

test('default games are one portal and four direct games; social and work services remain addable', () => {
    const games = catalog.categories.find(category => category.id === 'games').shortcuts;
    assert.deepEqual(games.filter(service => service.defaultIncluded !== false).map(service => service.name).sort(),
        ['2048', 'CrazyGames', 'Infinite Craft', 'Lichess', 'Little Alchemy 2']);
    assert.ok(catalog.categories.find(category => category.id === 'social').shortcuts.every(service => service.defaultIncluded === false));
    for (const name of ['Google Drive', 'Gmail', 'Google Agenda', 'GitHub', 'Notion', 'Google Docs', 'Outlook', 'OneDrive', 'Poki']) {
        assert.equal(services.find(service => service.name === name).defaultIncluded, false, name);
    }
    for (const name of ['DeepL', 'Wikipédia', 'FAST.com']) {
        assert.notEqual(services.find(service => service.name === name).defaultIncluded, false, name);
    }
});

test('known regional recommendations follow publisher availability, including recent TF1+ markets', () => {
    assert.deepEqual(find('crave').countries, ['CA']);
    assert.deepEqual(find('starz').countries, ['US']);
    assert.deepEqual(find('iheartradio').countries, ['US', 'CA', 'MX', 'AU', 'NZ']);
    assert.deepEqual(find('rtbf-auvio').countries, ['BE']);
    assert.deepEqual(find('molotov').countries, ['FR']);
    assert.ok(['FR', 'BE', 'LU', 'CH'].every(country => find('tf1-plus').countries.includes(country)));
    assert.equal(find('tf1-plus').countries.length, 26);
});

test('all fifteen additions have the requested address and a complete local logo with provenance', () => {
    const additions = {
        justwatch: 'https://www.justwatch.com/fr',
        onf: 'https://www.onf.ca/',
        somafm: 'https://somafm.com/',
        'radio-paradise': 'https://radioparadise.com/',
        mynoise: 'https://mynoise.net/',
        'nasa-plus': 'https://plus.nasa.gov/',
        'electricity-maps': 'https://app.electricitymaps.com/',
        'little-alchemy-2': 'https://littlealchemy2.com/',
        'infinite-craft': 'https://neal.fun/infinite-craft/',
        wikivoyage: 'https://fr.wikivoyage.org/wiki/Accueil',
        'atlas-obscura': 'https://www.atlasobscura.com/',
        techmeme: 'https://www.techmeme.com/',
        'zoom-earth': 'https://zoom.earth/',
        lightningmaps: 'https://www.lightningmaps.org/',
        'fast-com': 'https://fast.com/'
    };
    for (const [id, url] of Object.entries(additions)) {
        const service = find(id);
        assert.equal(service.url, url, id);
        assert.ok(service.description.length > 20, id);
        const host = new URL(url).hostname.replace(/^www\./, '');
        assert.equal(icons[host], './img/services/' + sources[host].file, id);
        const bytes = fs.readFileSync(path.join(root, icons[host]));
        assert.equal(bytes.length, sources[host].bytes, id);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), sources[host].sha256, id);
        assert.ok(sources[host].source.startsWith('https://'), id);
        assert.ok(sources[host].width <= 128 && sources[host].height <= 128, id);
    }
});
