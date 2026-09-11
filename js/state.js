/* Shared, dependency-free state and import validation. Also testable with Node.js. */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.EVState = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';
    const fallbackMessages = typeof module === 'object' && module.exports ? require('./locales/state-fr.json') : {};
    function t(key, values) {
        if (root.EVI18n) return root.EVI18n.t(key, values);
        return (fallbackMessages[key] || key).replace(/\{(\w+)\}/g, function (_, name) { return String((values || {})[name] ?? ''); });
    }
    const STORAGE_KEY = 'evportal.state.v2';
    const MAX_FILE_BYTES = 2 * 1024 * 1024;
    const MAX_CATEGORIES = 50;
    // Creation limits keep the navigation concise; older imports retain their categories.
    const MAX_CUSTOM_CATEGORIES = 5;
    const MAX_NEW_CATEGORY_NAME = 16;
    const CATEGORY_ICONS = Object.freeze(['all', 'favorites', 'cinema', 'music', 'tv', 'charging', 'games', 'navigation', 'social', 'news', 'weather', 'productivity', 'folder']);
    const MAX_SHORTCUTS = 5000;
    const ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;
    let sequence = 0;

    function id(prefix) {
        sequence += 1;
        return prefix + '-' + Date.now().toString(36) + '-' + sequence.toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }

    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function string(value, label, max, required) {
        if (value === undefined && !required) return '';
        if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
            throw new Error(t(max ? 'state.invalidField' : 'state.invalidFieldShort', { field: label, max: max }));
        }
        return value.trim();
    }

    function normalizeURL(value) {
        const input = string(value, t('state.urlLabel'), 2048, true);
        if (!/^https?:\/\//i.test(input) || /[\u0000-\u0020\u007f]/.test(input)) {
            throw new Error(t('state.fullURL'));
        }
        let url;
        try { url = new URL(input); } catch (_) { throw new Error(t('state.invalidURL')); }
        if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
            throw new Error(t('state.safeURL'));
        }
        return url.href;
    }

    function normalizeText(value) {
        return String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    }

    function validateID(value, prefix) {
        if (value === undefined) return id(prefix);
        if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new Error(t('state.invalidID'));
        return value;
    }

    function categoryList(value, categoryIDs, fallback) {
        if (value === undefined) return (fallback || []).slice();
        if (!Array.isArray(value) || value.length > MAX_CATEGORIES || value.some(function (value) {
            return typeof value !== 'string' || !categoryIDs.has(value);
        })) throw new Error(t('state.invalidCategory'));
        return Array.from(new Set(value));
    }

    function normalizeShortcut(raw, seenIDs, ownerID, categoryIDs, seenServiceIDs) {
        if (!isObject(raw)) throw new Error(t('state.shortcutObject'));
        const shortcutID = validateID(raw.id, 'link');
        if (seenIDs.has(shortcutID)) throw new Error(t('state.duplicateShortcut'));
        seenIDs.add(shortcutID);
        if (raw.favorite !== undefined && typeof raw.favorite !== 'boolean') throw new Error(t('state.favoriteBoolean'));
        if (raw.color !== undefined && (typeof raw.color !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(raw.color))) {
            throw new Error(t('state.invalidColor'));
        }
        if (raw.clickCount !== undefined && (!Number.isSafeInteger(raw.clickCount) || raw.clickCount < 0)) {
            throw new Error(t('state.invalidCount'));
        }
        const categoryIds = categoryList(raw.categoryIds, categoryIDs, [ownerID]);
        if (!categoryIds.includes(ownerID)) categoryIds.unshift(ownerID);
        const result = {
            id: shortcutID,
            name: string(raw.name, t('state.shortcutName'), 100, true),
            url: normalizeURL(raw.url),
            description: string(raw.description, t('state.shortcutDescription'), 300, false),
            tag: string(raw.tag, t('state.shortcutTag'), 50, false),
            color: raw.color || '#5476ee',
            favorite: raw.favorite || false,
            clickCount: raw.clickCount === undefined ? 0 : raw.clickCount,
            categoryIds: categoryIds
        };
        if (raw.serviceId !== undefined) {
            result.serviceId = validateID(raw.serviceId, 'service');
            if (seenServiceIDs.has(result.serviceId)) throw new Error(t('state.duplicateShortcut'));
            seenServiceIDs.add(result.serviceId);
        }
        return result;
    }

    function normalizeState(raw) {
        if (!isObject(raw) || raw.version !== 2 || !Array.isArray(raw.categories)) {
            throw new Error(t('state.invalidFormat'));
        }
        if (raw.categories.length > MAX_CATEGORIES) throw new Error(t('state.tooManyCategories'));
        const categoryIDs = new Set();
        const shortcutIDs = new Set();
        const serviceIDs = new Set();
        let count = 0;
        const prepared = raw.categories.map(function (category) {
            if (!isObject(category) || !Array.isArray(category.shortcuts)) throw new Error(t('state.invalidCategory'));
            const categoryID = validateID(category.id, 'category');
            if (['all', 'favorites'].includes(categoryID) || categoryIDs.has(categoryID)) throw new Error(t('state.reservedCategory'));
            if (category.icon !== undefined && !CATEGORY_ICONS.includes(category.icon)) throw new Error(t('state.invalidIcon'));
            categoryIDs.add(categoryID);
            count += category.shortcuts.length;
            if (count > MAX_SHORTCUTS) throw new Error(t('state.tooManyShortcuts'));
            return { source: category, id: categoryID };
        });
        const categories = prepared.map(function (entry) {
            const category = entry.source;
            const categoryID = entry.id;
            return {
                id: categoryID,
                label: string(category.label, t('state.categoryName'), 80, true),
                icon: category.icon === undefined ? (CATEGORY_ICONS.includes(categoryID) ? categoryID : 'folder') : category.icon,
                description: string(category.description, t('state.categoryDescription'), 240, false),
                shortcuts: category.shortcuts.map(function (shortcut) { return normalizeShortcut(shortcut, shortcutIDs, categoryID, categoryIDs, serviceIDs); })
            };
        });
        if (raw.theme !== undefined && !['auto', 'light', 'dark'].includes(raw.theme)) throw new Error(t('state.invalidTheme'));
        const activeCategory = raw.activeCategory === undefined ? 'all' : raw.activeCategory;
        if (typeof activeCategory !== 'string' || (!['all', 'favorites'].includes(activeCategory) && !categoryIDs.has(activeCategory))) {
            throw new Error(t('state.missingCategory'));
        }
        if (raw.shortcutOrder !== undefined && (!Array.isArray(raw.shortcutOrder) || raw.shortcutOrder.length > MAX_SHORTCUTS || raw.shortcutOrder.some(function (value) { return typeof value !== 'string' || !ID_PATTERN.test(value); }) || new Set(raw.shortcutOrder).size !== raw.shortcutOrder.length)) {
            throw new Error(t('state.invalidOrder'));
        }
        const shortcutOrder = (raw.shortcutOrder || []).filter(function (value) { return shortcutIDs.has(value); });
        const orderedIDs = new Set(shortcutOrder);
        shortcutIDs.forEach(function (value) { if (!orderedIDs.has(value)) shortcutOrder.push(value); });
        return {
            version: 2,
            catalogVersion: string(raw.catalogVersion, t('state.catalogVersion'), 50, false),
            theme: raw.theme || 'auto',
            activeCategory: activeCategory,
            shortcutOrder: shortcutOrder,
            categories: categories
        };
    }

    function catalogServices(catalog, options) {
        const settings = options || {};
        const market = settings.market || 'ALL';
        const seen = new Set();
        return catalog.categories.flatMap(function (category) {
            return category.shortcuts.filter(function (shortcut) {
                const serviceID = shortcut.serviceId;
                if (serviceID && seen.has(serviceID)) return false;
                if (serviceID) seen.add(serviceID);
                return (settings.includeOptional !== false || shortcut.defaultIncluded !== false)
                    && (market === 'ALL' || !shortcut.countries || !shortcut.countries.length || shortcut.countries.includes(market));
            }).map(function (shortcut) { return { category: category, shortcut: shortcut }; });
        });
    }

    function catalogShortcut(shortcut, categoryID) {
        const copy = Object.assign({}, shortcut);
        copy.categoryIds = (shortcut.categoryIds || [categoryID]).slice();
        if (shortcut.serviceId) copy.serviceId = shortcut.serviceId;
        return copy;
    }

    function fromCatalog(catalog, options) {
        const entries = catalogServices(catalog, Object.assign({}, options, { includeOptional: false }));
        const included = new Set();
        entries.forEach(function (entry) {
            included.add(entry.category.id);
            (entry.shortcut.categoryIds || []).forEach(function (categoryID) { included.add(categoryID); });
        });
        const categories = catalog.categories.filter(function (category) { return included.has(category.id); }).map(function (category) {
            return Object.assign({}, category, { shortcuts: entries.filter(function (entry) {
                return entry.category.id === category.id;
            }).map(function (entry) { return catalogShortcut(entry.shortcut, category.id); }) });
        });
        return normalizeState({
            version: 2,
            catalogVersion: catalog.version,
            theme: 'auto',
            activeCategory: categories.some(function (category) { return category.id === 'cinema'; }) ? 'cinema' : (categories[0]?.id || 'all'),
            categories: categories
        });
    }

    function fromLegacy(raw, catalog) {
        if (!isObject(raw)) throw new Error(t('state.backupObject'));
        const catalogLinks = new Map();
        const replacementURLs = new Map();
        if (catalog) {
            catalog.categories.forEach(function (category) {
                category.shortcuts.forEach(function (shortcut) { catalogLinks.set(normalizeURL(shortcut.url), shortcut); });
            });
            (catalog.replacements || []).forEach(function (replacement) { replacementURLs.set(normalizeURL(replacement.from), normalizeURL(replacement.to)); });
        }
        const hasPages = Object.prototype.hasOwnProperty.call(raw, 'pages');
        const names = hasPages ? raw.pages : Object.keys(raw);
        if (!Array.isArray(names) || names.some(function (name) { return typeof name !== 'string'; }) || names.length > MAX_CATEGORIES) {
            throw new Error(t('state.invalidLegacyList'));
        }
        if (new Set(names).size !== names.length) throw new Error(t('state.duplicateCategories'));
        if (hasPages && Object.keys(raw).some(function (key) { return key !== 'pages' && !names.includes(key); })) {
            throw new Error(t('state.foreignData'));
        }
        const categories = names.map(function (name) {
            string(name, t('state.categoryName'), 80, true);
            if (!Object.prototype.hasOwnProperty.call(raw, name) || !Array.isArray(raw[name])) {
                throw new Error(t('state.invalidCategoryShortcuts', { name: name }));
            }
            const known = catalog && catalog.categories.find(function (category) { return category.id === name; });
            const shortcuts = raw[name].map(function (shortcut, index) {
                if (!isObject(shortcut)) throw new Error(t('state.invalidLegacyShortcut'));
                if (shortcut.order !== undefined && ((typeof shortcut.order !== 'number' && (typeof shortcut.order !== 'string' || !/^\d+$/.test(shortcut.order))) || !Number.isSafeInteger(Number(shortcut.order)) || Number(shortcut.order) < 0)) {
                    throw new Error(t('state.invalidShortcutOrder'));
                }
                return { source: shortcut, order: shortcut.order === undefined ? index + 1 : Number(shortcut.order), index: index };
            }).sort(function (a, b) { return a.order - b.order || a.index - b.index; }).map(function (entry) {
                const copy = Object.assign({}, entry.source);
                delete copy.id;
                const url = normalizeURL(copy.url);
                const knownLink = catalogLinks.get(replacementURLs.get(url) || url);
                if (knownLink) {
                    ['description', 'color', 'tag'].forEach(function (key) {
                        if (copy[key] === undefined && knownLink[key] !== undefined) copy[key] = knownLink[key];
                    });
                }
                return copy;
            });
            return {
                id: known ? known.id : id('category'),
                label: known ? known.label : name,
                icon: known ? known.icon : undefined,
                description: known ? known.description : '',
                shortcuts: shortcuts
            };
        });
        return normalizeState({ version: 2, categories: categories, theme: 'auto', activeCategory: 'all' });
    }

    function parseImport(text, catalog) {
        if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_FILE_BYTES) throw new Error(t('state.largeFile'));
        let raw;
        try { raw = JSON.parse(text); } catch (_) { throw new Error(t('state.invalidJSON')); }
        return isObject(raw) && Object.prototype.hasOwnProperty.call(raw, 'categories') && raw.version !== undefined
            ? normalizeState(raw)
            : fromLegacy(raw, catalog);
    }

    function applyCatalogUpdates(state, catalog) {
        const next = normalizeState(state);
        let updates = 0;
        next.categories.forEach(function (category) {
            category.shortcuts.forEach(function (shortcut) {
                const replacement = (catalog.replacements || []).find(function (item) {
                    return normalizeURL(item.from) === shortcut.url;
                });
                if (replacement && normalizeURL(replacement.to) !== shortcut.url) {
                    shortcut.url = normalizeURL(replacement.to);
                    if (replacement.legacyName && shortcut.name === replacement.legacyName) {
                        shortcut.name = string(replacement.name, t('state.shortcutName'), 100, true);
                    }
                    updates += 1;
                }
            });
        });
        const existingCategories = new Set(next.categories.map(function (category) { return category.id; }));
        const positions = new Map(next.shortcutOrder.map(function (value, index) { return [value, index]; }));
        const mergedIDs = new Map();
        catalogServices(catalog).forEach(function (service) {
            const definition = service.shortcut;
            const serviceID = definition.serviceId;
            if (!serviceID) return;
            const desired = Array.from(new Set([service.category.id].concat(definition.categoryIds || [])));
            const sourceCategories = new Set(desired.concat(definition.legacyCategoryIds || []));
            const aliases = [{ name: definition.name, url: definition.url }].concat(definition.legacyAliases || []).map(function (alias) {
                return { name: alias.name, url: normalizeURL(alias.url) };
            });
            const entries = allShortcutEntries(next).filter(function (entry) {
                return sourceCategories.has(entry.category.id) && aliases.some(function (alias) {
                    return entry.shortcut.name === alias.name && entry.shortcut.url === alias.url;
                });
            });
            // Explicit service identity marks an already migrated tile. Do not
            // undo later user edits to its memberships on every application load.
            const legacy = entries.filter(function (entry) { return entry.shortcut.serviceId === undefined; });
            if (!legacy.length) return;
            const installed = entries.find(function (entry) { return entry.shortcut.serviceId === serviceID; });
            // A renamed or relocated identified tile already owns this service.
            // Preserve unrelated legacy-looking personal entries instead of
            // assigning the same catalogue identity to a second physical record.
            if (!installed && allShortcutEntries(next).some(function (entry) { return entry.shortcut.serviceId === serviceID; })) return;
            const candidates = legacy.concat(installed ? [installed] : []);
            candidates.sort(function (a, b) { return positions.get(a.shortcut.id) - positions.get(b.shortcut.id); });
            const keeper = installed || candidates[0];
            const before = JSON.stringify(keeper.shortcut);
            const count = candidates.reduce(function (total, entry) {
                return Math.min(Number.MAX_SAFE_INTEGER, total + entry.shortcut.clickCount);
            }, 0);
            const memberships = new Set();
            candidates.forEach(function (entry) {
                entry.shortcut.categoryIds.forEach(function (categoryID) {
                    // A legacy-only primary category (e.g. Gulli in Cinema) is
                    // replaced only when its new canonical owner already exists.
                    if (!sourceCategories.has(categoryID) || desired.includes(categoryID)
                        || !existingCategories.has(service.category.id)) memberships.add(categoryID);
                });
            });
            desired.forEach(function (categoryID) { if (existingCategories.has(categoryID)) memberships.add(categoryID); });
            const target = next.categories.find(function (category) { return category.id === service.category.id; }) || keeper.category;
            memberships.add(target.id);
            keeper.shortcut.favorite = candidates.some(function (entry) { return entry.shortcut.favorite; });
            keeper.shortcut.clickCount = count;
            keeper.shortcut.categoryIds = Array.from(memberships);
            if (!installed) {
                keeper.shortcut.name = definition.name;
                keeper.shortcut.url = normalizeURL(definition.url);
            }
            const withoutIdentity = JSON.stringify(keeper.shortcut);
            keeper.shortcut.serviceId = serviceID;
            candidates.forEach(function (entry) {
                if (entry === keeper) return;
                entry.category.shortcuts = entry.category.shortcuts.filter(function (shortcut) { return shortcut.id !== entry.shortcut.id; });
                mergedIDs.set(entry.shortcut.id, keeper.shortcut.id);
                updates += 1;
            });
            if (target !== keeper.category) {
                keeper.category.shortcuts = keeper.category.shortcuts.filter(function (shortcut) { return shortcut.id !== keeper.shortcut.id; });
                target.shortcuts.push(keeper.shortcut);
            }
            if (before !== withoutIdentity || target !== keeper.category) updates += 1;
        });
        const ordered = new Set();
        next.shortcutOrder = next.shortcutOrder.map(function (value) { return mergedIDs.get(value) || value; }).filter(function (value) {
            if (ordered.has(value)) return false;
            ordered.add(value);
            return true;
        });
        next.catalogVersion = catalog.version;
        return { state: normalizeState(next), updates: updates };
    }

    function loadState(storage, catalog, options) {
        let raw;
        try {
            if (!storage) throw new Error(t('state.storageUnavailable'));
            raw = storage.getItem(STORAGE_KEY);
            if (raw !== null) {
                const updated = applyCatalogUpdates(normalizeState(JSON.parse(raw)), catalog);
                return Object.assign(updated, { source: 'saved', locked: false, warning: '' });
            }
            const pages = storage.getItem('pages');
            if (pages !== null) {
                const names = JSON.parse(pages);
                if (!Array.isArray(names) || names.some(function (name) { return typeof name !== 'string'; })) throw new Error(t('state.invalidLegacyCategories'));
                const legacy = Object.create(null);
                legacy.pages = names;
                names.forEach(function (name) {
                    if (name === 'pages') throw new Error(t('state.reservedLegacyCategory'));
                    const value = storage.getItem(name);
                    legacy[name] = value === null ? [] : JSON.parse(value);
                });
                const updated = applyCatalogUpdates(fromLegacy(legacy, catalog), catalog);
                return Object.assign(updated, { source: 'legacy', locked: false, warning: '' });
            }
            return { state: fromCatalog(catalog, options), updates: 0, source: 'new', locked: false, warning: '' };
        } catch (_) {
            return {
                state: fromCatalog(catalog, options), updates: 0, source: 'recovery', locked: true,
                warning: t('state.storageWarning')
            };
        }
    }

    function saveState(storage, state) {
        try {
            if (!storage) throw new Error(t('state.storageUnavailable'));
            const validated = normalizeState(state);
            storage.setItem(STORAGE_KEY, JSON.stringify(validated));
            return true;
        } catch (_) { return false; }
    }

    function matches(shortcut, category, query) {
        const haystack = normalizeText([shortcut.name, shortcut.description, shortcut.url, shortcut.tag, category.label].join(' '));
        return normalizeText(query).trim().split(/\s+/).every(function (word) { return haystack.includes(word); });
    }

    function canCreateCategory(state, catalog) {
        const catalogIDs = new Set(catalog.categories.map(function (category) { return category.id; }));
        return state.categories.length < MAX_CATEGORIES && state.categories.filter(function (category) {
            return !catalogIDs.has(category.id);
        }).length < MAX_CUSTOM_CATEGORIES;
    }

    // Canonical entries retain the original object references. Membership views
    // never copy a shortcut, so favorites, usage and edits have one source of truth.
    function allShortcutEntries(state) {
        const seen = new Set();
        return state.categories.flatMap(function (category) {
            return category.shortcuts.filter(function (shortcut) {
                if (seen.has(shortcut.id)) return false;
                seen.add(shortcut.id);
                return true;
            }).map(function (shortcut) { return { shortcut: shortcut, category: category }; });
        });
    }

    function getShortcutEntry(state, shortcutID) {
        return allShortcutEntries(state).find(function (entry) { return entry.shortcut.id === shortcutID; }) || null;
    }

    function shortcutsForCategory(state, categoryID) {
        const positions = new Map((state.shortcutOrder || []).map(function (value, position) { return [value, position]; }));
        return allShortcutEntries(state).filter(function (entry) {
            return categoryID === 'all' || (categoryID === 'favorites' ? entry.shortcut.favorite
                : (entry.shortcut.categoryIds || [entry.category.id]).includes(categoryID));
        }).sort(function (a, b) {
            return (positions.get(a.shortcut.id) ?? Infinity) - (positions.get(b.shortcut.id) ?? Infinity);
        });
    }

    function addShortcut(state, ownerID, shortcut) {
        const next = normalizeState(state);
        const category = next.categories.find(function (item) { return item.id === ownerID; });
        if (!category) throw new Error(t('state.missingCategory'));
        category.shortcuts.push(Object.assign({}, shortcut));
        return normalizeState(next);
    }

    function addCatalogService(state, catalog, serviceID) {
        const next = normalizeState(state);
        const service = catalogServices(catalog).find(function (entry) { return entry.shortcut.serviceId === serviceID; });
        if (!service) throw new Error(t('state.invalidID'));
        if (allShortcutEntries(next).some(function (entry) { return entry.shortcut.serviceId === serviceID; })) return next;
        const memberships = Array.from(new Set([service.category.id].concat(service.shortcut.categoryIds || [])));
        memberships.forEach(function (categoryID) {
            if (next.categories.some(function (category) { return category.id === categoryID; })) return;
            const definition = catalog.categories.find(function (category) { return category.id === categoryID; });
            if (!definition) throw new Error(t('state.missingCategory'));
            next.categories.push(Object.assign({}, definition, { shortcuts: [] }));
        });
        const shortcut = catalogShortcut(service.shortcut, service.category.id);
        shortcut.categoryIds = memberships;
        if (allShortcutEntries(next).some(function (entry) { return entry.shortcut.id === shortcut.id; })) shortcut.id = id('link');
        return addShortcut(next, service.category.id, shortcut);
    }

    function updateShortcut(state, shortcutID, patch, ownerID) {
        const next = normalizeState(state);
        const entry = getShortcutEntry(next, shortcutID);
        if (!entry || !isObject(patch)) throw new Error(t('state.invalidID'));
        // Tile identity is immutable. A different destination becomes a personal
        // shortcut, so the original catalogue service can be installed again.
        if (patch.id !== undefined && patch.id !== shortcutID) throw new Error(t('state.invalidID'));
        const changedURL = patch.url !== undefined && normalizeURL(patch.url) !== entry.shortcut.url;
        let owner = entry.category;
        if (patch.categoryIds !== undefined || ownerID !== undefined) {
            const memberships = categoryList(patch.categoryIds === undefined ? entry.shortcut.categoryIds : patch.categoryIds, new Set(next.categories.map(function (category) { return category.id; })));
            if (!memberships.length) throw new Error(t('state.missingCategory'));
            if (ownerID !== undefined && !memberships.includes(ownerID)) throw new Error(t('state.missingCategory'));
            const targetID = ownerID === undefined ? (memberships.includes(owner.id) ? owner.id : memberships[0]) : ownerID;
            if (targetID !== owner.id) {
                owner.shortcuts = owner.shortcuts.filter(function (item) { return item.id !== shortcutID; });
                owner = next.categories.find(function (category) { return category.id === targetID; });
                owner.shortcuts.push(entry.shortcut);
            }
        }
        Object.assign(entry.shortcut, patch, { id: shortcutID });
        if (changedURL) delete entry.shortcut.serviceId;
        return normalizeState(next);
    }

    function removeShortcut(state, shortcutID) {
        const next = normalizeState(state);
        next.categories.forEach(function (category) {
            category.shortcuts = category.shortcuts.filter(function (shortcut) { return shortcut.id !== shortcutID; });
        });
        return normalizeState(next);
    }

    function removeCategory(state, categoryID) {
        const next = normalizeState(state);
        const removed = next.categories.find(function (category) { return category.id === categoryID; });
        if (!removed) return next;
        next.categories = next.categories.filter(function (category) { return category.id !== categoryID; });
        allShortcutEntries(next).forEach(function (entry) {
            entry.shortcut.categoryIds = entry.shortcut.categoryIds.filter(function (value) { return value !== categoryID; });
        });
        removed.shortcuts.forEach(function (shortcut) {
            shortcut.categoryIds = shortcut.categoryIds.filter(function (value) { return value !== categoryID; });
            const owner = next.categories.find(function (category) { return shortcut.categoryIds.includes(category.id); });
            if (owner) owner.shortcuts.push(shortcut);
        });
        if (next.activeCategory === categoryID) next.activeCategory = 'all';
        return normalizeState(next);
    }

    function recordShortcutClick(state, shortcutID) {
        const next = normalizeState(state);
        for (const category of next.categories) {
            const shortcut = category.shortcuts.find(function (item) { return item.id === shortcutID; });
            if (shortcut) {
                shortcut.clickCount = Math.min(Number.MAX_SAFE_INTEGER, shortcut.clickCount + 1);
                break;
            }
        }
        return next;
    }

    function rankShortcuts(state) {
        const positions = new Map((state.shortcutOrder || []).map(function (value, position) { return [value, position]; }));
        return allShortcutEntries(state).sort(function (a, b) {
            return (b.shortcut.clickCount || 0) - (a.shortcut.clickCount || 0)
                || (positions.get(a.shortcut.id) ?? Infinity) - (positions.get(b.shortcut.id) ?? Infinity);
        });
    }

    function move(items, itemID, offset) {
        const from = items.findIndex(function (item) { return item.id === itemID; });
        const to = from + offset;
        if (from < 0 || to < 0 || to >= items.length) return items.slice();
        const next = items.slice();
        next.splice(to, 0, next.splice(from, 1)[0]);
        return next;
    }

    function reorderShortcuts(state, visibleIDs) {
        const next = normalizeState(state);
        const visible = new Set(visibleIDs);
        const known = new Set(next.shortcutOrder);
        if (visible.size !== visibleIDs.length || visibleIDs.some(function (value) { return !known.has(value); })) throw new Error(t('state.invalidMove'));
        let index = 0;
        // Reorder only the visible slots: filtered-out tiles keep their positions.
        next.shortcutOrder = next.shortcutOrder.map(function (value) { return visible.has(value) ? visibleIDs[index++] : value; });
        const positions = new Map(next.shortcutOrder.map(function (value, position) { return [value, position]; }));
        next.categories.forEach(function (category) {
            category.shortcuts.sort(function (a, b) { return positions.get(a.id) - positions.get(b.id); });
        });
        return next;
    }

    function telegraphPath(value) {
        const input = string(value, t('state.telegraphIDLabel'), 300, true);
        let path = input;
        if (/^https?:\/\//i.test(input)) {
            const url = new URL(normalizeURL(input));
            if (!['telegra.ph', 'www.telegra.ph'].includes(url.hostname) || url.search || url.hash) throw new Error(t('state.telegraphLink'));
            path = url.pathname.replace(/^\//, '');
        }
        if (!/^[a-zA-Z0-9_-]{1,250}$/.test(path)) throw new Error(t('state.telegraphID'));
        return path;
    }

    function telegraphImportPath(value) {
        const input = string(value, t('state.shareCodeLabel'), 2048, true);
        if (!/^https?:\/\//i.test(input)) return telegraphPath(input);
        const url = new URL(normalizeURL(input));
        if (['telegra.ph', 'www.telegra.ph'].includes(url.hostname)) return telegraphPath(input);
        const codes = url.searchParams.getAll('code').concat(url.searchParams.getAll('config'));
        if (url.hash || codes.length !== 1) throw new Error(t('state.portalLink'));
        const path = telegraphPath(codes[0]);
        // Import only a page identifier: never follow the pasted portal URL or a nested URL.
        if (path !== codes[0]) throw new Error(t('state.telegraphID'));
        return path;
    }

    return { STORAGE_KEY, MAX_FILE_BYTES, MAX_CATEGORIES, MAX_CUSTOM_CATEGORIES, MAX_NEW_CATEGORY_NAME, CATEGORY_ICONS, MAX_SHORTCUTS, id, normalizeURL, normalizeText, normalizeState, catalogServices, fromCatalog, fromLegacy, parseImport, applyCatalogUpdates, loadState, saveState, matches, canCreateCategory, allShortcutEntries, getShortcutEntry, shortcutsForCategory, addShortcut, addCatalogService, updateShortcut, removeShortcut, removeCategory, recordShortcutClick, rankShortcuts, move, reorderShortcuts, telegraphPath, telegraphImportPath };
}));
