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
        "cinema": [
          {
            "name": "CrunchyRoll",
            "url": "https://www.crunchyroll.com/",
            "order": 0
          },
          {
            "name": "Plex",
            "url": "https://app.plex.tv/",
            "order": 1
          },
          {
            "name": "Prime Video",
            "url": "https://www.primevideo.com/",
            "order": 2
          },
          {
            "name": "Disney",
            "url": "https://www.disneyplus.com/",
            "order": 3
          },
          {
            "name": "Hulu",
            "url": "https://www.hulu.com/",
            "order": 4
          },
          {
            "name": "HBOMax",
            "url": "https://www.hbomax.com/",
            "order": 5
          },
          {
            "name": "Paramount",
            "url": "https://www.paramountplus.com/fr/",
            "order": 6
          },
          {
            "name": "PlutoTV",
            "url": "https://pluto.tv/fr/",
            "order": 7
          },
          {
            "name": "Crave",
            "url": "https://www.crave.ca/fr",
            "order": 8
          },
          {
            "name": "Starz",
            "url": "https://www.starz.com/",
            "order": 9
          },
          {
            "name": "DAZN",
            "url": "https://www.dazn.com/",
            "order": 10
          },
          {
            "name": "Canal",
            "url": "https://www.canalplus.com/",
            "order": 11
          },
          {
            "name": "AppleTV",
            "url": "https://tv.apple.com/fr",
            "order": 12
          },
          {
            "name": "CinePrime",
            "url": "https://www.youtube.com/@CINE_PRIME",
            "order": 13
          },
          {
            "name": "CineMovies",
            "url": "https://www.youtube.com/channel/UCwIdNiqZoMq8rS4EFMuMPFQ",
            "order": 14
          },
          {
            "name": "CineNanar",
            "url": "https://www.youtube.com/channel/UCQck1eAT_665Vn31P7qSzXQ",
            "order": 15
          },
          {
            "name": "Gulli",
            "url": "https://replay.gulli.fr/Direct",
            "order": 16
          },
          {
            "name": "AnimeSama",
            "url": "https://anime-sama.fr/",
            "order": 17
          }
        ],
        "music": [
          {
            "name": "Apple Music",
            "url": "https://music.apple.com/",
            "order": 1
          },
          {
            "name": "Deezer",
            "url": "https://www.deezer.com/en/channels/explore/",
            "order": 2
          },
          {
            "name": "SoundCloud",
            "url": "https://www.soundcloud.com/",
            "order": 3
          },
          {
            "name": "Tidal",
            "url": "https://www.tidal.com/",
            "order": 4
          },
          {
            "name": "Spotify",
            "url": "https://open.spotify.com/",
            "order": 5
          },
          {
            "name": "Qobuz",
            "url": "https://www.qobuz.com/",
            "order": 6
          },
          {
            "name": "ZeffyrMusic",
            "url": "https://www.zeffyrmusic.com/",
            "order": 7
          },
          {
            "name": "AllForMusic",
            "url": "https://www.allformusic.fr/",
            "order": 8
          },
          {
            "name": "AccuRadio",
            "url": "https://www.accuradio.com/",
            "order": 9
          },
          {
            "name": "iHeartRadio",
            "url": "https://www.iheart.com/",
            "order": 10
          },
          {
            "name": "MixCloud",
            "url": "https://www.mixcloud.com/",
            "order": 11
          },
          {
            "name": "Pandora",
            "url": "https://www.pandora.com/",
            "order": 12
          },
          {
            "name": "LiveOne",
            "url": "https://www.liveone.com/",
            "order": 13
          },
          {
            "name": "Idagio",
            "url": "https://www.idagio.com/",
            "order": 14
          },
          {
            "name": "TuneIn",
            "url": "https://tunein.com/",
            "order": 15
          }
        ],
        "games": [
          {
            "name": "Twitch",
            "url": "https://www.twitch.tv/",
            "order": 1
          },
          {
            "name": "Kick",
            "url": "https://kick.com/",
            "order": 2
          },
          {
            "name": "AirConsole",
            "url": "https://www.airconsole.com/",
            "order": 3
          },
          {
            "name": "2048",
            "url": "https://jeu2048.fr/",
            "order": 4
          },
          {
            "name": "Solitaire",
            "url": "https://solitaire.com/",
            "order": 5
          },
          {
            "name": "Tetris",
            "url": "https://tetris.com/",
            "order": 6
          },
          {
            "name": "Minesweeper",
            "url": "https://minesweeperonline.com/",
            "order": 7
          },
          {
            "name": "Snake",
            "url": "https://playsnake.org/",
            "order": 8
          },
          {
            "name": "Chess",
            "url": "https://www.chess.com/",
            "order": 9
          },
          {
            "name": "Checkers",
            "url": "https://www.checkers.com/",
            "order": 10
          },
          {
            "name": "Crazy Games",
            "url": "https://www.crazygames.fr/",
            "order": 11
          },
          {
            "name": "Jeux.fr",
            "url": "https://www.jeux.fr/",
            "order": 12
          },
          {
            "name": "1001 Jeux",
            "url": "https://www.1001jeux.fr/",
            "order": 13
          },
          {
            "name": "Poki",
            "url": "https://poki.com/fr",
            "order": 14
          },
          {
            "name": "Jeux-Gratuits.com",
            "url": "https://www.jeux-gratuits.com/",
            "order": 15
          },
          {
            "name": "PlayHop",
            "url": "https://playhop.com/fr",
            "order": 16
          }
        ],
        "weather": [
          {
            "name": "Ventusky",
            "url": "https://www.ventusky.com/",
            "order": 0
          },
          {
            "name": "Windy",
            "url": "https://www.windy.com/",
            "order": 1
          },
          {
            "name": "Weather.com",
            "url": "https://weather.com/",
            "order": 2
          },
          {
            "name": "LaChaineMeteo",
            "url": "https://www.lachainemeteo.com/",
            "order": 3
          },
          {
            "name": "Météo France",
            "url": "https://meteofrance.com/",
            "order": 4
          }
        ],
        "navigation": [
          {
            "name": "GoogleMaps",
            "url": "https://maps.google.com/",
            "order": 1
          },
          {
            "name": "Waze",
            "url": "https://www.waze.com/",
            "order": 2
          },
          {
            "name": "Tesla_Waze",
            "url": "https://teslawaze.azurewebsites.net/",
            "order": 3
          },
          {
            "name": "Apple Maps",
            "url": "https://maps.apple.com/",
            "order": 4
          },
          {
            "name": "Here WeGo",
            "url": "https://wego.here.com/",
            "order": 5
          },
          {
            "name": "OpenStreetMap",
            "url": "https://www.openstreetmap.org/",
            "order": 6
          },
          {
            "name": "MapQuest",
            "url": "https://www.mapquest.com/",
            "order": 7
          },
          {
            "name": "BingMaps",
            "url": "https://www.bing.com/maps",
            "order": 8
          },
          {
            "name": "A Better Route Planner",
            "url": "https://abetterrouteplanner.com/",
            "order": 9
          },
          {
            "name": "Infotraffic",
            "url": "https://www.infotrafic.com/",
            "order": 10
          }
        ],
        "charging": [
          {
            "name": "ABetterRoutePlanner",
            "url": "https://abetterrouteplanner.com/",
            "order": 1
          },
          {
            "name": "PlugShare",
            "url": "https://www.plugshare.com/",
            "order": 2
          },
          {
            "name": "ChargePoint",
            "url": "https://www.chargepoint.com/",
            "order": 3
          },
          {
            "name": "Tesla Supercharger",
            "url": "https://www.tesla.com/trips",
            "order": 4
          },
          {
            "name": "Electrify America",
            "url": "https://www.electrifyamerica.com/",
            "order": 5
          },
          {
            "name": "EVgo",
            "url": "https://www.evgo.com/",
            "order": 6
          },
          {
            "name": "ZapMap",
            "url": "https://www.zap-map.com/",
            "order": 7
          },
          {
            "name": "Ionity",
            "url": "https://www.ionity.eu/",
            "order": 8
          },
          {
            "name": "ChargeMap",
            "url": "https://fr.chargemap.com/map",
            "order": 9
          },
          {
            "name": "ChargePrice",
            "url": "https://fr.chargeprice.app/",
            "order": 10
          }
        ],
        "news": [
          {
            "name": "CNews",
            "url": "https://www.cnews.fr/le-direct",
            "order": 0
          },
          {
            "name": "Euronews",
            "url": "https://fr.euronews.com/live",
            "order": 1
          },
          {
            "name": "AFP",
            "url": "https://www.afp.com/",
            "order": 2
          },
          {
            "name": "BFMTV",
            "url": "https://www.bfmtv.com/",
            "order": 3
          },
          {
            "name": "20Minutes",
            "url": "https://www.20minutes.fr/",
            "order": 4
          },
          {
            "name": "LeMonde",
            "url": "https://www.lemonde.fr/",
            "order": 5
          },
          {
            "name": "LeFigaro",
            "url": "https://www.lefigaro.fr/",
            "order": 6
          },
          {
            "name": "France 24",
            "url": "https://www.france24.com/",
            "order": 7
          },
          {
            "name": "Reuters",
            "url": "https://www.reuters.com/",
            "order": 8
          },
          {
            "name": "BBC News",
            "url": "https://www.bbc.com/news",
            "order": 9
          },
          {
            "name": "TheGuardian",
            "url": "https://www.theguardian.com/",
            "order": 10
          },
          {
            "name": "Libération",
            "url": "https://www.liberation.fr/",
            "order": 11
          },
          {
            "name": "Express",
            "url": "https://www.lexpress.fr/",
            "order": 12
          },
          {
            "name": "FranceInfo",
            "url": "https://www.francetvinfo.fr/",
            "order": 13
          },
          {
            "name": "NewYorkTimes",
            "url": "https://www.nytimes.com/",
            "order": 14
          },
          {
            "name": "TheWashingtonPost",
            "url": "https://www.washingtonpost.com/",
            "order": 15
          },
          {
            "name": "CNN",
            "url": "https://edition.cnn.com/",
            "order": 16
          },
          {
            "name": "AlJazeera",
            "url": "https://www.aljazeera.com/",
            "order": 17
          },
          {
            "name": "Mediapart",
            "url": "https://www.mediapart.fr/",
            "order": 18
          },
          {
            "name": "RTBFInfo",
            "url": "https://www.rtbf.be/info",
            "order": 19
          },
          {
            "name": "RTNews",
            "url": "https://www.rt.com/",
            "order": 20
          }
        ],
        "tv": [
          {
            "name": "MolotovTV",
            "url": "https://www.molotov.tv/",
            "order": 1
          },
          {
            "name": "TNTenDirect",
            "url": "https://www.tntendirect.com/",
            "order": 2
          },
          {
            "name": "Francetv",
            "url": "https://www.france.tv/",
            "order": 3
          },
          {
            "name": "MyTF1",
            "url": "https://www.tf1.fr/",
            "order": 4
          },
          {
            "name": "6play",
            "url": "https://www.6play.fr/",
            "order": 5
          },
          {
            "name": "Arte.tv",
            "url": "https://www.arte.tv/fr/",
            "order": 6
          },
          {
            "name": "TV5Monde",
            "url": "https://www.tv5monde.com/",
            "order": 13
          },
          {
            "name": "RTBFAuvio",
            "url": "https://www.rtbf.be/auvio/direct",
            "order": 14
          },
          {
            "name": "PlutoTV",
            "url": "https://pluto.tv/live-tv",
            "order": 16
          },
          {
            "name": "StreemaTV",
            "url": "https://streema.com/tv",
            "order": 17
          }
        ],
        "social": [
          {
            "name": "Facebook",
            "url": "https://www.facebook.com/",
            "order": 1
          },
          {
            "name": "X",
            "url": "https://www.x.com/",
            "order": 2
          },
          {
            "name": "Instagram",
            "url": "https://www.instagram.com/",
            "order": 3
          },
          {
            "name": "LinkedIn",
            "url": "https://www.linkedin.com/",
            "order": 4
          },
          {
            "name": "Snapchat",
            "url": "https://www.snapchat.com/",
            "order": 5
          },
          {
            "name": "TikTok",
            "url": "https://www.tiktok.com/",
            "order": 6
          },
          {
            "name": "Reddit",
            "url": "https://www.reddit.com/",
            "order": 7
          },
          {
            "name": "WhatsAppWeb",
            "url": "https://web.whatsapp.com/",
            "order": 8
          },
          {
            "name": "Pinterest",
            "url": "https://www.pinterest.com/",
            "order": 9
          },
          {
            "name": "Tumblr",
            "url": "https://www.tumblr.com/",
            "order": 10
          },
          {
            "name": "Discord",
            "url": "https://discord.com/channels/@me",
            "order": 11
          },
          {
            "name": "TelegramWeb",
            "url": "https://web.telegram.org/",
            "order": 12
          }
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
                if (confirm(`Do you really want to delete the page "${pageName}" ?`)) {
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
        if (confirm("Are you sure you want to reset the configuration? This action will delete all saved data.")) {
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
            editModeToggle.textContent = 'Disable Edit Mode';
            editModeToggle.classList.add('active'); // Ajoute la classe active pour le style rouge bordeaux
        } else {
            editModeToggle.textContent = 'Enable Edit Mode';
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

        editModeToggle.textContent = isEditMode ? 'Disable Edit Mode' : 'Enable Edit Mode';
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
        newPageName = newPageName.replace(/\s+/g, '_');
        
        if (newPageName && !document.getElementById(newPageName)) {
            createPageSection(newPageName);
            saveToLocalStorage();
            newPageInput.value = '';
            addPageForm.style.display = 'none';
        } else {
            alert('The page name is empty or already exists.');
        }
    }
    

    // Ajouter un raccourci à la page actuelle
    document.querySelector('#addShortcutForm button').addEventListener('click', addShortcutToCurrentPage);

    function addShortcutToCurrentPage() {
        const shortcutName = shortcutNameInput.value.trim().replace(/[^a-zA-Z0-9]/g, '_');
        const shortcutURL = shortcutURLInput.value.trim();
        if (shortcutName && shortcutURL) {
            addNewShortcut(currentSection, shortcutName, shortcutURL);
            saveToLocalStorage();
            shortcutNameInput.value = '';
            shortcutURLInput.value = '';
            addShortcutForm.style.display = 'none';
            // history.replaceState(null, '', '/');  // Redirige vers la racine
            // location.reload();  // Rafraîchit la page
        } else {
            alert('The shortcut name or URL is empty.');
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


  // Fonction pour exporter la configuration vers Telegraph avec le même randomID pour l'auteur et la page, et avec vérification
  async function exportConfig() {
    try {
        // Récupérer toutes les clés disponibles dans le localStorage
        const keys = Object.keys(localStorage);
        const dataToExport = {};

        // Boucle sur chaque clé pour récupérer les raccourcis associés
        keys.forEach(key => {
            const shortcuts = JSON.parse(localStorage.getItem(key) || '[]');
            dataToExport[key] = shortcuts;
        });

        // Vérification des données extraites
        if (Object.keys(dataToExport).length === 0) {
            throw new Error("Aucune page ou raccourci trouvé dans le localStorage.");
        }

        // Convertir les données en JSON avec gestion des caractères spéciaux
        const jsonData = JSON.stringify(dataToExport, null, 2);
        if (!jsonData) {
            throw new Error("Échec de la conversion des données en JSON.");
        }

        // Générer un ID aléatoire pour l'exportation
        const randomID = generateRandomID(); // Utilisé à la fois pour le titre et le nom de l'auteur

        // Générer un access token pour Telegraph
        const accessToken = await getTelegraphAccessToken();
        if (!accessToken) {
            throw new Error("Impossible de générer un access token pour Telegraph.");
        }

        // Créer une page sur Telegraph avec les données JSON
        const response = await fetch('https://api.telegra.ph/createPage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                'access_token': accessToken,
                'title': `EvPortal User Backup ${randomID}`, // Utilisation du même randomID pour le titre
                'author_name': `drslid.github.io/EvPortal`,   // Utilisation du même randomID pour le nom de l'auteur
                'content': JSON.stringify([{"tag":"pre","children":[jsonData]}]) // Contenu encodé
            })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.ok) {
                const telegraphUrl = `https://telegra.ph/${data.result.path}`;

                // Extraire l'ID complet de la page (incluant la date à la fin)
                const pageID = data.result.path;

                // Afficher l'URL originale de Telegraph dans l'interface
                const customLink = `https://drslid.github.io/EvPortal/?code=${data.result.path}`;

                // Mettre à jour l'interface avec l'URL et l'ID complet (avec la date à la fin)
                const exportedLinkContainer = document.getElementById('exportedLinkContainer');
                const exportedLinkElement = document.getElementById('exportedLink');
                exportedLinkElement.innerHTML = `
                <a href="${telegraphUrl}" target="_blank">
                    ${telegraphUrl}
                </a>`;

                const pageIdElement = document.createElement('p');
                pageIdElement.textContent = `ID de la page : EvPortal-User-Backup-${randomID}-${pageID.slice(-5)}`; // Ajoute les derniers 5 caractères de la date à la fin
                exportedLinkContainer.appendChild(pageIdElement);
                exportedLinkContainer.style.display = 'block';

                // Générer et afficher le QR code avec le lien personnalisé
                generateQRCode(customLink);
            } else {
                throw new Error("Erreur lors de la création de la page sur Telegraph.");
            }
        } else {
            throw new Error(`Erreur lors de l'export vers Telegraph. Statut: ${response.status}`);
        }
    } catch (error) {
        console.error("Erreur lors de l'exportation de la configuration :", error);
        alert(`Erreur : ${error.message}`);
    }
  }



  // Exemple de fonction pour générer un ID aléatoire de 8 caractères
  function generateRandomID() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomID = '';
    for (let i = 0; i < 8; i++) {
        randomID += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return randomID;
  }

  // Exemple de fonction pour obtenir l'access token depuis Telegraph
  async function getTelegraphAccessToken() {
    try {
        const response = await fetch('https://api.telegra.ph/createAccount', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                'short_name': 'EvPortal',
                'author_name': 'EvPortalUser'
            })
        });

        const data = await response.json();
        if (data.ok) {
            return data.result.access_token;
        } else {
            throw new Error("Erreur lors de la création du compte Telegraph.");
        }
    } catch (error) {
        console.error("Erreur lors de la génération de l'access token :", error);
        return null;
    }
  }





  // Fonction pour générer et afficher un QR code
  function generateQRCode(url) {
      const qrCodeContainer = document.getElementById('qrCode');
      qrCodeContainer.innerHTML = ''; // Vider le contenu avant de générer un nouveau QR code
      new QRCode(qrCodeContainer, {
          text: url,
          width: 128,
          height: 128
      });
  }    

  // Fonction pour importer la configuration depuis Telegraph
  async function importConfig() {
    const telegraphID = document.getElementById('importConfigID').value.trim();
    if (!telegraphID) {
        alert('Please enter a Telegraph page ID.');
        return;
    }

    const telegraphURL = `https://api.telegra.ph/getPage/${telegraphID}?return_content=true`;

    // Récupérer les données depuis Telegraph
    try {
        const response = await fetch(telegraphURL); // Récupère le contenu brut
        if (response.ok) {
            const data = await response.json();
            if (data.ok && data.result.content) {
                const jsonContent = data.result.content[0].children[0]; // Le contenu JSON est dans le premier enfant

                const importedData = JSON.parse(jsonContent);

                // Vérifier le format des données
                if (Object.keys(importedData).every(page => Array.isArray(importedData[page]))) {
                    // Sauvegarder les données importées dans le localStorage
                    localStorage.setItem('pages', JSON.stringify(Object.keys(importedData)));
                    Object.keys(importedData).forEach(page => {
                        localStorage.setItem(page, JSON.stringify(importedData[page]));
                    });

                    alert('Configuration successfully imported!');
                    loadFromLocalStorage(); // Recharger l'interface avec les nouvelles données
                } else {
                    alert('The format of the imported data is incorrect.');
                }
            } else {
                alert('Error retrieving data from Telegraph.');
            }
        } else {
            alert('Error retrieving data from Telegraph.');
        }
    } catch (error) {
        console.error('Erreur lors de la requête Telegraph:', error);
        alert('Erreur lors de la connexion à Telegraph.');
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

    // Fonction pour récupérer le paramètre de l'URL
    function getQueryParam(param) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(param);
    }

    // Récupérer le code depuis l'URL
    const telegraphCode = getQueryParam('code');

    // Si un code est récupéré, lancer l'importation
    if (telegraphCode) {
        importFromTelegraph(telegraphCode); // Lancer l'importation
    }
    
    // Fonction pour importer les données depuis Telegraph
    async function importFromTelegraph(code) {
      const telegraphURL = `https://api.telegra.ph/getPage/${code}?return_content=true`;

      try {
          const response = await fetch(telegraphURL);
          if (!response.ok) {
              throw new Error('Erreur lors de la requête vers Telegraph : ' + response.status);
          }
          
          const data = await response.json();

          if (data.ok && data.result.content) {
              const jsonContent = data.result.content[0].children[0]; // Récupérer le contenu JSON

              const jsonData = JSON.parse(jsonContent);

              // Sauvegarder les données dans localStorage
              const pages = Object.keys(jsonData);
              localStorage.setItem('pages', JSON.stringify(pages));
              pages.forEach(page => {
                  localStorage.setItem(page, JSON.stringify(jsonData[page]));
              });

              alert('Data successfully imported from Telegraph!');
              loadFromLocalStorage(); // Recharger l'interface
          } else {
              alert('Erreur lors de la récupération des données de Telegraph.');
          }
      } catch (error) {
          console.error('Erreur lors de l\'importation depuis Telegraph :', error);
          alert('Unable to retrieve data from Telegraph.');
      }
    }


    loadFromLocalStorage();
});

document.addEventListener('DOMContentLoaded', () => {
  const youtubeRedirectButton = document.getElementById('youtubeRedirectButton');
  const youtubeRedirectButtonContainer = document.getElementById('youtubeRedirectButtonContainer');
  
  // Récupérer l'URL actuelle et l'ajouter à l'URL YouTube
  const currentUrl = window.location.href;
  const youtubeRedirectUrl = `https://www.youtube.com/redirect?q=https://drslid.github.io/EvPortal/`;

  // Normaliser le User Agent en minuscule
  const userAgent = navigator.userAgent.toLowerCase();

  // // Vérifier si le mot "chrome" est présent dans le User Agent
  // if (userAgent.includes('chrome')) {
  // Afficher le bouton si "chrome" est détecté
  youtubeRedirectButtonContainer.style.display = 'block';

  // Ajouter la redirection YouTube lors du clic sur le bouton
  youtubeRedirectButton.addEventListener('click', () => {
    window.location.href = youtubeRedirectUrl;
  });
  // }
});

