# Synchronisation facultative des configurations

Ce MVP ajoute une sauvegarde distante chiffrée, distincte du transfert temporaire téléphone/Tesla et de Telegraph. Charger le site ou `js/sync.js` ne déclenche aucune connexion. La création, la connexion, l'envoi et la récupération sont des actions explicites. Le prototype et sa publication avec le frontend ne déploient automatiquement aucun compte Cloudflare, base D1 distante ou service de synchronisation.

## Essayer sur le PC

Prérequis : Node.js 22 ou supérieur. Le serveur autonome n'a aucune dépendance à installer et n'utilise pas de compte externe.

```sh
node sync/dev.cjs
```

Il écoute uniquement `http://127.0.0.1:4399`, accepte par défaut les origines du portail `http://127.0.0.1:4187` et `http://localhost:4187`, et conserve les profils dans `sync/.local-store.json` (ignoré par Git). Le fichier contient des empreintes de jetons et des configurations chiffrées. Le serveur refuse un fichier corrompu sans le remplacer. Une seule instance doit utiliser un même fichier ; ce stockage JSON est réservé à l'essai local.

Options : `--port 4399`, `--origins http://127.0.0.1:4187,http://localhost:4187`, `--store chemin-vers-un-fichier.json`.

Le serveur de prévisualisation peut importer `createDevServer({port, origins, store})` depuis `sync/dev.cjs` et relayer `/sync-api/*` vers ce serveur en conservant l'en-tête `Origin`. Il ne faut pas l'exposer sur le réseau ni l'employer en production.

## Code de reprise et confidentialité

Créer un profil génère avec WebCrypto un secret aléatoire de 256 bits, présenté sous la forme `EV1.…`. À partir de ce secret, le client dérive séparément un identifiant de profil, un jeton d'accès et une clé AES-GCM 256 bits. Le secret et la clé de chiffrement ne sont jamais envoyés à l'API. Chaque sauvegarde utilise un nouvel IV de 96 bits et lie le chiffrement à l'identifiant du profil.

L'API reçoit un jeton dérivé dans `Authorization: Bearer …`, stocke seulement son SHA-256, et conserve une enveloppe chiffrée. Ni code de reprise ni jeton ne sont placés dans les URL, les journaux applicatifs ou les liens de partage. Les réponses sont `no-store` et les appels omettent cookies et référent. Le serveur ne connaît pas les favoris, liens, langues et autres informations du snapshot ; il connaît l'identifiant, la taille, la date et la révision. L'hébergeur peut voir les métadonnées réseau habituelles.

Le code de reprise donne accès au profil à toute personne qui le possède. Il faut le conserver dans un emplacement privé. Il ne peut pas être récupéré par l'administrateur s'il est perdu. Ne pas utiliser un mot de passe choisi par l'utilisateur à sa place.

Par défaut, le secret reste en mémoire pour la session. L'option explicite `remember:true` conserve le code de reprise dans `localStorage` du navigateur avec l'URL du serveur et la dernière révision. Sur une voiture ou un ordinateur partagé, laisser cette option désactivée ou déconnecter le profil après usage. Les scripts du même site peuvent lire la mémoire et le stockage : ce mécanisme ne protège pas d'un site compromis, d'une extension malveillante ou d'un accès au navigateur déjà déverrouillé. Le chiffrement est une implémentation WebCrypto testée, sans audit cryptographique indépendant.

`disconnect()` oublie l'accès sur ce navigateur mais ne révoque pas les autres appareils. Si le navigateur refuse de supprimer son stockage, la méthode signale `STORAGE_UNAVAILABLE` ; il faut supprimer les données du site dans le navigateur. Un échec de mémorisation est indiqué par `status().storageWarning` et le code reste disponible pour copie pendant la session.

