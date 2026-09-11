/* EvPortal: touch-first tiles with local state and local interaction libraries. */
document.addEventListener('DOMContentLoaded', function () {
    'use strict';
    const Core = window.EVState;
    const catalog = window.EV_CATALOG;
    const I18n = window.EVI18n;
    const translatedMessages = new Map();
    const t = function (key, params) {
        const message = I18n.t(key, params);
        translatedMessages.set(message, { key: key, params: params });
        return message;
    };
    const $ = function (id) { return document.getElementById(id); };
    if (!Core || !catalog) {
        if ($('statusMessage')) {
            $('statusMessage').textContent = t('app.startFailed');
            $('statusMessage').hidden = false;
        }
        return;
    }

    let storage;
    try { storage = window.localStorage; } catch (_) { storage = null; }
    const loaded = Core.loadState(storage, catalog);
    let state = loaded.state;
    let storageLocked = loaded.locked;
    let storageWarningKey = loaded.warning ? 'state.storageWarning' : '';
    let storageWarning = storageWarningKey ? t(storageWarningKey) : '';
    let lastAnnouncement = '';
    let lastAnnouncementIsError = false;
    let isEditMode = false;
    let query = '';
    let editingShortcut = null;
    let editingCategoryID = null;
    let editingCategoryLabel = '';
    let pendingImport = null;
    let sharingClient = null;
    let backupPickerAttempt = 0;
    const PREVIOUS_TRANSFER_KEY = 'evportal.previous-transfer.v1';
    let previousTransfer = null;
    function refreshPreviousTransfer() {
        previousTransfer = null;
        try {
            const savedTransfer = storage && storage.getItem(PREVIOUS_TRANSFER_KEY);
            if (savedTransfer) previousTransfer = Core.normalizeState(JSON.parse(savedTransfer));
        } catch (_) { /* A damaged recovery copy must not prevent startup. */ }
        $('undoTransferButton').hidden = !previousTransfer;
    }
    refreshPreviousTransfer();
    let importAttempt = 0;
    let importAbort = null;
    let tileSortable = null;
    let categorySortable = null;
    let keyboardDrag = null;
    let announcementTimer;
    let usageNeedsRender = false;
    let previousLanguage = I18n.language;
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    const editLabel = $('editModeToggle').querySelector('span') || document.createElement('span');
    Array.from($('editModeToggle').childNodes).forEach(function (node) { if (node.nodeType === Node.TEXT_NODE) node.remove(); });
    if (!editLabel.parentElement) $('editModeToggle').appendChild(editLabel);
    const knownIcons = new Set(Core.CATEGORY_ICONS);

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function icon(name) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('class', 'nav-icon');
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', '#icon-' + (knownIcons.has(name) ? name : 'folder'));
        svg.appendChild(use);
        return svg;
    }

    function action(label, text, handler, className) {
        const button = element('button', className || 'icon-button', text);
        button.type = 'button';
        button.setAttribute('aria-label', label);
        button.title = label;
        button.addEventListener('click', handler);
        return button;
    }

    function announce(message, error) {
        lastAnnouncement = message;
        lastAnnouncementIsError = Boolean(error);
        const status = $('statusMessage');
        status.textContent = [message, storageWarning].filter(Boolean).join(' ');
        status.hidden = !status.textContent;
        status.classList.toggle('is-error', Boolean(error || storageWarning));
        window.clearTimeout(announcementTimer);
        if (message && !error && !storageWarning) announcementTimer = window.setTimeout(function () { status.hidden = true; status.textContent = ''; }, 3500);
    }

    function persist(message) {
        const success = !storageLocked && Core.saveState(storage, state);
        if (!success && !storageWarning) { storageWarningKey = 'app.storageUnavailable'; storageWarning = t(storageWarningKey); }
        if (success) { storageWarningKey = ''; storageWarning = ''; }
        if (message || storageWarning) announce(message || '');
        return success;
    }

    function allShortcuts() {
        const positions = new Map((state.shortcutOrder || []).map(function (id, index) { return [id, index]; }));
        return state.categories.flatMap(function (category) {
            return category.shortcuts.map(function (shortcut) { return { category: category, shortcut: shortcut }; });
        }).sort(function (a, b) { return (positions.get(a.shortcut.id) ?? Infinity) - (positions.get(b.shortcut.id) ?? Infinity); });
    }

    function selectCategory(categoryID) {
        state.activeCategory = categoryID;
        query = '';
        $('searchInput').value = '';
        persist();
        render();
    }

    function categoryLabel(category) {
        return I18n.category(category, catalog);
    }

    function matchesShortcut(shortcut, category, search) {
        return Core.matches(shortcut, Object.assign({}, category, { label: categoryLabel(category) }), search);
    }

    function navItem(categoryID, label, categoryIcon) {
        const li = element('li', 'category-item');
        li.dataset.categoryId = categoryID;
        const button = action(label, undefined, function () { selectCategory(categoryID); }, 'menu-link');
        button.dataset.category = categoryID;
        button.dataset.focusKey = 'nav-' + categoryID;
        const active = state.activeCategory === categoryID && !query;
        button.classList.toggle('active', active);
        if (active) button.setAttribute('aria-current', 'page');
        button.append(icon(categoryIcon || categoryID), element('span', 'category-label', label));
        li.appendChild(button);
        return li;
    }

    function dragHandle(kind, id, label) {
        const handle = action(t('app.move', { name: label }), '⠿', function () {}, 'icon-button drag-handle' + (kind === 'category' ? ' category-drag-handle' : ''));
        handle.dataset.focusKey = 'drag-' + id;
        handle.setAttribute('aria-describedby', 'dragInstructions');
        handle.setAttribute('aria-pressed', 'false');
        handle.addEventListener('keydown', function (event) {
            const row = handle.closest(kind === 'category' ? '.category-item' : '.shortcut');
            const list = row.parentElement;
            const selector = kind === 'category' ? '.is-sortable-category' : '.shortcut';
            const picked = keyboardDrag && keyboardDrag.id === id;
            if ((event.key === ' ' || event.key === 'Enter') && !picked) {
                event.preventDefault();
                if (keyboardDrag) { render('drag-' + id); announce(t('app.previousMoveCancelled')); return; }
                keyboardDrag = { kind: kind, id: id };
                handle.setAttribute('aria-pressed', 'true');
                row.classList.add('is-keyboard-dragging');
                announce(t('app.moveSelected', { name: label }));
                return;
            }
            if (!picked) return;
            if (event.key === 'Escape' || event.key === 'Tab') {
                if (event.key === 'Escape') event.preventDefault();
                keyboardDrag = null;
                render('drag-' + id);
                announce(t('app.moveCancelled'));
            } else if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                keyboardDrag = null;
                commitOrder(kind, list);
                render('drag-' + id);
            } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
                event.preventDefault();
                const items = Array.from(list.querySelectorAll(selector));
                const from = items.indexOf(row);
                const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
                const reverseHorizontal = document.documentElement.dir === 'rtl' && !vertical;
                const backwards = (event.key === 'ArrowLeft' || event.key === 'ArrowUp') !== reverseHorizontal;
                let to = Math.max(0, Math.min(items.length - 1, from + (backwards ? -1 : 1)));
                if (vertical) {
                    const candidates = items.filter(function (item) { return backwards ? item.offsetTop < row.offsetTop : item.offsetTop > row.offsetTop; });
                    const targetTop = candidates.length ? Math[backwards ? 'max' : 'min'].apply(null, candidates.map(function (item) { return item.offsetTop; })) : row.offsetTop;
                    const center = row.offsetLeft + row.offsetWidth / 2;
                    const target = candidates.filter(function (item) { return item.offsetTop === targetTop; }).sort(function (a, b) {
                        return Math.abs(a.offsetLeft + a.offsetWidth / 2 - center) - Math.abs(b.offsetLeft + b.offsetWidth / 2 - center);
                    })[0];
                    to = target ? items.indexOf(target) : from;
                }
                if (from !== to) {
                    list.insertBefore(row, to > from ? items[to].nextSibling : items[to]);
                    handle.focus({ preventScroll: true });
                    row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                    announce(t('app.movePosition', { name: label, position: to + 1, count: items.length }));
                }
            }
        });
        return handle;
    }

    function commitOrder(kind, list) {
        if (kind === 'category') {
            const positions = new Map(Array.from(list.querySelectorAll('.is-sortable-category')).map(function (node, index) { return [node.dataset.categoryId, index]; }));
            state.categories.sort(function (a, b) { return positions.get(a.id) - positions.get(b.id); });
        } else {
            state = Core.reorderShortcuts(state, Array.from(list.querySelectorAll('.shortcut')).map(function (node) { return node.dataset.shortcutId; }));
        }
        persist(t('app.orderSaved'));
    }

    function enableSorting() {
        if (!isEditMode || !window.Sortable) return;
        function options(kind) {
            return {
                draggable: kind === 'category' ? '.is-sortable-category' : '.shortcut',
                handle: kind === 'category' ? '.category-drag-handle' : '.drag-handle',
                animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160,
                delay: 120,
                delayOnTouchOnly: true,
                touchStartThreshold: 4,
                forceFallback: true,
                fallbackOnBody: true,
                fallbackTolerance: 4,
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',
                dragClass: 'sortable-drag',
                onStart: function () { keyboardDrag = null; },
                onEnd: function (event) {
                    if (event.oldDraggableIndex === event.newDraggableIndex) return;
                    commitOrder(kind, event.to);
                    const id = kind === 'category' ? event.item.dataset.categoryId : event.item.dataset.shortcutId;
                    window.setTimeout(function () { render('drag-' + id); }, 0);
                }
            };
        }
        if (state.activeCategory !== 'all') tileSortable = window.Sortable.create($('content'), options('shortcut'));
        categorySortable = window.Sortable.create($('menu'), options('category'));
    }

    function renderMenu() {
        const fragment = document.createDocumentFragment();
        fragment.appendChild(navItem('all', t('app.all')));
        fragment.appendChild(navItem('favorites', t('app.favorites')));
        state.categories.forEach(function (category) {
            const item = navItem(category.id, categoryLabel(category), category.icon);
            item.classList.add('is-sortable-category');
            if (isEditMode) {
                const controls = element('div', 'category-actions');
                const edit = action(t('app.editCategory', { name: categoryLabel(category) }), '✎', function () { openCategoryDialog(category); });
                const remove = action(t('app.deleteCategory', { name: categoryLabel(category) }), '×', function () {
                    state.categories = state.categories.filter(function (item) { return item.id !== category.id; });
                    if (state.activeCategory === category.id) state.activeCategory = 'all';
                    persist(t('app.categoryDeleted'));
                    render('nav-' + state.activeCategory);
                }, 'icon-button danger');
                controls.append(dragHandle('category', category.id, categoryLabel(category)), edit, remove);
                item.appendChild(controls);
            }
            fragment.appendChild(item);
        });
        $('menu').replaceChildren(fragment);
    }

    function shortcutMark(shortcut) {
        const monogram = shortcut.name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toLocaleUpperCase(I18n.language) || 'EV';
        const mark = element('span', 'shortcut-icon', monogram);
        mark.setAttribute('aria-hidden', 'true');
        mark.style.setProperty('--brand', shortcut.color);
        const hostname = new URL(shortcut.url).hostname.replace(/^www\./, '');
        const asset = window.EV_ICONS && window.EV_ICONS[hostname];
        if (asset) {
            const logo = element('img', 'service-logo');
            logo.src = asset;
            logo.alt = '';
            logo.width = 64;
            logo.height = 64;
            logo.draggable = false;
            logo.loading = 'lazy';
            logo.decoding = 'async';
            logo.addEventListener('error', function () { mark.textContent = monogram; mark.classList.remove('has-logo'); });
            mark.classList.add('has-logo');
            mark.replaceChildren(logo);
        }
        return mark;
    }

    function shortcutCard(category, shortcut) {
        const card = element('article', 'shortcut');
        card.dataset.shortcutId = shortcut.id;
        card.dataset.categoryId = category.id;
        const link = element('a', 'shortcut-link');
        link.href = shortcut.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.draggable = false;
        link.setAttribute('aria-label', t('app.openNewTab', { name: shortcut.name }));
        link.dataset.focusKey = 'shortcut-' + shortcut.id;
        function activate(event) {
            if (isEditMode) { event.preventDefault(); return; }
            if (event.defaultPrevented || (event.type === 'click' ? event.button !== 0 : event.button !== 1)) return;
            shortcut.clickCount = Math.min(Number.MAX_SAFE_INTEGER, (shortcut.clickCount || 0) + 1);
            persist();
            // Keep the anchor intact while the browser opens its new tab, including
            // middle-click navigation. Refresh the ranking when returning here.
            usageNeedsRender = state.activeCategory === 'all';
        }
        link.addEventListener('click', activate);
        link.addEventListener('auxclick', activate);
        if (isEditMode) link.tabIndex = -1;
        const copy = element('span', 'shortcut-copy');
        copy.appendChild(element('span', 'shortcut-name', shortcut.name));
        link.append(shortcutMark(shortcut), copy);
        const favorite = action(t(shortcut.favorite ? 'app.removeFavorite' : 'app.addFavorite', { name: shortcut.name }), shortcut.favorite ? '★' : '☆', function () {
            shortcut.favorite = !shortcut.favorite;
            persist(t(shortcut.favorite ? 'app.favoriteAdded' : 'app.favoriteRemoved', { name: shortcut.name }));
            render('favorite-' + shortcut.id);
        }, 'favorite-toggle' + (shortcut.favorite ? ' is-favorite' : ''));
        favorite.setAttribute('aria-pressed', String(shortcut.favorite));
        favorite.dataset.focusKey = 'favorite-' + shortcut.id;
        card.append(link, favorite);
        if (isEditMode) {
            const controls = element('div', 'shortcut-actions');
            const edit = action(t('app.editShortcut', { name: shortcut.name }), '✎', function () { openShortcutDialog(category, shortcut); });
            const remove = action(t('app.deleteShortcut', { name: shortcut.name }), '×', function () {
                category.shortcuts = category.shortcuts.filter(function (item) { return item.id !== shortcut.id; });
                persist(t('app.shortcutDeleted'));
                render('nav-' + category.id);
            }, 'icon-button danger');
            if (state.activeCategory !== 'all') controls.appendChild(dragHandle('shortcut', shortcut.id, shortcut.name));
            controls.append(edit, remove);
            card.appendChild(controls);
        }
        return card;
    }

    function renderContent() {
        const category = state.categories.find(function (item) { return item.id === state.activeCategory; });
        let rows = state.activeCategory === 'all' ? Core.rankShortcuts(state) : allShortcuts();
        let title = t('app.allShortcuts');
        let description = t('app.allDescription');
        if (query) {
            rows = rows.filter(function (row) { return matchesShortcut(row.shortcut, row.category, query); });
            title = t('app.searchResults');
            description = t('app.searchDescription', { query: query });
        } else if (state.activeCategory === 'favorites') {
            rows = rows.filter(function (row) { return row.shortcut.favorite; });
            title = t('app.myFavorites');
            description = t('app.favoritesDescription');
        } else if (category) {
            rows = rows.filter(function (row) { return row.category.id === category.id; });
            title = categoryLabel(category);
            description = t('app.categoryDescription');
        }
        $('sectionTitle').textContent = title;
        if ($('sectionDescription')) $('sectionDescription').textContent = description;
        if ($('resultCount')) $('resultCount').textContent = t(rows.length === 1 ? 'app.shortcutCountOne' : 'app.shortcutCount', { count: rows.length });
        $('clearSearchButton').hidden = !query;
        const fragment = document.createDocumentFragment();
        rows.forEach(function (row) { fragment.appendChild(shortcutCard(row.category, row.shortcut, Boolean(query || !category))); });
        if (!rows.length) {
            const empty = element('div', 'empty-state');
            empty.appendChild(element('h3', '', query ? t('app.noShortcuts') : (state.activeCategory === 'favorites' ? t('app.emptyFavorites') : t('app.emptyCategory'))));
            empty.appendChild(element('p', '', query ? t('app.searchHint') : (state.activeCategory === 'favorites' ? t('app.favoriteHint') : t('app.emptyHint'))));
            empty.appendChild(action(query ? t('app.clearSearch') : t('app.exploreCatalog'), query ? t('app.clearSearch') : t('app.exploreCatalog'), function () {
                if (query) { query = ''; $('searchInput').value = ''; render(); $('searchInput').focus(); }
                else openCatalog();
            }, 'button button-primary'));
            fragment.appendChild(empty);
        }
        $('content').classList.add('shortcuts-grid');
        $('content').replaceChildren(fragment);
    }

    function render(focusKey) {
        usageNeedsRender = false;
        keyboardDrag = null;
        if (tileSortable) { tileSortable.destroy(); tileSortable = null; }
        if (categorySortable) { categorySortable.destroy(); categorySortable = null; }
        const currentFocus = focusKey || (document.activeElement && document.activeElement.dataset.focusKey);
        renderMenu();
        renderContent();
        const rows = allShortcuts();
        if ($('shortcutTotal')) $('shortcutTotal').textContent = String(rows.length);
        if ($('favoriteTotal')) $('favoriteTotal').textContent = String(rows.filter(function (row) { return row.shortcut.favorite; }).length);
        $('editControls').hidden = !isEditMode;
        $('editControls').textContent = state.activeCategory === 'all'
            ? t('app.usageOrderHint')
            : t('app.dragHint');
        $('editModeToggle').setAttribute('aria-pressed', String(isEditMode));
        $('editModeToggle').setAttribute('aria-label', isEditMode ? t('app.finishEditing') : t('app.editShortcuts'));
        editLabel.textContent = isEditMode ? t('app.finish') : t('app.edit');
        document.body.classList.toggle('is-editing', isEditMode);
        enableSorting();
        if (currentFocus) {
            const target = Array.from(document.querySelectorAll('[data-focus-key]')).find(function (node) { return node.dataset.focusKey === currentFocus; });
            if (target && !target.disabled) target.focus({ preventScroll: true });
            else {
                const nearby = target && target.parentElement.querySelector('button:not(:disabled)');
                const fallback = nearby || $('content').querySelector('.favorite-toggle') || $('sectionTitle');
                if (fallback === $('sectionTitle')) fallback.setAttribute('tabindex', '-1');
                fallback.focus({ preventScroll: true });
            }
        }
    }

    function openDialog(dialog) {
        const settings = $('settingsDialog');
        if (settings && settings.open && dialog !== settings) closeDialog(settings);
        if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
        else dialog.setAttribute('open', '');
    }

    function closeDialog(dialog) {
        if (typeof dialog.close === 'function') dialog.close();
        else dialog.removeAttribute('open');
        if (dialog.id === 'importDialog') {
            importAttempt += 1;
            if (importAbort) importAbort.abort();
        }
    }

    document.querySelectorAll('[data-close-dialog]').forEach(function (button) {
        button.addEventListener('click', function () { closeDialog(button.closest('dialog')); });
    });
    document.querySelectorAll('dialog').forEach(function (dialog) {
        dialog.addEventListener('click', function (event) {
            if (event.target !== dialog) return;
            const bounds = dialog.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDialog(dialog);
        });
    });
    $('importDialog').addEventListener('cancel', function () {
        importAttempt += 1;
        if (importAbort) importAbort.abort();
    });

    function openShortcutDialog(category, shortcut) {
        editingShortcut = shortcut ? { category: category, shortcut: shortcut } : null;
        $('addShortcutForm').reset();
        $('shortcutFormError').textContent = '';
        const selector = $('shortcutCategory');
        selector.replaceChildren();
        state.categories.forEach(function (item) {
            const option = element('option', '', categoryLabel(item));
            option.value = item.id;
            selector.appendChild(option);
        });
        if (!state.categories.length) {
            announce(t('app.categoryRequired'));
            openCategoryDialog();
            return;
        }
        selector.value = category ? category.id : (state.categories.some(function (item) { return item.id === state.activeCategory; }) ? state.activeCategory : state.categories[0].id);
        const heading = $('shortcutDialog').querySelector('h2');
        if (heading) heading.textContent = shortcut ? t('app.editShortcutTitle') : t('app.addShortcutTitle');
        const submit = $('addShortcutForm').querySelector('[type="submit"]');
        if (submit) submit.textContent = shortcut ? t('app.save') : t('app.addShortcutSubmit');
        if (shortcut) {
            $('shortcutName').value = shortcut.name;
            $('shortcutURL').value = shortcut.url;
            $('shortcutDescription').value = shortcut.description;
        }
        openDialog($('shortcutDialog'));
        $('shortcutName').focus();
    }

    function openCategoryDialog(category) {
        editingCategoryID = category ? category.id : null;
        editingCategoryLabel = category ? categoryLabel(category) : '';
        $('addPageForm').reset();
        $('pageFormError').textContent = '';
        $('pageDialogTitle').textContent = category ? t('app.editCategoryTitle') : t('app.newCategory');
        const submit = $('addPageForm').querySelector('[type="submit"]');
        const canCreate = Core.canCreateCategory(state, catalog);
        submit.textContent = category ? t('app.save') : t('app.create');
        submit.disabled = !category && !canCreate;
        $('newPageName').maxLength = Math.max(Core.MAX_NEW_CATEGORY_NAME, editingCategoryLabel.length);
        if (category) {
            $('newPageName').value = editingCategoryLabel;
            $('newPageDescription').value = category.description || '';
        }
        if ($('categoryLimitHint')) {
            const catalogIDs = new Set(catalog.categories.map(function (item) { return item.id; }));
            const customCount = state.categories.filter(function (item) { return !catalogIDs.has(item.id); }).length;
            $('categoryLimitHint').textContent = !category && !canCreate
                ? t('app.categoryLimitHint', { max: Core.MAX_CUSTOM_CATEGORIES })
                : t('app.categoryCountHint', { count: customCount, max: Core.MAX_CUSTOM_CATEGORIES, length: Core.MAX_NEW_CATEGORY_NAME });
        }
        const picker = $('categoryIconPicker');
        if (picker) {
            const previousOptions = picker.querySelector('.category-icon-options');
            if (previousOptions) previousOptions.remove();
            const options = element('div', 'category-icon-options');
            Core.CATEGORY_ICONS.forEach(function (name) {
                const label = element('label', 'category-icon-option');
                label.title = t('app.icon.' + name);
                const input = element('input');
                input.type = 'radio';
                input.name = 'categoryIcon';
                input.value = name;
                input.checked = name === (category ? (category.icon || (knownIcons.has(category.id) ? category.id : 'folder')) : 'folder');
                label.append(input, icon(name), element('span', 'visually-hidden', t('app.icon.' + name)));
                options.appendChild(label);
            });
            picker.appendChild(options);
        }
        openDialog($('pageDialog'));
        $('newPageName').focus();
    }
    $('addPageButton').addEventListener('click', function () { openCategoryDialog(); });
    $('addPageForm').addEventListener('submit', function (event) {
        event.preventDefault();
        const inputLabel = $('newPageName').value.trim();
        const original = editingCategoryID && state.categories.find(function (category) { return category.id === editingCategoryID; });
        const label = original && inputLabel === editingCategoryLabel ? original.label : inputLabel;
        if (editingCategoryID && !original) { $('pageFormError').textContent = t('app.categoryGone'); return; }
        if (!label || (label.length > Core.MAX_NEW_CATEGORY_NAME && (!original || original.label !== label))) { $('pageFormError').textContent = t('app.categoryNameInvalid', { max: Core.MAX_NEW_CATEGORY_NAME }); return; }
        if (!original && !Core.canCreateCategory(state, catalog)) { $('pageFormError').textContent = t('app.categoryLimit', { max: Core.MAX_CUSTOM_CATEGORIES }); return; }
        if (state.categories.some(function (category) { return category.id !== editingCategoryID && Core.normalizeText(category.label) === Core.normalizeText(label); })) {
            $('pageFormError').textContent = t('app.categoryDuplicate');
            return;
        }
        const chosen = $('addPageForm').querySelector('[name="categoryIcon"]:checked');
        const categoryIcon = chosen ? chosen.value : 'folder';
        if (!knownIcons.has(categoryIcon)) { $('pageFormError').textContent = t('app.iconRequired'); return; }
        const description = $('newPageDescription').value.trim();
        if (description.length > 240) { $('pageFormError').textContent = t('app.categoryDescriptionInvalid'); return; }
        const category = original || { id: Core.id('category'), shortcuts: [] };
        category.label = label;
        category.description = description;
        category.icon = categoryIcon;
        if (!original) state.categories.push(category);
        state.activeCategory = category.id;
        query = '';
        $('searchInput').value = '';
        persist(original ? t('app.categoryChanged') : t('app.categoryCreated'));
        closeDialog($('pageDialog'));
        render('nav-' + category.id);
    });
    $('addShortcutButton').addEventListener('click', function () { openShortcutDialog(); });
    $('addShortcutForm').addEventListener('submit', function (event) {
        event.preventDefault();
        try {
            const category = state.categories.find(function (item) { return item.id === $('shortcutCategory').value; });
            if (!category) throw new Error(t('app.selectCategory'));
            const originalCategory = editingShortcut && state.categories.find(function (item) { return item.id === editingShortcut.category.id; });
            const originalShortcut = originalCategory && originalCategory.shortcuts.find(function (item) { return item.id === editingShortcut.shortcut.id; });
            if (editingShortcut && !originalShortcut) throw new Error(t('app.shortcutGone'));
            if (!editingShortcut && allShortcuts().length >= Core.MAX_SHORTCUTS) throw new Error(t('app.shortcutLimit'));
            const url = Core.normalizeURL($('shortcutURL').value);
            const name = $('shortcutName').value.trim();
            const description = $('shortcutDescription').value.trim();
            if (!name || name.length > 100 || description.length > 300) throw new Error(t('app.shortcutFieldsInvalid'));
            if (category.shortcuts.some(function (item) { return item.url === url && (!editingShortcut || item.id !== editingShortcut.shortcut.id); })) throw new Error(t('app.shortcutDuplicate'));
            if (editingShortcut) {
                const shortcut = originalShortcut;
                shortcut.name = name;
                shortcut.url = url;
                shortcut.description = description;
                if (originalCategory.id !== category.id) {
                    originalCategory.shortcuts = originalCategory.shortcuts.filter(function (item) { return item.id !== shortcut.id; });
                    category.shortcuts.push(shortcut);
                }
            } else category.shortcuts.push({ id: Core.id('link'), name: name, url: url, description: description, tag: '', color: '#5476ee', favorite: false, clickCount: 0 });
            state.activeCategory = category.id;
            query = '';
            $('searchInput').value = '';
            persist(editingShortcut ? t('app.shortcutChanged') : t('app.shortcutAdded'));
            closeDialog($('shortcutDialog'));
            render();
        } catch (error) { $('shortcutFormError').textContent = error.message; }
    });

    function renderCatalog() {
        const search = $('catalogSearch').value.trim();
        const existing = new Set(allShortcuts().map(function (row) { return row.shortcut.url; }));
        const fragment = document.createDocumentFragment();
        let count = 0;
        let available = 0;
        catalog.categories.forEach(function (category) {
            const shortcuts = category.shortcuts.filter(function (shortcut) { return matchesShortcut(shortcut, category, search); });
            if (!shortcuts.length) return;
            const section = element('section', 'catalog-section');
            section.appendChild(element('h3', '', categoryLabel(category)));
            shortcuts.forEach(function (shortcut) {
                count += 1;
                const row = element('div', 'catalog-item');
                const copy = element('div', 'catalog-copy');
                copy.append(element('strong', '', shortcut.name), element('p', '', new URL(shortcut.url).hostname));
                const present = existing.has(Core.normalizeURL(shortcut.url));
                if (!present) available += 1;
                const add = action(t(present ? 'app.alreadyPresentNamed' : 'app.addNamed', { name: shortcut.name }), present ? t('app.alreadyPresent') : t('app.add'), function () {
                    if (allShortcuts().length >= Core.MAX_SHORTCUTS) { announce(t('app.shortcutLimit'), true); return; }
                    let destination = state.categories.find(function (item) { return item.id === category.id; });
                    if (!destination) {
                        if (state.categories.length >= Core.MAX_CATEGORIES) { announce(t('app.totalCategoryLimit'), true); return; }
                        destination = { id: category.id, label: category.label, icon: category.icon || category.id, description: category.description, shortcuts: [] };
                        state.categories.push(destination);
                    }
                    destination.shortcuts.push({ id: Core.id('link'), name: shortcut.name, url: Core.normalizeURL(shortcut.url), description: shortcut.description || '', tag: shortcut.tag || '', color: shortcut.color || '#5476ee', favorite: false, clickCount: 0 });
                    persist(t('app.addedToCategory', { name: shortcut.name, category: categoryLabel(destination) }));
                    render();
                    renderCatalog();
                    const next = Array.from($('catalogContent').querySelectorAll('.catalog-add')).find(function (button) { return !button.disabled; });
                    if (next) next.focus({ preventScroll: true });
                }, 'button catalog-add' + (present ? ' is-added' : ''));
                add.disabled = present;
                row.append(copy, add);
                section.appendChild(row);
            });
            fragment.appendChild(section);
        });
        if (!count) fragment.appendChild(element('p', 'empty-state', t('app.noServices')));
        if ($('catalogStatus')) {
            $('catalogStatus').textContent = !search && !available
                ? t('app.catalogComplete')
                : (count ? t('app.catalogHint') : '');
            $('catalogStatus').hidden = !$('catalogStatus').textContent;
        }
        $('catalogContent').replaceChildren(fragment);
    }

    function openCatalog() {
        $('catalogSearch').value = '';
        renderCatalog();
        openDialog($('catalogDialog'));
        $('catalogSearch').focus();
    }
    $('catalogButton').addEventListener('click', openCatalog);
    if ($('catalogCustomButton')) $('catalogCustomButton').addEventListener('click', function () {
        closeDialog($('catalogDialog'));
        openShortcutDialog();
    });
    if ($('catalogCategoryButton')) $('catalogCategoryButton').addEventListener('click', function () {
        closeDialog($('catalogDialog'));
        openCategoryDialog();
    });
    $('catalogSearch').addEventListener('input', renderCatalog);

    function openImport(proposal) {
        backupPickerAttempt += 1;
        $('savedBackupPicker').hidden = true;
        $('savedBackupList').replaceChildren();
        pendingImport = null;
        importAttempt += 1;
        $('importError').textContent = '';
        $('importPreview').textContent = proposal ? t('app.sharedConfig') : '';
        $('confirmImportButton').hidden = true;
        $('importFile').value = '';
        $('importConfigID').value = proposal || '';
        const legacyDetails = $('importConfigID').closest('details');
        if (legacyDetails) legacyDetails.open = true;
        openDialog($('importDialog'));
        if (proposal) $('importConfigID').focus();
    }

    function previewImport(next) {
        pendingImport = Core.applyCatalogUpdates(next, catalog).state;
        const total = pendingImport.categories.reduce(function (sum, category) { return sum + category.shortcuts.length; }, 0);
        $('importPreview').textContent = t('app.importPreview', { categories: pendingImport.categories.length, count: total });
        $('confirmImportButton').hidden = false;
        $('importError').textContent = '';
    }

    async function showSavedBackups(offset, attempt) {
        const list = $('savedBackupList');
        if (!offset) {
            list.replaceChildren();
            const loading = element('p', 'field-help', t('app.loadingConfig'));
            loading.dataset.i18n = 'app.loadingConfig';
            list.append(loading);
        }
        list.setAttribute('aria-busy', 'true');
        try {
            const result = sharingClient ? await sharingClient.listPages(offset) : { pages: [], total: 0, nextOffset: 0 };
            if (attempt !== backupPickerAttempt || !$('importDialog').open) return;
            if (!offset) list.replaceChildren();
            const oldMore = list.querySelector('[data-more-backups]');
            if (oldMore) oldMore.remove();
            result.pages.forEach(function (backup) {
                const button = element('button', 'full-width', backup.title || backup.path);
                button.type = 'button';
                button.addEventListener('click', function () { loadTelegraphBackup(backup.path); });
                list.append(button);
            });
            if (result.nextOffset < result.total && result.nextOffset > (offset || 0)) {
                const more = element('button', 'full-width', t('share.more'));
                more.type = 'button';
                more.dataset.moreBackups = 'true';
                more.dataset.i18n = 'share.more';
                more.addEventListener('click', function () { more.disabled = true; showSavedBackups(result.nextOffset, attempt); });
                list.append(more);
            }
            if (!list.childElementCount) {
                const empty = element('p', 'field-help', t('share.empty'));
                empty.dataset.i18n = 'share.empty';
                list.append(empty);
            }
        } catch (error) {
            if (attempt === backupPickerAttempt && $('importDialog').open) {
                if (!offset) list.replaceChildren();
                const more = list.querySelector('[data-more-backups]');
                if (more) more.disabled = false;
                $('importError').textContent = error.i18nKey ? t(error.i18nKey, error.i18nParams) : error.message;
            }
        } finally { if (attempt === backupPickerAttempt) list.removeAttribute('aria-busy'); }
    }

    function chooseSavedBackup() {
        openImport();
        $('savedBackupPicker').hidden = false;
        $('legacyImportOptions').open = false;
        showSavedBackups(0, backupPickerAttempt);
    }

    function renderTransferredState(next) {
        state = next;
        storageLocked = false;
        storageWarningKey = '';
        storageWarning = '';
        query = '';
        $('searchInput').value = '';
        applyTheme();
        render();
        $('undoTransferButton').hidden = !previousTransfer;
    }

    function applyReceivedState(candidate) {
        const next = Core.applyCatalogUpdates(Core.normalizeState(candidate), catalog).state;
        const previous = Core.normalizeState(state);
        let recoveryBefore;
        let recoveryWritten = false;
        try {
            if (!storage) throw new Error();
            recoveryBefore = storage.getItem(PREVIOUS_TRANSFER_KEY);
            storage.setItem(PREVIOUS_TRANSFER_KEY, JSON.stringify(previous));
            recoveryWritten = true;
            if (!Core.saveState(storage, next)) throw new Error();
        } catch (_) {
            if (recoveryWritten) {
                try {
                    if (recoveryBefore === null) storage.removeItem(PREVIOUS_TRANSFER_KEY);
                    else storage.setItem(PREVIOUS_TRANSFER_KEY, recoveryBefore);
                } catch (_) { /* Current shortcuts stay unchanged even if storage becomes unavailable. */ }
            }
            const error = new Error(t('pair.storageUnavailable'));
            error.i18nKey = 'pair.storageUnavailable';
            throw error;
        }
        previousTransfer = previous;
        renderTransferredState(next);
        return true;
    }

    $('undoTransferButton').hidden = !previousTransfer;
    $('undoTransferButton').addEventListener('click', function () {
        refreshPreviousTransfer();
        if (!previousTransfer) return;
        if (!Core.saveState(storage, previousTransfer)) {
            announce(t('pair.storageUnavailable'), true);
            return;
        }
        const restored = previousTransfer;
        previousTransfer = null;
        try { storage.removeItem(PREVIOUS_TRANSFER_KEY); } catch (_) { /* Restoration has already succeeded. */ }
        renderTransferredState(restored);
        closeDialog($('settingsDialog'));
        announce(t('pair.undone'));
    });

    $('importConfigButton').addEventListener('click', chooseSavedBackup);
    $('importFile').addEventListener('change', async function () {
        const attempt = ++importAttempt;
        if (importAbort) importAbort.abort();
        pendingImport = null;
        $('confirmImportButton').hidden = true;
        $('importPreview').textContent = '';
        const file = this.files[0];
        if (!file) return;
        try {
            if (file.size > Core.MAX_FILE_BYTES) throw new Error(t('app.fileTooLarge'));
            const text = await file.text();
            if (attempt !== importAttempt) return;
            previewImport(Core.parseImport(text, catalog));
        } catch (error) { if (attempt === importAttempt) $('importError').textContent = error.message; }
    });
    async function loadTelegraphBackup(proposal) {
        const attempt = ++importAttempt;
        if (importAbort) importAbort.abort();
        pendingImport = null;
        $('confirmImportButton').hidden = true;
        $('importError').textContent = '';
        $('importPreview').textContent = '';
        let timeout;
        try {
            const path = Core.telegraphImportPath(proposal);
            importAbort = new AbortController();
            timeout = window.setTimeout(function () { if (importAbort) importAbort.abort(); }, 15000);
            $('importPreview').textContent = t('app.loadingConfig');
            const response = await fetch('https://api.telegra.ph/getPage/' + encodeURIComponent(path) + '?return_content=true', { signal: importAbort.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
            if (!response.ok) throw new Error(t('app.telegraphNotReturned'));
            const content = await response.text();
            if (new TextEncoder().encode(content).length > Core.MAX_FILE_BYTES) throw new Error(t('app.pageTooLarge'));
            const result = JSON.parse(content);
            if (!result.ok || !Array.isArray(result.result?.content)) throw new Error(t('app.telegraphUnreadable'));
            const first = result.result.content[0];
            if (!first || !Array.isArray(first.children) || typeof first.children[0] !== 'string') throw new Error(t('app.noConfigInPage'));
            if (attempt !== importAttempt) return;
            previewImport(Core.parseImport(first.children[0], catalog));
        } catch (error) {
            if (attempt === importAttempt) {
                $('importPreview').textContent = '';
                $('importError').textContent = error.name === 'AbortError' ? t('app.connectionTimeout')
                    : (error instanceof TypeError ? t('app.connectionFailed') : (error instanceof SyntaxError ? t('app.invalidConfig') : error.message));
            }
        } finally { window.clearTimeout(timeout); }
    }
    $('telegraphImportForm').addEventListener('submit', function (event) {
        event.preventDefault();
        loadTelegraphBackup($('importConfigID').value);
    });
    $('confirmImportButton').addEventListener('click', function () {
        if (!pendingImport) return;
        state = pendingImport;
        pendingImport = null;
        storageLocked = false;
        storageWarningKey = '';
        storageWarning = '';
        query = '';
        $('searchInput').value = '';
        persist(t('app.imported'));
        applyTheme();
        closeDialog($('importDialog'));
        render();
        const url = new URL(window.location.href);
        url.searchParams.delete('code');
        url.searchParams.delete('config');
        window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    });
    $('exportConfigButton').addEventListener('click', function () {
        const dialog = this.closest('dialog');
        if (dialog) closeDialog(dialog);
        try {
            const blob = new Blob([JSON.stringify(Core.normalizeState(state), null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = element('a');
            anchor.href = url;
            anchor.download = 'evportal-' + new Date().toISOString().slice(0, 10) + '.json';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
            announce(t('app.exportReady'));
        } catch (_) { announce(t('app.exportFailed'), true); }
    });
    $('resetButton').addEventListener('click', function () {
        if ($('settingsDialog')) closeDialog($('settingsDialog'));
        if (!window.confirm(t('app.confirmReset'))) return;
        const theme = state.theme;
        state = Core.fromCatalog(catalog);
        state.theme = theme;
        storageLocked = false;
        storageWarningKey = '';
        storageWarning = '';
        query = '';
        $('searchInput').value = '';
        persist(t('app.catalogReset'));
        render();
    });

    function applyTheme() {
        if (state.theme === 'auto') {
            state.theme = systemTheme.matches ? 'dark' : 'light';
            persist();
        }
        const resolved = state.theme;
        document.documentElement.dataset.theme = resolved;
        const nextThemeLabel = t(resolved === 'dark' ? 'app.switchToLight' : 'app.switchToDark');
        $('themeToggle').setAttribute('aria-label', nextThemeLabel);
        $('themeToggle').title = nextThemeLabel;
        const use = $('themeToggle').querySelector('use');
        if (use) use.setAttribute('href', resolved === 'dark' ? '#icon-sun' : '#icon-moon');
        const themeColor = document.querySelector('meta[name="theme-color"]');
        if (themeColor) themeColor.content = resolved === 'dark' ? '#111213' : '#f7f6f3';
    }
    $('themeToggle').addEventListener('click', function () {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        applyTheme();
        persist();
    });

    const tesla = window.EVTesla;
    const inTesla = tesla && tesla.isTesla(navigator.userAgent);
    $('fullscreenButton').hidden = !(inTesla || (document.fullscreenEnabled && document.documentElement.requestFullscreen));
    async function fullscreen(forceTesla) {
        if ($('settingsDialog') && $('settingsDialog').open) closeDialog($('settingsDialog'));
        try {
            if (!tesla) throw new Error(t('app.fullscreenReload'));
            await tesla.enterFullscreen(window, forceTesla);
        } catch (error) { announce(error.message || t('app.fullscreenUnavailable'), true); }
    }
    $('fullscreenButton').addEventListener('click', function () { fullscreen(false); });
    if ($('teslaFullscreenButton')) $('teslaFullscreenButton').addEventListener('click', function () { fullscreen(true); });
    document.addEventListener('fullscreenchange', function () {
        const active = Boolean(document.fullscreenElement);
        $('fullscreenButton').setAttribute('aria-pressed', String(active));
        $('fullscreenButton').setAttribute('aria-label', active ? t('app.exitFullscreen') : t('app.enterFullscreen'));
        $('fullscreenButton').title = active ? t('app.exitFullscreen') : t('app.enterFullscreen');
    });
    if ($('settingsButton')) $('settingsButton').addEventListener('click', function () { openDialog($('settingsDialog')); });
    function toggleSearch(show) {
        const panel = $('searchPanel');
        if (!panel) { $('searchInput').focus(); return; }
        panel.hidden = !show;
        if ($('searchToggle')) $('searchToggle').setAttribute('aria-expanded', String(show));
        if (show) $('searchInput').focus();
        else { query = ''; $('searchInput').value = ''; render(); if ($('searchToggle')) $('searchToggle').focus(); }
    }
    if ($('searchToggle')) $('searchToggle').addEventListener('click', function () { toggleSearch($('searchPanel').hidden); });
    $('editModeToggle').addEventListener('click', function () { isEditMode = !isEditMode; render(); });
    $('searchInput').addEventListener('input', function () { query = this.value.trim().slice(0, 200); render(); });
    $('clearSearchButton').addEventListener('click', function () { query = ''; $('searchInput').value = ''; render(); $('searchInput').focus(); });
    document.addEventListener('keydown', function (event) {
        if (document.querySelector('dialog[open]')) return;
        const typing = event.target.closest('input,textarea,select,[contenteditable="true"]');
        if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); toggleSearch(true); }
        if (event.key === 'Escape' && document.activeElement === $('searchInput')) { toggleSearch(false); }
    });
    window.addEventListener('storage', function (event) {
        if (event.key === PREVIOUS_TRANSFER_KEY || event.key === null) refreshPreviousTransfer();
        if (event.key !== Core.STORAGE_KEY || !event.newValue || storageLocked) return;
        try {
            state = Core.normalizeState(JSON.parse(event.newValue));
            applyTheme();
            render();
            announce(t('app.syncedFromTab'));
        } catch (_) { announce(t('app.unreadableTabState'), true); }
    });
    function refreshUsageOnReturn() {
        if (usageNeedsRender && state.activeCategory === 'all' && !document.hidden && !document.querySelector('dialog[open]')) render();
    }
    window.addEventListener('focus', refreshUsageOnReturn);
    document.addEventListener('visibilitychange', refreshUsageOnReturn);

    function retranslateMessage(message) {
        const original = translatedMessages.get(message);
        if (original) return t(original.key, original.params);
        const previous = window.EV_TRANSLATIONS && window.EV_TRANSLATIONS[previousLanguage];
        const key = previous && Object.keys(previous).find(function (item) { return previous[item] === message; });
        return key ? t(key) : message;
    }

    function refreshLanguage() {
        I18n.translateDOM(document);
        if ($('languageSelect')) $('languageSelect').value = I18n.language;
        if (storageWarningKey) storageWarning = t(storageWarningKey);
        if (!$('statusMessage').hidden || storageWarning) announce(retranslateMessage(lastAnnouncement), lastAnnouncementIsError);
        // Rebuild navigation only: in-progress names, URLs and import codes stay intact.
        render();
        applyTheme();
        Array.from($('shortcutCategory').options).forEach(function (option) {
            const category = state.categories.find(function (item) { return item.id === option.value; });
            if (category) option.textContent = categoryLabel(category);
        });
        if ($('shortcutDialog').open) {
            $('shortcutDialog').querySelector('h2').textContent = t(editingShortcut ? 'app.editShortcutTitle' : 'app.addShortcutTitle');
            $('addShortcutForm').querySelector('[type="submit"]').textContent = t(editingShortcut ? 'app.save' : 'app.addShortcutSubmit');
        }
        if ($('pageDialog').open) {
            $('pageDialogTitle').textContent = t(editingCategoryID ? 'app.editCategoryTitle' : 'app.newCategory');
            $('addPageForm').querySelector('[type="submit"]').textContent = t(editingCategoryID ? 'app.save' : 'app.create');
            $('categoryIconPicker').querySelectorAll('.category-icon-option').forEach(function (option) {
                const label = t('app.icon.' + option.querySelector('input').value);
                option.title = label;
                option.querySelector('span').textContent = label;
            });
        }
        ['categoryLimitHint', 'pageFormError', 'shortcutFormError', 'importError', 'importPreview'].forEach(function (id) {
            if ($(id)) $(id).textContent = retranslateMessage($(id).textContent);
        });
        if ($('catalogDialog').open) renderCatalog();
        const activeFullscreen = Boolean(document.fullscreenElement);
        const fullscreenLabel = t(activeFullscreen ? 'app.exitFullscreen' : 'app.enterFullscreen');
        $('fullscreenButton').setAttribute('aria-label', fullscreenLabel);
        $('fullscreenButton').title = fullscreenLabel;
        previousLanguage = I18n.language;
    }
    if ($('languageSelect')) {
        $('languageSelect').value = I18n.language;
        $('languageSelect').addEventListener('change', function () { I18n.setLanguage(this.value); });
    }
    window.addEventListener('evportal:languagechange', refreshLanguage);

    I18n.translateDOM(document);
    applyTheme();
    render();
    if (!storageLocked) persist([loaded.source === 'legacy' ? t('app.legacyRecovered') : '', loaded.updates ? t('app.catalogUpdated', { count: loaded.updates }) : ''].filter(Boolean).join(' '));
    else announce('');
    if (window.EVTelegraph) sharingClient = window.EVTelegraph.init({ getState: function () { return state; }, announce: announce });
    const incomingPairing = window.location.hash.startsWith('#receive=');
    if (window.EVPairing) {
        window.EVPairing.init({
            getState: function () { return state; },
            applyState: applyReceivedState,
            announce: announce,
            chooseBackup: chooseSavedBackup
        });
        $('importDialog').addEventListener('close', function () { window.EVPairing.resumeSender(); });
    }
    const params = new URLSearchParams(window.location.search);
    const proposal = params.get('code') || params.get('config');
    if (proposal && !incomingPairing) openImport(proposal.slice(0, 300));
});
