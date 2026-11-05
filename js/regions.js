/* Editorial suggestions and device preferences. No location detection or rights inference. */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.EVRegions = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';
    const STORAGE_KEY = 'evportal:regions:v1';
    const LANGUAGES = Object.freeze([
        { code: 'fr', label: 'Français' }, { code: 'en', label: 'English' },
        { code: 'de', label: 'Deutsch' }, { code: 'es', label: 'Español' },
        { code: 'it', label: 'Italiano' }, { code: 'pt', label: 'Português' },
        { code: 'ru', label: 'Русский' }, { code: 'ar', label: 'العربية' }
    ].map(Object.freeze));
    const countryRows = [
        ['WORLD', 'Tous les pays', 'All countries'], ['FR', 'France', 'France'],
        ['US', 'États-Unis', 'United States'], ['GB', 'Royaume-Uni', 'United Kingdom'],
        ['DE', 'Allemagne', 'Germany'], ['ES', 'Espagne', 'Spain'], ['IT', 'Italie', 'Italy'],
        ['PT', 'Portugal', 'Portugal'], ['BR', 'Brésil', 'Brazil'], ['CA', 'Canada', 'Canada'],
        ['BE', 'Belgique', 'Belgium'], ['CH', 'Suisse', 'Switzerland'],
        ['AU', 'Australie', 'Australia'], ['AE', 'Émirats arabes unis', 'United Arab Emirates'],
        ['NL', 'Pays-Bas', 'Netherlands'], ['LU', 'Luxembourg', 'Luxembourg']
    ];
    const COUNTRIES = Object.freeze(countryRows.map(function (row) {
        return Object.freeze({ code: row[0], labels: Object.freeze({ fr: row[1], en: row[2] }) });
    }));
    const languageCodes = LANGUAGES.map(function (entry) { return entry.code; });
    const countryCodes = COUNTRIES.map(function (entry) { return entry.code; });
    const translations = {
        en: { title: 'Content preferences', country: 'Country for suggestions', contentLanguages: 'Content languages', allLanguages: 'All languages', allCountries: 'All countries', help: 'The interface language, content languages and country are independent. Existing shortcuts and favorites stay saved.', availability: 'Availability depends on the provider and your location.', untested: 'Not tested in the Tesla browser', saved: 'Content preferences saved', unknown: 'Availability unknown', editorial: 'Editorial selection', empty: 'No suggestions match these preferences. Your saved shortcuts are unchanged.' },
        fr: { title: 'Préférences de contenu', country: 'Pays des suggestions', contentLanguages: 'Langues des contenus', allLanguages: 'Toutes les langues', allCountries: 'Tous les pays', help: 'La langue de l’interface, les langues des contenus et le pays sont indépendants. Vos raccourcis et favoris restent enregistrés.', availability: 'La disponibilité dépend du fournisseur et de votre position.', untested: 'Non testé dans le navigateur Tesla', saved: 'Préférences de contenu enregistrées', unknown: 'Disponibilité inconnue', editorial: 'Sélection éditoriale', empty: 'Aucune suggestion ne correspond. Vos raccourcis enregistrés restent disponibles.' },
        de: { title: 'Inhaltseinstellungen', country: 'Land für Vorschläge', contentLanguages: 'Inhaltssprachen', allLanguages: 'Alle Sprachen', allCountries: 'Alle Länder', help: 'Oberflächensprache, Inhaltssprachen und Land sind unabhängig. Gespeicherte Verknüpfungen und Favoriten bleiben erhalten.', availability: 'Die Verfügbarkeit hängt vom Anbieter und Ihrem Standort ab.', untested: 'Im Tesla-Browser nicht getestet', saved: 'Inhaltseinstellungen gespeichert', unknown: 'Verfügbarkeit unbekannt', editorial: 'Redaktionelle Auswahl', empty: 'Keine passenden Vorschläge. Gespeicherte Verknüpfungen bleiben erhalten.' },
        es: { title: 'Preferencias de contenido', country: 'País de las sugerencias', contentLanguages: 'Idiomas del contenido', allLanguages: 'Todos los idiomas', allCountries: 'Todos los países', help: 'El idioma de la interfaz, los idiomas del contenido y el país son independientes. Se conservan tus accesos y favoritos.', availability: 'La disponibilidad depende del proveedor y de tu ubicación.', untested: 'Sin probar en el navegador Tesla', saved: 'Preferencias de contenido guardadas', unknown: 'Disponibilidad desconocida', editorial: 'Selección editorial', empty: 'No hay sugerencias para estas preferencias. Tus accesos guardados se conservan.' },
        it: { title: 'Preferenze dei contenuti', country: 'Paese dei suggerimenti', contentLanguages: 'Lingue dei contenuti', allLanguages: 'Tutte le lingue', allCountries: 'Tutti i paesi', help: 'Lingua dell’interfaccia, lingue dei contenuti e paese sono indipendenti. Collegamenti e preferiti salvati rimangono disponibili.', availability: 'La disponibilità dipende dal fornitore e dalla tua posizione.', untested: 'Non testato nel browser Tesla', saved: 'Preferenze dei contenuti salvate', unknown: 'Disponibilità sconosciuta', editorial: 'Selezione editoriale', empty: 'Nessun suggerimento corrispondente. I collegamenti salvati rimangono disponibili.' },
        pt: { title: 'Preferências de conteúdo', country: 'País das sugestões', contentLanguages: 'Idiomas do conteúdo', allLanguages: 'Todos os idiomas', allCountries: 'Todos os países', help: 'O idioma da interface, os idiomas do conteúdo e o país são independentes. Os atalhos e favoritos guardados são mantidos.', availability: 'A disponibilidade depende do fornecedor e da sua localização.', untested: 'Não testado no navegador Tesla', saved: 'Preferências de conteúdo guardadas', unknown: 'Disponibilidade desconhecida', editorial: 'Seleção editorial', empty: 'Não há sugestões correspondentes. Os atalhos guardados são mantidos.' },
        ru: { title: 'Настройки контента', country: 'Страна для рекомендаций', contentLanguages: 'Языки контента', allLanguages: 'Все языки', allCountries: 'Все страны', help: 'Язык интерфейса, языки контента и страна выбираются независимо. Сохранённые ссылки и избранное остаются.', availability: 'Доступность зависит от поставщика и вашего местоположения.', untested: 'Не проверено в браузере Tesla', saved: 'Настройки контента сохранены', unknown: 'Доступность неизвестна', editorial: 'Редакционная подборка', empty: 'Подходящих рекомендаций нет. Сохранённые ссылки остаются доступными.' },
        ar: { title: 'تفضيلات المحتوى', country: 'بلد الاقتراحات', contentLanguages: 'لغات المحتوى', allLanguages: 'كل اللغات', allCountries: 'كل البلدان', help: 'لغة الواجهة ولغات المحتوى والبلد مستقلة. تبقى الاختصارات والمفضلة المحفوظة.', availability: 'يعتمد التوفر على المزوّد وموقعك.', untested: 'لم يُختبر في متصفح تسلا', saved: 'تم حفظ تفضيلات المحتوى', unknown: 'التوفر غير معروف', editorial: 'اختيار تحريري', empty: 'لا توجد اقتراحات مطابقة. تبقى الاختصارات المحفوظة متاحة.' }
    };
    function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function language(value) { return typeof value === 'string' && languageCodes.includes(value.split(/[-_]/)[0].toLowerCase()) ? value.split(/[-_]/)[0].toLowerCase() : 'en'; }
    function messages(uiLang) { return Object.assign({}, translations.en, translations[language(uiLang)]); }
    function countryLabel(code, uiLang) {
        if (code === 'WORLD') return messages(uiLang).allCountries;
        const entry = COUNTRIES.find(function (country) { return country.code === code; });
        if (!entry) return code;
        try { return new Intl.DisplayNames([language(uiLang)], { type: 'region' }).of(code); }
        catch (_) { return entry.labels[language(uiLang)] || entry.labels.en; }
    }
    function invalid() {
        const error = new TypeError('Invalid content preferences.');
        error.code = 'INVALID_REGION_PREFERENCES';
        return error;
    }
    function defaults() { return { version: 1, country: 'WORLD', contentLanguages: [] }; }
    function validate(value, initial, isPatch) {
        if (!object(value)) throw invalid();
        const allowed = isPatch ? ['country', 'contentLanguages'] : ['version', 'country', 'contentLanguages'];
        if (Object.keys(value).some(function (key) { return !allowed.includes(key); })) throw invalid();
        if (!isPatch && value.version !== 1) throw invalid();
        const result = clone(initial);
        if (Object.prototype.hasOwnProperty.call(value, 'country')) {
            if (!countryCodes.includes(value.country)) throw invalid();
            result.country = value.country;
        }
        if (Object.prototype.hasOwnProperty.call(value, 'contentLanguages')) {
            if (!Array.isArray(value.contentLanguages) || value.contentLanguages.length > languageCodes.length ||
                value.contentLanguages.some(function (code) { return !languageCodes.includes(code); })) throw invalid();
            result.contentLanguages = Array.from(new Set(value.contentLanguages));
        }
        return result;
    }
    function normalizePreferences(value) {
        if (!value) return defaults();
        try { return validate(Object.assign({ version: 1 }, value), defaults(), false); }
        catch (_) { return defaults(); }
    }
    function createPreferences(storage) {
        if (storage === undefined) { try { storage = root.localStorage || null; } catch (_) { storage = null; } }
        let current = defaults();
        let canWrite = Boolean(storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function');
        let persistent = canWrite;
        try {
            const raw = canWrite ? storage.getItem(STORAGE_KEY) : null;
            if (raw !== null) current = validate(JSON.parse(raw), current, false);
        } catch (_) { canWrite = false; persistent = false; }
        const api = {
            read: function () { return clone(current); },
            patch: function (changes) {
                const next = validate(changes, current, true);
                persistent = false;
                if (canWrite) { try { storage.setItem(STORAGE_KEY, JSON.stringify(next)); persistent = true; } catch (_) {} }
                current = next;
                return clone(current);
            }
        };
        Object.defineProperty(api, 'persistent', { enumerable: true, get: function () { return persistent; } });
        return api;
    }

    const metadata = Object.create(null);
    function annotate(ids, langs, countries) {
        ids.split(' ').forEach(function (id) { metadata[id] = { contentLanguages: langs || [], editorialCountries: countries || [] }; });
    }
    annotate('radio-france fip france-inter france-culture france-tv tf1-plus m6-plus gulli tv5mondeplus rtbf-auvio onf cnews bfm-tv 20-minutes le-monde le-figaro liberation l-express franceinfo mediapart rtbf-info automobile-propre', ['fr']);
    annotate('reuters bbc-news the-guardian the-new-york-times washington-post cnn al-jazeera techmeme nasa-plus somafm radio-paradise', ['en']);
    annotate('infotrafic bison-fute sytadin meteo-france vigilance-meteo', ['fr'], ['FR']);
    annotate('la-chaine-meteo', ['fr']);
    annotate('2048 1001-jeux jeux-gratuits-com', ['fr']);
    annotate('crave', ['fr', 'en'], ['CA']);
    annotate('starz', ['en'], ['US']);
    annotate('molotov', ['fr'], ['FR']);
    annotate('iheartradio', ['en'], ['US', 'CA', 'AU']);
    annotate('rtbf-auvio rtbf-info', ['fr'], ['BE']);

    const variants = Object.create(null);
    function languageVariants(id, values, extra) {
        variants[id] = { values: values, known: Array.from(new Set(Object.values(values).concat(extra || []))), choose: function (prefs, uiLang) {
            const preferred = prefs.contentLanguages.length ? prefs.contentLanguages : [language(uiLang)];
            return values[preferred.find(function (code) { return values[code]; })] || values.en || Object.values(values)[0];
        } };
    }
    const wiki = {}, waze = {}, euronews = {}, france24 = {};
    languageCodes.forEach(function (code) {
        wiki[code] = 'https://' + code + '.wikipedia.org/';
        waze[code] = 'https://www.waze.com/live-map/?locale=' + code;
    });
    ['fr', 'en', 'de', 'es', 'it', 'pt', 'ru', 'ar'].forEach(function (code) {
        euronews[code] = 'https://' + (code === 'en' ? 'www' : code) + '.euronews.com/live';
    });
    ['fr', 'en', 'es', 'ar'].forEach(function (code) { france24[code] = 'https://www.france24.com/' + code + '/'; });
    languageVariants('wikipedia', wiki);
    languageVariants('waze', waze, ['https://www.waze.com/']);
    languageVariants('euronews', euronews);
    languageVariants('france-24', france24);
    languageVariants('arte', { fr: 'https://www.arte.tv/fr/', en: 'https://www.arte.tv/en/', de: 'https://www.arte.tv/de/', es: 'https://www.arte.tv/es/', it: 'https://www.arte.tv/it/' });
    languageVariants('deezer', { fr: 'https://www.deezer.com/fr/channels/explore', en: 'https://www.deezer.com/en/channels/explore/' });
    languageVariants('tv5mondeplus', { fr: 'https://www.tv5mondeplus.com/fr', en: 'https://www.tv5mondeplus.com/en' });
    languageVariants('lichess', { fr: 'https://lichess.org/fr', en: 'https://lichess.org/' });
    languageVariants('sudoku', { fr: 'https://sudoku.com/fr', en: 'https://sudoku.com/' });
    languageVariants('crazygames', { fr: 'https://www.crazygames.com/fr/', en: 'https://www.crazygames.com/' }, ['https://www.crazygames.fr/']);
    languageVariants('poki', { fr: 'https://poki.com/fr', en: 'https://poki.com/' });
    languageVariants('playhop', { fr: 'https://playhop.com/fr', en: 'https://playhop.com/' });
    languageVariants('wikivoyage', { fr: 'https://fr.wikivoyage.org/wiki/Accueil', en: 'https://en.wikivoyage.org/' });
    languageVariants('chargefinder', { fr: 'https://chargefinder.com/fr', en: 'https://chargefinder.com/' });
    languageVariants('chargeprice', { fr: 'https://fr.chargeprice.app/', en: 'https://chargeprice.app/' });
    languageVariants('deepl', { fr: 'https://www.deepl.com/fr/translator', en: 'https://www.deepl.com/translator' });
    function countryVariants(id, values, extra) {
        variants[id] = { values: values, known: Array.from(new Set(Object.values(values).concat(extra || []))), choose: function (prefs) { return values[prefs.country] || values.WORLD; } };
    }
    countryVariants('paramount-plus', { WORLD: 'https://www.paramountplus.com/', FR: 'https://www.paramountplus.com/fr/' });
    countryVariants('apple-tv', { WORLD: 'https://tv.apple.com/', FR: 'https://tv.apple.com/fr' });
    countryVariants('tesla-superchargeurs', { WORLD: 'https://www.tesla.com/findus', FR: 'https://www.tesla.com/fr_fr/findus' }, ['https://www.tesla.com/findus/location/supercharger']);
    countryVariants('chargemap', { WORLD: 'https://chargemap.com/map', FR: 'https://chargemap.com/fr-fr/map' }, ['https://fr.chargemap.com/map']);
    const justwatch = { WORLD: 'https://www.justwatch.com/' };
    ['FR', 'US', 'GB', 'DE', 'ES', 'IT', 'PT', 'BR', 'CA', 'BE', 'CH', 'AU'].forEach(function (code) { justwatch[code] = 'https://www.justwatch.com/' + (code === 'GB' ? 'uk' : code.toLowerCase()); });
    countryVariants('justwatch', justwatch);

    const additions = [
        { serviceId: 'bbc-sounds', name: 'BBC Sounds', url: 'https://www.bbc.co.uk/sounds', categoryIds: ['music'], color: '#f28d42', langs: ['en'], markets: ['GB'], descriptions: { fr: 'Radios et podcasts de la BBC ; accès variable selon le territoire.', en: 'BBC radio and podcasts; access varies by territory.' } },
        { serviceId: 'ard-mediathek', name: 'ARD Mediathek', url: 'https://www.ardmediathek.de/', categoryIds: ['tv'], color: '#76b4ef', langs: ['de'], markets: ['DE'], descriptions: { fr: 'Programmes et documentaires des chaînes publiques allemandes ARD.', en: 'Programmes and documentaries from Germany’s public ARD broadcasters.' } },
        { serviceId: 'zdf-heute', name: 'ZDFheute', url: 'https://www.zdfheute.de/', categoryIds: ['news'], color: '#efa060', langs: ['de'], markets: ['DE'], descriptions: { fr: 'Actualités et reportages du service public allemand ZDF.', en: 'News and reporting from German public broadcaster ZDF.' } },
        { serviceId: 'deutschlandfunk', name: 'Deutschlandfunk', url: 'https://www.deutschlandfunk.de/', categoryIds: ['music'], color: '#76b4ef', langs: ['de'], markets: ['DE'], descriptions: { fr: 'Radio publique, émissions et podcasts en allemand.', en: 'Public radio, programmes and podcasts in German.' } },
        { serviceId: 'rtve-play', name: 'RTVE Play', url: 'https://www.rtve.es/play/', categoryIds: ['tv'], color: '#ec8e54', langs: ['es'], markets: ['ES'], descriptions: { fr: 'Programmes du service public espagnol ; catalogue variable selon le pays.', en: 'Spanish public-broadcast programmes; the catalogue varies by country.' } }
    ];
    additions.forEach(function (item) { annotate(item.serviceId, item.langs, item.markets); });
    function regionInfo(shortcut) {
        const known = metadata[shortcut.serviceId];
        return {
            contentLanguages: known ? known.contentLanguages.slice() : [],
            editorialCountries: known ? known.editorialCountries.slice() : [],
            languageStatus: known && known.contentLanguages.length ? 'editorial' : 'unknown',
            availability: 'unknown',
            teslaCompatibility: 'untested'
        };
    }
    function localizedShortcut(shortcut, prefs, uiLang) {
        if (!object(shortcut)) return shortcut;
        const result = clone(shortcut);
        const rule = variants[result.serviceId];
        if (rule && rule.known.includes(result.url)) result.url = rule.choose(normalizePreferences(prefs), uiLang);
        result.regionInfo = regionInfo(result);
        return result;
    }
    function isKnownURL(serviceId, url, catalog) {
        if (typeof serviceId !== 'string' || typeof url !== 'string') return false;
        const rule = variants[serviceId];
        if (rule && rule.known.includes(url)) return true;
        const added = additions.find(function (item) { return item.serviceId === serviceId; });
        if (added && added.url === url) return true;
        if (!object(catalog) || !Array.isArray(catalog.categories)) return false;
        return catalog.categories.some(function (category) {
            return (category.shortcuts || []).some(function (shortcut) {
                return shortcut.serviceId === serviceId && (shortcut.url === url ||
                    (Array.isArray(shortcut.legacyAliases) && shortcut.legacyAliases.some(function (alias) { return alias.url === url; })));
            });
        });
    }
    function matches(shortcut, prefs) {
        const info = regionInfo(shortcut);
        return (prefs.country === 'WORLD' || !info.editorialCountries.length || info.editorialCountries.includes(prefs.country)) &&
            (!prefs.contentLanguages.length || !info.contentLanguages.length || info.contentLanguages.some(function (code) { return prefs.contentLanguages.includes(code); }));
    }
    function enrichCatalog(catalog, uiLang) {
        if (!object(catalog) || !Array.isArray(catalog.categories)) return catalog;
        const result = clone(catalog);
        const seen = new Set();
        result.categories.forEach(function (category) {
            (category.shortcuts || []).forEach(function (shortcut) { seen.add(shortcut.serviceId); });
        });
        additions.forEach(function (item) {
            if (seen.has(item.serviceId)) return;
            const category = result.categories.find(function (entry) { return entry.id === item.categoryIds[0]; });
            if (!category) return;
            const shortcut = {
                serviceId: item.serviceId, name: item.name, url: item.url,
                categoryIds: item.categoryIds.slice(), color: item.color,
                description: item.descriptions[language(uiLang)] || item.descriptions.en,
                tag: messages(uiLang).availability, defaultIncluded: false
            };
            category.shortcuts.push(shortcut);
            seen.add(item.serviceId);
        });
        return result;
    }
    function applyCatalog(catalog, preferences, uiLang) {
        if (!object(catalog) || !Array.isArray(catalog.categories)) return catalog;
        const prefs = normalizePreferences(preferences);
        const result = enrichCatalog(catalog, uiLang);
        result.categories.forEach(function (category) {
            category.shortcuts = (category.shortcuts || []).filter(function (shortcut) { return matches(shortcut, prefs); })
                .map(function (shortcut) { return localizedShortcut(shortcut, prefs, uiLang); });
        });
        if (Array.isArray(result.replacements)) {
            result.replacements = result.replacements.map(function (replacement) {
                const next = Object.assign({}, replacement);
                Object.keys(variants).some(function (id) {
                    const rule = variants[id];
                    if (!rule.known.includes(next.to)) return false;
                    next.to = rule.choose(prefs, uiLang);
                    return true;
                });
                return next;
            });
        }
        return result;
    }
    return {
        STORAGE_KEY: STORAGE_KEY, LANGUAGES: LANGUAGES, COUNTRIES: COUNTRIES,
        createPreferences: createPreferences, normalizePreferences: normalizePreferences,
        messages: messages, countryLabel: countryLabel,
        enrichCatalog: enrichCatalog, applyCatalog: applyCatalog, localizedShortcut: localizedShortcut, isKnownURL: isKnownURL
    };
}));