Le MVP n'a pas de liste d'appareils ni de révocation individuelle. `deleteProfile()` supprime le profil serveur et révoque tous ses détenteurs. Seul l'identifiant aléatoire est conservé dans une liste de révocation afin d'empêcher la recréation du même profil avec l'ancien code ; le jeton et le snapshot sont supprimés. Pour exclure un appareil perdu, récupérer la configuration sur un appareil de confiance, supprimer le profil puis en créer un nouveau. La suppression d'une ligne n'est pas une garantie d'effacement instantané des sauvegardes techniques de l'hébergeur.

## Intégration du client

```js
const client = EVSync.createClient({
  endpoint: window.EV_CONFIG.syncURL,
  onStatus: status => updateSyncStatus(status)
});
const created = await client.create(snapshot, { remember: false });
// Afficher created.recoveryCode dans une zone privée, jamais dans une URL.
const joined = await client.connect(recoveryCode, { remember: false });
// Prévisualiser/valider joined.snapshot avant application au portail.
const remote = await client.load();
await client.save(snapshot);
client.disconnect();
```

`status()` expose `{connected, revision, remembered, available, busy, storageWarning}` sans secret. `getRecoveryCode()` est réservé à une action explicite « afficher/copier le code ». `create`, `load`, `connect` et `save` renvoient `revision` et `updatedAt` (millisecondes UTC). `load`/`connect` renvoient également `snapshot`. Aucune méthode ne modifie automatiquement les préférences du portail.

Le snapshot est un objet JSON opaque pour ce module. **L'interface doit construire une liste autorisée des champs synchronisables et valider/normaliser les champs reçus avant de les appliquer.** Ne jamais envoyer tout `localStorage`, les jetons de transfert, le code de reprise, des identifiants Tesla ni des paramètres propres à l'appareil. Les médias et fichiers EPUB/audio ne sont pas inclus. Taille maximale avant chiffrement : 700 Kio ; requête API : 1 Mio.

Un appareil utilise la dernière révision qu'il a chargée ou écrite. Si un autre appareil a écrit depuis, `save()` lève `CONFLICT` avec `remoteRevision`, conserve la révision locale et ne modifie rien sur le serveur. L'interface doit proposer une récupération/prévisualisation explicite avant une nouvelle écriture ; ne jamais faire automatiquement `load()` puis `save()` pour contourner le conflit. Il n'y a pas de fusion automatique ni d'autosauvegarde dans le module. Chaque client refuse les opérations simultanées (`BUSY`). Le dernier état local doit rester utilisable en cas de panne.

Autres erreurs : `UNAVAILABLE`, `INVALID_ENDPOINT`, `INVALID_CODE`, `INVALID_SNAPSHOT`, `NOT_CONNECTED`, `NETWORK`, `UNAUTHORIZED`, `ORIGIN_DENIED`, `NOT_FOUND`, `TOO_LARGE`, `RATE_LIMITED`, `INVALID_RESPONSE`, `DECRYPT_FAILED`, `SERVER`, `STORAGE_UNAVAILABLE`. Les requêtes sont interrompues après 15 secondes.

## Protocole serveur

| Requête | Corps | Résultat |
| --- | --- | --- |
| `GET /health` | — | service `evportal-config-sync` |
| `POST /v1/profiles` | `{profileId,envelope}` | 201 `{revision:1,updatedAt}` |
| `GET /v1/profiles/:id` | — | `{revision,updatedAt,envelope}` |
| `PUT /v1/profiles/:id` | `{baseRevision,envelope}` | nouvelle révision ou 409 `{error:"CONFLICT",revision}` |
| `DELETE /v1/profiles/:id` | — | 204 |

Tous les appels de profil exigent une origine explicitement autorisée et un jeton Bearer. Aucune route ne permet de lister les profils. Les identifiants ou jetons incorrects sont refusés sans révéler si le profil existe. Une enveloppe est `{version:1,iv,ciphertext}` avec encodage base64url. La comparaison de révision se fait atomiquement dans la requête SQL ou la transaction locale.

