# Stockage local des sauvegardes

Les raccourcis actifs et les préférences restent dans `localStorage`. La bibliothèque de sauvegardes utilise désormais IndexedDB, sans compte ni serveur de données supplémentaire. Cette base est propre au navigateur et à l’origine du site ; elle ne synchronise pas automatiquement le téléphone et la voiture.

## Migration et récupération

`EVBackups.createPersistentLibrary()` ouvre la base `evportal`, version 1, et le magasin `documents`. À la première ouverture, une transaction lit la bibliothèque historique `evportal.backups.v1`, valide chaque sauvegarde et écrit une bibliothèque complète. Une seconde transaction vérifie que la valeur validée est lisible après validation de la transaction d’écriture.

La clé historique est conservée intégralement. Aucun raccourci actif, préférence, jeton de partage ou élément d’une autre application n’est modifié. Une bibliothèque IndexedDB existante reste la référence et n’est jamais remplacée par une ancienne copie historique. Une migration illisible ou trop volumineuse échoue sans importer une bibliothèque vide.

La clé `evportal.backups.v1.indexeddb` indique qu’une migration a été entreprise. Elle est écrite avant toute création de données persistantes : si IndexedDB devient ensuite indisponible, la copie historique s’affiche en lecture seule, avec un avertissement. Cette copie peut être ancienne. Une restauration dans les raccourcis actifs doit rester une action explicite de l’utilisateur.

Si IndexedDB est indisponible, la bibliothèque historique reste consultable en lecture seule, avec un avertissement. `localStorage` ne fournit pas de transaction de lecture et d’écriture atomique entre onglets. Même l’ajout de Web Locks peut laisser apparaître une copie obsolète du stockage dans un autre onglet ; ce secours n’accepte donc aucune modification qui risquerait d’effacer une autre sauvegarde.

Les erreurs de quota ou d’accès n’entraînent aucune remise à zéro. Après un échec d’écriture dans IndexedDB, la transaction est annulée et la bibliothèque précédente reste la référence ; aucune bascule silencieuse vers une copie historique n’a lieu. La sauvegarde peut être réessayée après avoir libéré de l’espace.

## Limites et précautions

- 50 sauvegardes au maximum ; 2 Mio maximum par sauvegarde, métadonnées incluses.
- 20 Mio maximum pour la bibliothèque IndexedDB complète, avant toute écriture.
- Le secours `localStorage` reste limité par le quota réel du navigateur, souvent inférieur à ces limites.
- Le navigateur peut supprimer son stockage. Une mise à jour du véhicule, un effacement des données du navigateur ou un changement de domaine doit être testé et anticipé avec un export JSON sur téléphone.
- Les modifications d’onglets différents sont sérialisées par des transactions IndexedDB ; les notifications BroadcastChannel et `storage` servent à rafraîchir l’affichage, sans remplacer cette protection.
- Cette bibliothèque n’est pas un coffre chiffré. Elle contient les raccourcis et copies que l’utilisateur a enregistrés sur cet appareil. Les clés d’administration et les jetons de connexion n’y ont pas leur place.
- Le fonctionnement réel sur chaque navigateur Tesla reste à valider : IndexedDB, durée de conservation et retour après une perte de connexion.

## Interface pour le portail

Charger `js/storage.js` avant `js/backups.js`. L’ancienne `createLibrary(storage)` reste synchrone pour les intégrations historiques et les tests. Le portail utilise :

```js
const library = EVBackups.createPersistentLibrary({ storage: localStorage, onStatus: showStorageStatus });
await library.ready;
const saved = await library.add({ title, source: 'file', state });
const records = await library.list();
const one = await library.get(saved.id);
await library.remove(saved.id);
const unsubscribe = library.subscribe(refreshBackupDialog);
```

`status()` retourne `{ backend, warningKey, readOnly }`. `backend` vaut `opening`, `indexeddb`, `localstorage` ou `unavailable`. Les nouveaux messages de traduction sont `backup.storageFallback`, `backup.storageRecoveryOnly` et `backup.libraryTooLarge` avec `{max: 20}`. Le portail doit afficher les avertissements et signaler les erreurs des opérations asynchrones ; il ne doit annoncer une sauvegarde réussie qu’après résolution de `add()`.

`subscribe()` renvoie une fonction de désinscription. `close()` libère les connexions et notifications. Les options `indexedDB`, `databaseName` et `database` permettent les essais contrôlés ; elles ne sont pas nécessaires à l’usage normal.

## Vérification

`node --test tests/backups.test.js tests/storage.test.js` vérifie le format existant puis de vraies transactions IndexedDB dans un navigateur Chromium via Playwright. Le test utilise Chromium installé, ou Microsoft Edge sur Windows si Chromium manque. `EVPORTAL_TEST_BROWSER_CHANNEL=msedge` permet de choisir Edge explicitement.

Les scénarios couvrent la migration avec lecture de vérification, la conservation exacte des données historiques et des raccourcis actifs, les ajouts simultanés depuis deux onglets, l’annulation d’une transaction lors d’une erreur de quota, le nouvel essai, une migration corrompue, le secours en lecture seule, le refus des écritures concurrentes dans ce secours et la limite cumulée de 20 Mio.

Après `npm run dev`, `node scripts/upgrade-smoke.cjs` vérifie les parcours complets dans Microsoft Edge : préférences de pays et de langues indépendantes, copie locale/restauration, synchronisation entre deux contextes isolés avec aperçu et copie préalable, refus des conflits, mémorisation facultative de la connexion, dimensions des tuiles et édition sur téléphone. Ce contrôle exige le véritable serveur de développement, utilise son service chiffré local et intercepte Telegra.ph pour éviter toute publication externe. Il ne génère ni capture d’écran ni fichier contenant un code privé. `EVPORTAL_TEST_URL` peut désigner un autre aperçu local ; le script refuse une URL de production.
