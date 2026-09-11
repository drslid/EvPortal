# EvPortal

EvPortal est un lanceur de sites pour l’écran d’une Tesla ou d’un véhicule électrique : de grands raccourcis, un logo et un nom. La navigation reste courte et tactile ; les réglages et les explications s’ouvrent à la demande.

**[Ouvrir EvPortal](https://drslid.github.io/EvPortal/)** · [Aide](aide.html) · [Signaler un problème](https://github.com/drslid/EvPortal/issues) · [Audit et propositions d’évolution](docs/AUDIT-AMELIORATIONS.md)

![Aperçu des raccourcis EvPortal en thème sombre](img/evportal-preview.png)

Le projet utilise HTML, CSS et JavaScript natifs : aucun compte EvPortal, aucune compilation et aucune dépendance à un CDN pour afficher le tableau. Les sites ouverts depuis les raccourcis conservent leurs propres abonnements, restrictions et conditions d'accès.

## Fonctionnalités

- **Écran épuré** : logo EvPortal d’origine centré, rangées de grands raccourcis centrées et changement de thème directement dans l’en-tête.
- **135 raccourcis, 10 catégories** : recharge, navigation, vidéo, musique, télévision, jeux et services pratiques.
- **Vue « Tous » automatique** : les raccourcis les plus ouverts passent en premier ; l’ordre manuel départage les égalités.
- **Personnalisation tactile** : glisser-déposer dans les catégories et les favoris ; création, modification et choix de l’icône des catégories.
- **Suppression directe** : raccourcis et catégories sont supprimés immédiatement, sans fenêtre de confirmation. La réinitialisation complète reste confirmée.
- **Ajout direct** : le bouton « + » donne accès au catalogue, à « Créer un raccourci » et à « Créer une catégorie ».
- **Catégories personnelles** : jusqu’à cinq catégories créées, avec un nom de 16 caractères maximum ; anciennes configurations préservées.
- **Navigation visible** : les catégories se répartissent sur plusieurs lignes si nécessaire, sans défilement horizontal.
- **Recherche, favoris et thèmes** : accès aux services habituels et choix clair ou sombre. Les raccourcis ouvrent les services dans un nouvel onglet.
- **Huit langues** : anglais, français, espagnol, allemand, italien, russe, arabe et portugais ; interface et aide traduites, présentation de droite à gauche en arabe.
- **Sauvegarde locale** : catégories, liens, ordre, favoris, compteurs d’ouverture et préférences restent dans la configuration de l’appareil.
- **Partage Telegra.ph et QR code** : préparez le tableau sur téléphone, publiez la configuration puis retrouvez-la sur l’écran du véhicule avec son code ou son lien.
- **Import avec aperçu** : anciennes configurations Telegra.ph et fichiers JSON pris en charge ; remplacement après confirmation.
- **Plein écran Tesla** : retour au lancement par la redirection YouTube utilisée par la version historique ; l’API Fullscreen classique reste disponible pour les autres navigateurs.

## Utilisation

1. Choisissez une catégorie et touchez un raccourci pour ouvrir le service dans un nouvel onglet.
2. Dans « Tous », les services les plus ouverts sont placés en premier automatiquement. Pour réorganiser manuellement, choisissez une catégorie ou « Favoris », touchez « Modifier », déplacez les raccourcis puis touchez « Terminer ».
3. Touchez « + » pour choisir un service du catalogue ou créer un raccourci ou une catégorie. Un service marqué « Déjà présent » est déjà dans votre tableau.
4. Pour renommer une catégorie ou changer son icône, utilisez son crayon en mode « Modifier ». Les noms des nouvelles catégories sont limités à 16 caractères et leur nombre à cinq catégories personnelles.

### Du téléphone à la Tesla

1. Ouvrez EvPortal sur le téléphone et préparez vos raccourcis.
2. Touchez « Partager », nommez la sauvegarde puis « Créer mon lien & QR code ».
3. Conservez le **code Telegra.ph** affiché ou copiez le lien. Dans EvPortal sur la Tesla, ouvrez **Réglages → Importer depuis Telegra.ph** et saisissez le code ou le lien.
4. Touchez « Charger mes raccourcis », vérifiez l’aperçu puis « Utiliser ces raccourcis ».

Le **QR code se scanne avec un téléphone** pour y ouvrir la configuration. Pour le trajet téléphone → Tesla, utilisez le code ou le lien dans l’import du véhicule. Il ne s’agit pas d’une synchronisation : le partage contient un instantané du tableau. Après d’autres modifications, créez un nouveau partage et importez-le de nouveau.

Une réception par jumelage est à l’étude : la Tesla afficherait un QR code que le téléphone scannerait pour lui envoyer la configuration. Ce parcours n’est pas encore implémenté ; l’import actuel utilise le code ou le lien Telegra.ph.

Le téléchargement et l’import JSON restent disponibles comme sauvegarde locale.

Les nouveaux liens de partage utilisent un identifiant aléatoire long, difficile à deviner. Le nom donné à la sauvegarde reste visible dans « Mes liens partagés ». Une publication Telegra.ph reste **publique et non chiffrée** : toute personne disposant du lien peut consulter les noms et adresses de vos raccourcis. Le partage ne contient ni le reste du stockage du navigateur ni le jeton du compte Telegra.ph. Les QR codes sont générés localement.

Les anciens liens restent importables et accessibles avec leur adresse d’origine. Créer un nouveau lien aléatoire ne rend pas une ancienne publication privée et ne la supprime pas.

### Anciennes configurations

Les anciennes clés `pages` et les données de leurs catégories sont reprises automatiquement lorsqu'aucune configuration récente n'existe. Les clés historiques sont conservées ; les nouvelles modifications utilisent `evportal.state.v2`. Les anciennes adresses connues sont actualisées. Un ancien nom de service est corrigé uniquement s’il correspond exactement au libellé historique, pour préserver vos noms personnalisés.

La limite de cinq catégories personnelles et les noms courts encadrent la création dans l’interface. Les anciennes catégories déjà plus nombreuses ou portant un nom plus long ne sont pas supprimées ou tronquées lors de la reprise. La validation des anciennes sauvegardes conserve sa limite globale de 50 catégories.

L'import comprend les anciens fichiers organisés comme `{ "pages": ["cinema"], "cinema": [...] }` et les dictionnaires de catégories. Pour un ancien lien Telegra.ph, ouvrez l'import dédié et renseignez son identifiant ou son URL. Un lien EvPortal contenant `?code=...` ou `?config=...` prépare le formulaire : la configuration n'est ni téléchargée ni appliquée automatiquement.

Le partage utilise l’API Telegra.ph après un clic explicite. Le compte historique est repris lorsqu’il est disponible ; la liste « Mes liens partagés » permet de retrouver ses pages. Une nouvelle publication crée une adresse aléatoire, puis y enregistre la configuration et le nom choisi avant de fournir le code, le lien d’import et le QR code. Si le navigateur ne peut pas générer cet identifiant de façon sûre ou si Telegra.ph ne le conserve pas lors de la création de l’adresse, la publication de la configuration est interrompue. Le contenu est limité à 64 Kio UTF-8 par Telegra.ph ; une configuration trop volumineuse peut être sauvegardée en JSON. Les pages publiées ne sont pas supprimées par une réinitialisation locale.

### Navigateur Tesla et accès aux services

EvPortal ouvre des sites web. La présence d'un service dans le catalogue indique un lien utile ; elle ne garantit pas la lecture vidéo, l'authentification ou la compatibilité avec chaque écran Tesla. Le navigateur, la version logicielle, les restrictions régionales, la connexion et les protections multimédias du service peuvent limiter son fonctionnement.

Tesla indique que les options de divertissement dépendent du véhicule et de la région et présente le Théâtre pour un usage en stationnement, avec une connexion adaptée. Consultez le [manuel Tesla correspondant au véhicule](https://www.tesla.com/ownersmanual/modely/fr_fr/GUID-79A49D40-A028-435B-A7F6-8E48846AB9E9.html). Utilisez le portail de divertissement à l'arrêt.

Dans une Tesla, le bouton plein écran utilise le lancement via YouTube avec une URL de retour vers EvPortal, comme dans la version historique. Choisissez « Accéder au site » ou « Go to site » sur YouTube pour revenir au portail en mode Théâtre. Le même parcours est décrit par [myTesla](https://mytesla.nu/). Si le navigateur n’est pas reconnu comme une Tesla, l’entrée « Ouvrir le mode Théâtre Tesla » reste accessible dans les réglages.

Ce mécanisme dépend du navigateur et du logiciel du véhicule ; un essai sur Tesla est nécessaire pour valider son résultat. Il ne s’agit pas d’une API officielle Tesla. Sur les autres navigateurs, le bouton utilise l’[API Fullscreen](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API) lorsqu’elle est disponible. L’ajout à l’écran d’accueil dépend également du navigateur. Le manifeste ne fournit pas de mode hors connexion complet : les services externes nécessitent Internet et aucun service worker de cache n’est inclus.

## Données et confidentialité

La configuration est stockée dans le `localStorage` du navigateur, sous la clé `evportal.state.v2`. Les informations du compte Telegra.ph restent séparées sous `evportal.telegraph.v1`. Effacer les données du site ou changer de navigateur peut faire perdre la personnalisation : un partage Telegra.ph ou un export JSON permet de la retrouver. Si le stockage est bloqué ou une sauvegarde est illisible, un message explique la situation et l'export reste disponible pour préserver la session.

La langue se choisit dans les réglages et reste enregistrée sur cet appareil, séparément de la configuration partagée. Au premier lancement, la langue du navigateur est utilisée lorsqu’elle est prise en charge. Changer de langue adapte les libellés, les dialogues, les erreurs et l’aide ; vos noms de raccourcis et de catégories personnels restent conservés. Le sélecteur affiche les langues dans leur écriture d’origine. Les deux modes de thème disponibles sont clair et sombre.

Le classement « Tous » utilise un compteur d’ouvertures par raccourci, associé à son identifiant et conservé après rechargement. Ce compteur reste dans la configuration locale et ses sauvegardes ; aucun service d’analyse d’audience n’est nécessaire. Le glisser-déposer est désactivé dans cette vue automatique. Les catégories et les favoris gardent leur ordre manuel.

Les logos du catalogue sont embarqués dans le dépôt, sans requête de favicon à un tiers pendant l’utilisation. Le portail n’intègre aucun outil d’analyse d’audience ni publication automatique de configuration. Publier, importer ou consulter ses partages Telegra.ph déclenche une requête vers ce service après une action explicite. Le jeton du compte n’est ni affiché dans le partage ni inclus dans l’export. Ouvrir un raccourci transmet la navigation au site choisi, qui applique sa propre politique de confidentialité. L'hébergeur du portail peut également traiter les informations techniques d'une requête web.

En mode « Modifier », supprimer un raccourci ou une catégorie prend effet immédiatement. La suppression d’une catégorie enlève aussi les raccourcis qu’elle contient. La réinitialisation complète demande toujours confirmation et remplace uniquement l’état EvPortal récent. L’application n’efface pas l’ensemble du stockage de l’origine, qui peut être partagé avec d’autres projets GitHub Pages.

## Développement local

Depuis la racine du dépôt :

```bash
python3 -m http.server 8080
```

Ouvrez ensuite `http://localhost:8080/`. Le serveur sert les fichiers statiques ; aucun paquet npm n'est nécessaire pour utiliser le portail. Pour une utilisation normale et des résultats de stockage prévisibles, servez les fichiers via HTTP ou HTTPS.

Pour tester sur téléphone, ouvrez l’adresse réseau de cet ordinateur sur les deux appareils. `localhost` désigne chaque appareil séparément. Dans le dialogue de partage, vérifiez « Adresse d’EvPortal » pour que le QR code pointe vers cet aperçu. L’adresse publique continue à servir la version publiée tant que le nouvel aperçu n’est pas déployé.

```text
index.html                 Tableau de raccourcis et métadonnées SEO
aide.html                  Explications, transfert téléphone et mode Théâtre
css/styles.css             Interface responsive et thèmes
js/catalog.js              Catalogue de services et corrections d’anciennes URL
js/icons.js                Correspondance entre services et logos embarqués
js/i18n.js                 Langue, traduction des éléments et direction du texte
js/locales/                Textes sources JSON des huit langues
js/translations.js         Traductions embarquées générées depuis les JSON
js/state.js                Validation, migrations et modèle de sauvegarde
js/script.js               Raccourcis, déplacement tactile, recherche et dialogues
js/telegraph.js            Publication, historique et lecture Telegra.ph
js/tesla.js                Redirection Théâtre et plein écran classique
js/vendor/                 QRCode.js, SortableJS et leurs licences
scripts/check-links.mjs    Vérification HTTP du catalogue depuis Node.js
scripts/fetch-icons.mjs    Actualisation ponctuelle des logos du catalogue
tests/state.test.js        Tests du stockage et des données importées
scripts/browser-smoke.cjs  Recette navigateur et contrôles d’accessibilité
scripts/interaction-smoke.cjs Déplacement tactile/clavier et parcours Tesla
package.json               Outils de vérification, sans dépendance de production
img/                       Logos, icônes et manifeste
robots.txt                 Directives à exposer à la racine de l'hôte
sitemap.xml                Pages publiques indexables
README.md                  Utilisation et contribution
docs/                      Audit, sources et propositions
```

### Vérifications de développement

Avec Node.js 20 ou plus récent, sans installer de dépendance :

```bash
node --test tests/*.test.js
node scripts/check-links.mjs --output /tmp/evportal-links.json
```

La première commande vérifie les données, les catégories, les compteurs, les sauvegardes et le parcours plein écran. La seconde consulte les sites externes pour inventorier les réponses HTTP et produit un rapport local ; elle ne teste pas la lecture multimédia.

Pour la recette automatisée dans Chromium et les contrôles d'accessibilité, installez les outils de développement :

```bash
npm ci
npx playwright install chromium
npm test
npm run build:locales
npm run test:browser
npm run test:interactions
npm run test:share
npm run test:i18n
```

Les scripts navigateur démarrent leur propre serveur local temporaire. La recette d’interactions peut aussi être lancée avec `node scripts/interaction-smoke.cjs`. Sur une machine Linux qui ne possède pas les bibliothèques nécessaires à Chromium, utilisez `npx playwright install --with-deps chromium`. Playwright et axe servent uniquement aux vérifications ; les bibliothèques utilisées par le portail sont embarquées dans le site. Complétez cette recette par un essai sur le véhicule visé.

### Faire évoluer le catalogue

La révision de septembre 2026 comprend 22 destinations actualisées, 18 nouveaux raccourcis et 4 retraits de la sélection initiale. Consultez [le détail, les sources et les limites du contrôle des liens](docs/LIENS.md).

Modifiez `js/catalog.js` en conservant des identifiants stables pour les catégories et les services. Préférez l’adresse officielle du service et ajoutez une description utile à la recherche et à la maintenance, sans l’afficher dans les raccourcis. Lancez `node scripts/fetch-icons.mjs` pour récupérer les logos manquants ; `--refresh` actualise également les existants. Les sources et conditions de maintenance figurent dans [le dossier des icônes](img/services/README.md). Quand un ancien lien change, documentez la correction et utilisez les remplacements d'URL prévus par le catalogue.

Une redirection, une page d'authentification, une restriction géographique ou une réponse HTTP `403` ne prouvent pas qu'un service a fermé. Documentez séparément l'accessibilité du lien et les essais de lecture sur un véhicule réel.

Une mise à jour ne doit pas réinsérer des raccourcis qu'une personne a supprimés. Vérifiez les parcours avec une configuration neuve et avec une ancienne configuration personnalisée avant de publier.

### Faire évoluer les traductions

Les textes de l’interface, du partage et de l’aide sont séparés dans `js/locales/`. Chaque famille de fichiers possède les mêmes clés dans les huit langues. Le navigateur charge `js/translations.js` depuis le site ; aucun service externe de traduction n’est appelé. Les annotations `data-i18n` traduisent le texte, et leurs variantes les titres, descriptions et libellés accessibles. Les noms et liens personnalisés ne sont pas remplacés par des traductions.

Après modification des JSON, lancez `npm run build:locales` ou `node scripts/build-locales.cjs` pour régénérer le fichier embarqué. La génération vérifie la présence des mêmes clés et paramètres dans les huit langues. `npm run test:i18n` vérifie l’interface, les dialogues, le thème, la persistance et l’aide dans ces langues, sur six largeurs.

Vérifiez les libellés longs, le passage de gauche à droite et de droite à gauche, les dialogues ouverts lors d’un changement de langue et la conservation du choix après rechargement.

### Format de sauvegarde

Le JSON exporté utilise `version: 2`, une `catalogVersion`, le `theme`, la catégorie active `activeCategory`, l’ordre manuel `shortcutOrder` et une liste `categories`. Chaque catégorie contient son `id`, son `label`, son `icon`, sa `description` et ses `shortcuts`. Chaque raccourci possède un identifiant, un nom, une URL et ses métadonnées, dont l’état de favori et le compteur `clickCount`. Les compteurs absents des anciens formats sont initialisés à zéro.

Le format exact à réutiliser est celui produit par le bouton d'export. Les données importées sont validées avant application ; les URL doivent utiliser HTTP ou HTTPS, sans identifiants dans l’adresse. Les imports JSON sont limités à 2 Mo, 50 catégories et 5 000 raccourcis. La publication Telegra.ph possède une limite distincte de 64 Kio pour son contenu sérialisé. [Référence de l’API Telegra.ph](https://telegra.ph/api#createPage).

## Hébergement et référencement

Déployez les fichiers statiques sur GitHub Pages ou un hébergeur HTTPS. L'adresse publique de référence est actuellement `https://drslid.github.io/EvPortal/`.

Lors d'un changement de domaine ou de chemin, actualisez ensemble les URL canoniques, Open Graph et JSON-LD dans `index.html`, l'adresse du `sitemap.xml`, la directive Sitemap de `robots.txt` et l'icône historique dans `img/browserconfig.xml`. Les chemins du manifeste sont relatifs à son dossier `img/`.

**Particularité GitHub Pages :** `https://drslid.github.io/EvPortal/robots.txt` est dans un sous-dossier. Google attend le fichier à la racine de l'hôte, `https://drslid.github.io/robots.txt`. Placez-y la directive Sitemap si cet emplacement est administrable, ou soumettez directement le sitemap dans Search Console. Le fichier du dépôt seul ne configure pas le robot de tout l'hôte. [Règle officielle Google](https://developers.google.com/crawling/docs/robots-txt/create-robots-txt).

Après déploiement, inspectez l'URL canonique dans Search Console, soumettez le sitemap et mesurez les résultats réels. La feuille de route SEO et les vérifications détaillées figurent dans [l'audit](docs/AUDIT-AMELIORATIONS.md).

## Évolutions proposées

Les prochaines améliorations doivent préserver l’écran de raccourcis :

- Annuler la dernière suppression ou le dernier import.
- Masquer les catégories inutilisées et choisir « Favoris » comme accueil.
- Régler discrètement la taille des raccourcis.
- Signaler un lien inaccessible depuis son raccourci.
- Ajouter des profils simples « quotidien » et « voyage » si les essais en montrent l’utilité.

Le contrôle régulier des liens relève de la maintenance. Le plein écran, le déplacement tactile et le transfert téléphone → Tesla restent à valider sur le véhicule visé. Les réglages avancés et l’aide restent à l’écart de l’écran principal. Voir [l’audit révisé et les priorités](docs/AUDIT-AMELIORATIONS.md).

## Contribution et licence

Signalez un lien obsolète ou proposez une fonctionnalité dans les [issues GitHub](https://github.com/drslid/EvPortal/issues). Pour un problème de navigateur, précisez le modèle d'appareil, la version du navigateur ou du logiciel Tesla, la région et les étapes pour le reproduire.

Pour une contribution au code, créez une branche, effectuez vos modifications et ouvrez une pull request décrivant le problème résolu et les vérifications effectuées. Le projet est distribué sous [licence MIT](LICENSE). EvPortal est un projet indépendant, sans affiliation avec Tesla ou les services référencés.

Le transfert sans saisie fait l’objet d’une [proposition de réception par QR sur la Tesla](docs/APPAIRAGE-TELEPHONE-TESLA.md), distincte des sauvegardes Telegra.ph déjà disponibles.