CORS n'accepte aucun joker. Les requêtes d'API avec query string sont refusées ; les secrets ne doivent jamais y figurer. Le plafond de corps est vérifié sur les octets lus, pas uniquement `Content-Length`. La limitation initiale est de 120 requêtes/minute et 10 créations/heure/adresse IP, en mémoire du processus/isolate. Elle n'est ni durable ni globale entre instances Cloudflare ; elle ne garantit pas à elle seule une protection de coût/abus pour un lancement public. Aucun quota gratuit illimité n'est promis.

## Préparer Cloudflare Workers + D1 (sans déploiement effectué)

`sync/worker.mjs` emploie le même validateur et le même protocole que l'essai local, avec un adaptateur D1. `schema.sql` crée la table. `wrangler.toml` contient un identifiant de base volontairement factice : le remplacer nécessite de créer sa propre base. Les origines s'expriment sans chemin (`https://drslid.github.io`, pas `/EvPortal/`). Le fichier de configuration publié doit conserver une URL vide tant qu'aucun service réel n'est disponible.

Le Worker possède un verrou d'activation explicite : `SYNC_ENABLED = "false"` dans la configuration versionnée. Si la variable est absente ou différente de la chaîne exacte `"true"`, toutes les routes, y compris `/health`, répondent 503 **avant tout accès au binding D1**. Un déploiement incomplet laisse donc l'API fermée. Le serveur JSON de test local n'est pas concerné par ce verrou ; les tests Worker/D1 activent volontairement le drapeau dans leur environnement local.

Ne passer `SYNC_ENABLED` à `"true"` et ne renseigner `EV_CONFIG.syncURL` qu'après validation réelle des protections anti-abus et des quotas globaux durables de requêtes, de profils et de stockage. Le drapeau est uniquement un interrupteur : il ne fournit ni quotas, ni contrôle d'abus, ni plafond de facturation. Les compteurs en mémoire existants restent insuffisants pour garantir un service public gratuit sur plusieurs instances.

Étapes ultérieures : installer les outils de `sync/package.json`, créer la base D1 sur le compte choisi, appliquer `schema.sql`, remplacer l'identifiant factice, configurer les origines autorisées, mettre en place et vérifier les quotas globaux et le contrôle d'abus, puis seulement activer explicitement `SYNC_ENABLED` et régler `EV_CONFIG.syncURL` sur l'URL HTTPS du service. Ces opérations de compte/publication restent à effectuer et n'ont pas été simulées comme réussies.

## Vérification réalisée

```sh
node --test tests/sync.test.js
node --test tests/sync-worker-gate.test.js
node sync/browser-smoke.cjs
# Après npm ci --prefix sync :
node sync/worker-smoke.cjs
```

Le premier contrôle vérifie chiffrement/intégrité, conflits répétables, course entre appareils, authentification, origine, plafond, limitation, stockage corrompu, persistance après redémarrage et suppression. Il exécute aussi les requêtes de l'adaptateur D1 contre SQLite réel : ce n'est pas une validation d'une base D1 distante.

Le second utilise deux contextes Chromium isolés et une vraie API locale : création/reprise entre appareils, conflit sans écrasement, mémorisation après rechargement, redémarrage API, puis révocation par suppression. Il exige le navigateur Playwright installé, ou `EVPORTAL_BROWSER_CHANNEL=msedge` sous Windows. Vérifié ici avec Edge Chromium. Aucun de ces tests ne prouve encore la compatibilité dans une Tesla, la disponibilité du service Cloudflare réel ou la conservation du stockage après mise en veille du véhicule.

Le troisième lance réellement le module Worker dans Miniflare avec une base D1 locale et vérifie création, chiffrement, récupération, conflit et suppression/révocation atomique. Le paquet de synchronisation possède un verrou de dépendances construit à partir des mêmes versions déjà installées et testées pour le relais. Une compilation Wrangler en mode `--dry-run` a également réussi. Ces vérifications restent locales : aucun Worker ou D1 distant n'est déployé.
