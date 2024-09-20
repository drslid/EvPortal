document.addEventListener('DOMContentLoaded', () => {
    const menuLinks = document.querySelector('#menu');
    const contentContainer = document.querySelector('#content');
    const editModeToggle = document.getElementById('editModeToggle');
    const addPageButton = document.getElementById('addPageButton');
    const addShortcutButton = document.getElementById('addShortcutButton');
    const addPageForm = document.getElementById('addPageForm');
    const addShortcutForm = document.getElementById('addShortcutForm');
    const newPageInput = document.getElementById('newPageName'); // Input pour le nom de la nouvelle page
    const shortcutNameInput = document.getElementById('shortcutName'); // Input pour le nom du raccourci
    const shortcutURLInput = document.getElementById('shortcutURL'); // Input pour l'URL du raccourci

    let isEditMode = false;
    // let currentSection = 'cinema';

    // Pages par défaut et leurs raccourcis
    const defaultPages = {
        'cinema': [
            { name: 'Prime Video', url: 'https://www.primevideo.com', order: 1 },
            { name: 'Molotov TV', url: 'https://www.molotov.tv', order: 2 },
            { name: 'Disney+', url: 'https://www.disneyplus.com', order: 3 },
            { name: 'Hulu', url: 'https://www.hulu.com', order: 4 },
            { name: 'HBO Max', url: 'https://www.hbomax.com', order: 5 },
            { name: 'Netflix', url: 'https://www.netflix.com/fr', order: 6 },
            { name: 'YouTube', url: 'https://www.youtube.com', order: 7 },
            { name: 'Plex', url: 'https://app.plex.tv', order: 8 },
            { name: 'Paramount+', url: 'https://www.paramountplus.com/fr/', order: 9 },
            { name: 'Pluto TV', url: 'https://pluto.tv/fr/', order: 10 },
            { name: 'Crave', url: 'https://www.crave.ca/fr', order: 11 },
            { name: 'Starz', url: 'https://www.starz.com', order: 12 },
            { name: 'Tubi.tv', url: 'https://www.tubi.tv', order: 13 },
            { name: 'Xumo Play', url: 'https://www.xumo.tv', order: 14 },
            { name: 'Crackle', url: 'https://www.crackle.com', order: 15 },
            { name: 'Canal+', url: 'https://www.canalplus.com/', order: 16 },
            { name: 'Apple TV+', url: 'https://tv.apple.com/fr', order: 17 },
            { name: 'Gulli', url: 'https://replay.gulli.fr/Direct', order: 18 },
            { name: 'TNT en Direct', url: 'https://www.tntendirect.com', order: 19 },
            { name: 'Euronews', url: 'https://fr.euronews.com/live', order: 20 }
        ],
        'musique': [
            { name: 'Apple Music', url: 'https://music.apple.com', order: 1 },
            { name: 'Deezer', url: 'https://www.deezer.com/en/channels/explore/', order: 2 },
            { name: 'SoundCloud', url: 'https://www.soundcloud.com', order: 3 },
            { name: 'Tidal', url: 'https://www.tidal.com', order: 4 },
            { name: 'Spotify', url: 'https://open.spotify.com/', order: 5 },
            { name: 'Amazon Music', url: 'https://music.amazon.fr/', order: 6 },
            { name: 'YouTube Music', url: 'https://music.youtube.com', order: 7 },
            { name: 'Qobuz', url: 'https://www.qobuz.com', order: 8 },
            { name: 'AccuRadio', url: 'https://www.accuradio.com', order: 9 },
            { name: 'iHeartRadio', url: 'https://www.iheart.com', order: 10 },
            { name: 'MixCloud', url: 'https://www.mixcloud.com', order: 11 },
            { name: 'Pandora', url: 'https://www.pandora.com', order: 12 },
            { name: 'LiveOne', url: 'https://www.liveone.com', order: 13 },
            { name: 'Idagio', url: 'https://www.idagio.com', order: 14 },
            { name: 'TuneIn', url: 'https://tunein.com', order: 15 }
        ],
        'jeux': [
            { name: 'Steam', url: 'https://store.steampowered.com', order: 1 },
            { name: 'Epic Games Store', url: 'https://www.epicgames.com/store', order: 2 },
            { name: '2048', url: 'https://jeu2048.fr', order: 3 },
            { name: 'Solitaire', url: 'https://solitaire.com', order: 4 },
            { name: 'Tetris', url: 'https://tetris.com', order: 5 },
            { name: 'Minesweeper', url: 'https://minesweeperonline.com', order: 6 },
            { name: 'Snake', url: 'https://playsnake.org', order: 7 },
            { name: 'Chess', url: 'https://www.chess.com', order: 8 },
            { name: 'Checkers', url: 'https://www.checkers.com', order: 9 }
        ],
        'navigation': [
            { name: 'Google Maps', url: 'https://maps.google.com', order: 1 },
            { name: 'Waze', url: 'https://www.waze.com', order: 2 },
            { name: 'Apple Maps', url: 'https://maps.apple.com', order: 3 },
            { name: 'Here WeGo', url: 'https://wego.here.com', order: 4 },
            { name: 'OpenStreetMap', url: 'https://www.openstreetmap.org', order: 5 },
            { name: 'MapQuest', url: 'https://www.mapquest.com', order: 6 },
            { name: 'Bing Maps', url: 'https://www.bing.com/maps', order: 7 },
            { name: 'A Better Route Planner', url: 'https://abetterrouteplanner.com', order: 8 },
            { name: 'Infotraffic', url: 'https://www.infotrafic.com/', order: 9 }
        ],
        'électrique🚗🔋': [
            { name: 'A Better Route Planner', url: 'https://abetterrouteplanner.com', order: 1 },
            { name: 'PlugShare', url: 'https://www.plugshare.com', order: 2 },
            { name: 'ChargePoint', url: 'https://www.chargepoint.com', order: 3 },
            { name: 'Tesla Supercharger', url: 'https://www.tesla.com/supercharger', order: 4 },
            { name: 'Electrify America', url: 'https://www.electrifyamerica.com', order: 5 },
            { name: 'EVgo', url: 'https://www.evgo.com', order: 6 },
            { name: 'Zap-Map', url: 'https://www.zap-map.com', order: 7 },
            { name: 'Ionity', url: 'https://www.ionity.eu', order: 8 },
            { name: 'ChargeMap', url: 'https://fr.chargemap.com/map', order: 9 },
            { name: 'ChargePrice', url: 'https://fr.chargeprice.app/', order: 10 },
            { name: 'Supercharge.info', url: 'https://www.supercharge.info', order: 11 },
            { name: 'Tesla Motors Club', url: 'https://www.teslamotorsclub.com', order: 12 },
            { name: 'Teslarati', url: 'https://www.teslarati.com', order: 13 },
            { name: 'Teslafi', url: 'https://www.teslafi.com/', order: 14 },
            { name: 'Windy', url: 'https://www.windy.com/', order: 15 },
            { name: 'Weather.com', url: 'https://weather.com', order: 16 },
            { name: 'EV Database', url: 'https://ev-database.org', order: 17 },
            { name: 'MyEV', url: 'https://www.myev.com', order: 18 },
            { name: 'EVCompare.io', url: 'https://evcompare.io', order: 19 },
            { name: 'InsideEVs', url: 'https://insideevs.com', order: 20 }
        ],
        'social': [
            { name: 'Facebook', url: 'https://www.facebook.com', order: 1 },
            { name: 'X', url: 'https://www.x.com', order: 2 },
            { name: 'Instagram', url: 'https://www.instagram.com', order: 3 },
            { name: 'LinkedIn', url: 'https://www.linkedin.com', order: 4 },
            { name: 'Snapchat', url: 'https://www.snapchat.com', order: 5 },
            { name: 'TikTok', url: 'https://www.tiktok.com', order: 6 },
            { name: 'Reddit', url: 'https://www.reddit.com', order: 7 },
            { name: 'WhatsApp Web', url: 'https://web.whatsapp.com', order: 8 }
        ]
    };


    // Charger les pages et raccourcis depuis localStorage ou utiliser les pages par défaut
    function loadFromLocalStorage() {
        // Charger les pages enregistrées dans le localStorage
        const pages = JSON.parse(localStorage.getItem('pages')) || Object.keys(defaultPages);
    
        pages.forEach(page => {
            createPageSection(page);
    
            let shortcuts = JSON.parse(localStorage.getItem(page)) || [];
            
            // Si aucun raccourci n'est enregistré, charger les raccourcis par défaut
            if (shortcuts.length === 0 && defaultPages[page]) {
                shortcuts = defaultPages[page];  // Charger les raccourcis par défaut
                localStorage.setItem(page, JSON.stringify(shortcuts)); // Sauvegarder les raccourcis par défaut dans le localStorage
            }
    
            // Trier les raccourcis par 'order' avant de les afficher
            shortcuts.sort((a, b) => a.order - b.order);
    
            // Vider le conteneur avant de le remplir
            const container = document.querySelector(`#${page} .shortcuts-container`);
            container.innerHTML = '';  // Assure que le conteneur est vide avant d'ajouter les raccourcis
            
            // Ajouter les raccourcis dans l'ordre
            shortcuts.forEach(shortcut => {
                addNewShortcut(page, shortcut.name, shortcut.url, shortcut.order);
            });
        });
    
        setActiveSection(pages[0]);
    }
    
    
    

    // Sauvegarder les pages et raccourcis dans localStorage
    function saveToLocalStorage() {
        const pages = [];
        document.querySelectorAll('.page-section').forEach(section => {
            pages.push(section.id);
        });
        localStorage.setItem('pages', JSON.stringify(pages));
    
        // Sauvegarder les raccourcis pour chaque page avec ordre
        pages.forEach(page => {
            const shortcuts = [];
            document.querySelector(`#${page} .shortcuts-container`).querySelectorAll('.shortcut').forEach(shortcutEl => {
                const link = shortcutEl.querySelector('span').textContent;
                const url = shortcutEl.querySelector('a').href;
                const order = shortcutEl.dataset.order; 
                shortcuts.push({ name: link, url: url, order: parseInt(order) });
            });
            localStorage.setItem(page, JSON.stringify(shortcuts));
        });
    }
    
    
    // Supprimer un raccourci du localStorage
    function removeShortcutFromLocalStorage(page, shortcutElement) {
        const shortcutName = shortcutElement.querySelector('span').textContent;
        let shortcuts = JSON.parse(localStorage.getItem(page) || '[]');
        shortcuts = shortcuts.filter(shortcut => shortcut.name !== shortcutName);
        localStorage.setItem(page, JSON.stringify(shortcuts));
    }

    // Supprimer une page du localStorage
    function removePageFromLocalStorage(pageName) {
        localStorage.removeItem(pageName);
        let pages = JSON.parse(localStorage.getItem('pages') || '[]');
        pages = pages.filter(page => page !== pageName);
        localStorage.setItem('pages', JSON.stringify(pages));
    }

    // Créer une nouvelle section de page
    function createPageSection(pageName) {
        if (document.getElementById(pageName)) return; // Vérifie si la page existe déjà
        const section = document.createElement('section');
        section.id = pageName;
        section.classList.add('page-section');
        if (pageName === 'cinema') section.classList.add('active');
        section.innerHTML = `<div class="shortcuts-container"></div>`;
        contentContainer.appendChild(section);

        const menuLink = document.createElement('li');
        menuLink.innerHTML = `
            <a href="#${pageName}" class="menu-link">${pageName.charAt(0).toUpperCase() + pageName.slice(1)}</a>
            ${isEditMode ? '<button class="delete-page">❌</button>' : ''}
        `;

        menuLink.querySelector('a').addEventListener('click', (event) => {
            event.preventDefault();
            setActiveSection(pageName);
        });

        // Ajouter un bouton de suppression de la page et son événement de clic
        const deleteButton = menuLink.querySelector('.delete-page');
        if (deleteButton) {
            deleteButton.addEventListener('click', (event) => {
                event.stopPropagation();
                if (confirm(`Voulez-vous vraiment supprimer la page "${pageName}" ?`)) {
                    contentContainer.removeChild(section);
                    menuLinks.removeChild(menuLink);
                    removePageFromLocalStorage(pageName);
                    saveToLocalStorage();
                }
            });
        }

        menuLinks.appendChild(menuLink);
    }

    // Fonction pour réinitialiser le localStorage et rafraîchir la page
    function resetConfig() {
        if (confirm("Êtes-vous sûr de vouloir réinitialiser la configuration ? Cette action supprimera toutes les données enregistrées.")) {
            localStorage.clear(); // Supprime toutes les données du localStorage
            location.reload(); // Rafraîchit la page
        }
    }

    // Ajouter l'écouteur d'événement pour le bouton "Réinitialiser"
    document.getElementById('resetButton').addEventListener('click', resetConfig);

    // Activer le mode édition
    editModeToggle.addEventListener('click', () => {
        isEditMode = !isEditMode;

        addPageButton.style.display = isEditMode ? 'inline-block' : 'none';
        addShortcutButton.style.display = isEditMode ? 'inline-block' : 'none';
        document.getElementById('exportConfigButton').style.display = isEditMode ? 'inline-block' : 'none';
        document.getElementById('importConfigButton').style.display = isEditMode ? 'inline-block' : 'none';
        document.getElementById('resetButton').style.display = isEditMode ? 'inline-block' : 'none'; // Affiche le bouton Réinitialiser
        document.getElementById('importConfigURL').style.display = 'none'; // Toujours cacher l'input de l'importation au début

        // Ajouter ou retirer la classe active pour le bouton de désactivation du mode édition
        if (isEditMode) {
            editModeToggle.textContent = 'Désactiver le Mode Édition';
            editModeToggle.classList.add('active'); // Ajoute la classe active pour le style rouge bordeaux
        } else {
            editModeToggle.textContent = 'Activer le Mode Édition';
            editModeToggle.classList.remove('active'); // Retire la classe active
        }

        // Gestion des raccourcis en mode édition
        document.querySelectorAll('.shortcut').forEach(shortcut => {
            if (isEditMode) {
                // Ajouter la croix de suppression
                if (!shortcut.querySelector('.delete-shortcut')) {
                    const deleteButton = document.createElement('button');
                    deleteButton.className = 'delete-shortcut';
                    deleteButton.textContent = '❌';
                    deleteButton.style.display = 'block';
                    deleteButton.addEventListener('click', (event) => {
                        event.stopPropagation();
                        const page = shortcut.closest('.page-section').id;
                        shortcut.parentElement.removeChild(shortcut);
                        removeShortcutFromLocalStorage(page, shortcut);
                        saveToLocalStorage();
                    });
                    shortcut.appendChild(deleteButton);
                }

                // Ajouter les flèches de déplacement
                if (!shortcut.querySelector('.move-up')) {
                    const moveUpButton = document.createElement('button');
                    moveUpButton.className = 'move-up';
                    moveUpButton.textContent = '⬆️';
                    moveUpButton.addEventListener('click', (event) => {
                        event.stopPropagation();
                        moveShortcut(shortcut, 'up');
                    });
                    shortcut.appendChild(moveUpButton);
                }

                if (!shortcut.querySelector('.move-down')) {
                    const moveDownButton = document.createElement('button');
                    moveDownButton.className = 'move-down';
                    moveDownButton.textContent = '⬇️';
                    moveDownButton.addEventListener('click', (event) => {
                        event.stopPropagation();
                        moveShortcut(shortcut, 'down');
                    });
                    shortcut.appendChild(moveDownButton);
                }
            } else {
                // Supprimer les boutons en dehors du mode édition
                const deleteButton = shortcut.querySelector('.delete-shortcut');
                if (deleteButton) {
                    deleteButton.remove();
                }
                const moveUpButton = shortcut.querySelector('.move-up');
                if (moveUpButton) {
                    moveUpButton.remove();
                }
                const moveDownButton = shortcut.querySelector('.move-down');
                if (moveDownButton) {
                    moveDownButton.remove();
                }
            }
        });

        document.querySelectorAll('#menu li').forEach(menuLink => {
            if (isEditMode) {
                menuLink.classList.add('is-edit-mode');
                if (!menuLink.querySelector('.delete-page')) {
                    const deleteButton = document.createElement('button');
                    deleteButton.className = 'delete-page';
                    deleteButton.textContent = '❌';
                    menuLink.appendChild(deleteButton);

                    deleteButton.addEventListener('click', (event) => {
                        event.stopPropagation();
                        const pageName = menuLink.querySelector('a').getAttribute('href').substring(1);
                        if (confirm(`Voulez-vous vraiment supprimer la page "${pageName}" ?`)) {
                            document.getElementById(pageName).remove();
                            menuLink.remove();
                            removePageFromLocalStorage(pageName);
                            saveToLocalStorage();
                        }
                    });
                }
            } else {
                menuLink.classList.remove('is-edit-mode');
                const deleteButton = menuLink.querySelector('.delete-page');
                if (deleteButton) {
                    deleteButton.remove();
                }
            }
        });

        editModeToggle.textContent = isEditMode ? 'Désactiver le Mode Édition' : 'Activer le Mode Édition';
        addPageForm.style.display = 'none';
        addShortcutForm.style.display = 'none';
    });


    // Afficher le formulaire d'ajout de page
    addPageButton.addEventListener('click', () => {
        addPageForm.style.display = addPageForm.style.display === 'none' ? 'block' : 'none';
    });

    // Afficher le formulaire d'ajout de raccourci
    addShortcutButton.addEventListener('click', () => {
        addShortcutForm.style.display = addShortcutForm.style.display === 'none' ? 'block' : 'none';
    });

    // Ajouter une nouvelle page (uniquement pour les pages non de base)
    document.querySelector('#addPageForm button').addEventListener('click', addNewPage);

    function addNewPage() {
        let newPageName = newPageInput.value.trim();
        // Replace all spaces (including between words) with hyphens
        newPageName = newPageName.replace(/\s+/g, '-');
        
        if (newPageName && !document.getElementById(newPageName)) {
            createPageSection(newPageName);
            saveToLocalStorage();
            newPageInput.value = '';
            addPageForm.style.display = 'none';
        } else {
            alert('Le nom de la page est vide ou existe déjà.');
        }
    }
    

    // Ajouter un raccourci à la page actuelle
    document.querySelector('#addShortcutForm button').addEventListener('click', addShortcutToCurrentPage);

    function addShortcutToCurrentPage() {
        const shortcutName = shortcutNameInput.value.trim();
        const shortcutURL = shortcutURLInput.value.trim();
        if (shortcutName && shortcutURL) {
            addNewShortcut(currentSection, shortcutName, shortcutURL);
            saveToLocalStorage();
            shortcutNameInput.value = '';
            shortcutURLInput.value = '';
            addShortcutForm.style.display = 'none';
        } else {
            alert('Le nom ou l\'URL du raccourci est vide.');
        }
    }

    // Fonction pour obtenir le meilleur favicon disponible
    function getBestFaviconUrl(domain) {
        const sizes = [256, 128, 64, 32, 16];
        return new Promise((resolve) => {
            let index = 0;
            function tryNext() {
                if (index >= sizes.length) {
                    resolve(null); // Aucun favicon trouvé
                    return;
                }
                const size = sizes[index];
                // Première tentative avec 'https://'
                const faviconUrl = `https://www.google.com/s2/favicons?sz=${size}&domain=https://${domain}`;
                const img = new Image();
                img.onload = function() {
                    resolve(faviconUrl);
                }
                img.src = faviconUrl;
            }
            tryNext();
        });
    }



    // Ajouter un nouveau raccourci avec le meilleur favicon disponible
    async function addNewShortcut(page, name, url, order) {
        const container = document.querySelector(`#${page} .shortcuts-container`);
        
        // Ne pas ajouter de raccourci en double
        if (document.querySelector(`#${page} .shortcuts-container [data-order="${order}"]`)) {
            return;
        }

        const shortcut = document.createElement('div');
        shortcut.classList.add('shortcut');

        // Utiliser le chemin correct pour le favicon par défaut
        const defaultFavicon = './img/default-favicon.png'; // Chemin correct du favicon par défaut
        shortcut.innerHTML = `
            <a href="${url}" target="_blank">
                <img src="${defaultFavicon}" alt="${name} logo">
                <span>${name}</span>
            </a>
            ${isEditMode ? `
                <button class="delete-shortcut">❌</button>
                <button class="move-up">⬆️</button>
                <button class="move-down">⬇️</button>` : ''}
        `;

        shortcut.dataset.order = order; // Attribuer l'ordre

        // Ajouter l'événement de suppression en mode édition
        if (isEditMode) {
            const deleteButton = shortcut.querySelector('.delete-shortcut');
            deleteButton.addEventListener('click', (event) => {
                event.stopPropagation();
                container.removeChild(shortcut);
                removeShortcutFromLocalStorage(page, shortcut);
                saveToLocalStorage();
            });
        }

        container.appendChild(shortcut);

        // Charger le favicon réel après l'affichage initial
        const realFavicon = await getBestFaviconUrl(new URL(url).hostname) || defaultFavicon;
        shortcut.querySelector('img').src = realFavicon;  // Mettre à jour le favicon réel
    }

    

    // Définir la section active
    function setActiveSection(pageName) {
        currentSection = pageName;
        document.querySelectorAll('.page-section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(pageName).classList.add('active');
        document.querySelectorAll('.menu-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`[href="#${pageName}"]`).classList.add('active');
    }

    // Fonction pour exporter la configuration vers dpaste
    async function exportConfig() {
        // Obtenir les pages et raccourcis depuis le localStorage
        const pages = JSON.parse(localStorage.getItem('pages') || '[]');
        const dataToExport = {};
        pages.forEach(page => {
            const shortcuts = JSON.parse(localStorage.getItem(page) || '[]');
            dataToExport[page] = shortcuts;
        });

        // Convertir les données en JSON
        const jsonData = JSON.stringify(dataToExport, null, 2);

        // Préparer les données à envoyer sous forme d'URL encodée
        const formData = new URLSearchParams();
        formData.append('content', jsonData);
        formData.append('syntax', 'json');
        formData.append('expire_days', '7');

        // Envoyer les données à dpaste
        try {
            const response = await fetch('https://dpaste.com/api/v2/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded' // Changer le type de contenu
                },
                body: formData.toString() // Convertir en chaîne de caractères encodée
            });

            if (response.ok) {
                const result = await response.text();

                // Mettre à jour le lien dans l'interface utilisateur
                const exportedLinkContainer = document.getElementById('exportedLinkContainer');
                const exportedLink = document.getElementById('exportedLink');
                
                exportedLink.href = result;
                exportedLink.textContent = result;
                exportedLinkContainer.style.display = 'block';
            } else {
                const errorData = await response.json();
                console.error('Erreur:', errorData);
                alert('Erreur lors de l\'exportation vers dpaste.');
            }
        } catch (error) {
            console.error('Erreur lors de la requête dpaste:', error);
            alert('Erreur lors de la connexion à dpaste.');
        }
    }



    // Fonction pour importer la configuration depuis dpaste
    async function importConfig() {
        const dpasteID = document.getElementById('importConfigID').value.trim();
        if (!dpasteID) {
            alert('Veuillez entrer un identifiant Dpaste.');
            return;
        }

        const dpasteURL = `https://dpaste.com/${dpasteID}.txt`; // Construire l'URL à partir de l'identifiant

        // Récupérer les données depuis le lien dpaste
        try {
            const response = await fetch(dpasteURL); // Récupère le contenu brut
            if (response.ok) {
                const data = await response.json();
                if (typeof data === 'object') {
                    // Vérifier le format des données
                    if (Object.keys(data).every(page => Array.isArray(data[page]))) {
                        // Sauvegarder les données importées dans le localStorage
                        localStorage.setItem('pages', JSON.stringify(Object.keys(data)));
                        Object.keys(data).forEach(page => {
                            localStorage.setItem(page, JSON.stringify(data[page]));
                        });

                        alert('Configuration importée avec succès !');
                        loadFromLocalStorage(); // Recharger l'interface avec les nouvelles données
                    } else {
                        alert('Le format des données importées est incorrect.');
                    }
                } else {
                    alert('Le format des données importées est incorrect.');
                }
            } else {
                alert('Erreur lors de la récupération des données depuis dpaste.');
            }
        } catch (error) {
            console.error('Erreur lors de la requête dpaste:', error);
            alert('Erreur lors de la connexion à dpaste.');
        }
    }

    // Ajouter des écouteurs d'événements pour les boutons
    document.getElementById('exportConfigButton').addEventListener('click', exportConfig);
    document.getElementById('importConfigButton').addEventListener('click', () => {
        const importContainer = document.getElementById('importConfigContainer');
        importContainer.style.display = importContainer.style.display === 'none' ? 'block' : 'none';
        if (importContainer.style.display === 'block') {
            document.getElementById('importConfigID').focus();
        }
    });
    document.getElementById('confirmImportButton').addEventListener('click', importConfig);
    

    document.addEventListener('click', function(event) {
        if (event.target.classList.contains('move-up')) {
            moveShortcut(event.target.closest('.shortcut'), 'up');
        } else if (event.target.classList.contains('move-down')) {
            moveShortcut(event.target.closest('.shortcut'), 'down');
        }
    });
    
    function moveShortcut(shortcutElement, direction) {
        const container = shortcutElement.parentElement;
        const page = container.closest('.page-section').id;
        let shortcuts = JSON.parse(localStorage.getItem(page) || '[]');
    
        const index = Array.from(container.children).indexOf(shortcutElement);
    
        if (direction === 'up' && index > 0) {
            container.insertBefore(shortcutElement, container.children[index - 1]);
            [shortcuts[index - 1], shortcuts[index]] = [shortcuts[index], shortcuts[index - 1]];
        } else if (direction === 'down' && index < container.children.length - 1) {
            container.insertBefore(shortcutElement, container.children[index + 2]);
            [shortcuts[index], shortcuts[index + 1]] = [shortcuts[index + 1], shortcuts[index]];
        }
    
        // Mettre à jour localStorage avec le nouvel ordre
        shortcuts.forEach((shortcut, i) => shortcut.order = i + 1);  // Assigner un nouvel ordre
        localStorage.setItem(page, JSON.stringify(shortcuts));
    }
    
    
    loadFromLocalStorage();
});
