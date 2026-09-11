# Relais temporaire EvPortal

Worker Cloudflare et Durable Object SQLite pour transférer une configuration chiffrée entre le téléphone et la Tesla. Aucun compte utilisateur, jeton Telegra.ph ou secret permanent n’est nécessaire au protocole.

## Installer et vérifier

Node.js 22 ou supérieur, puis depuis `relay/` :

```bash
npm ci
npm test
npm run check
```

Les tests utilisent le runtime Cloudflare `workerd` via Miniflare et de vrais Durable Objects SQLite pour les parcours HTTP et les dépôts concurrents. Des tests ciblés couvrent aussi l’expiration, les alarmes et les limites de corps HTTP. `check` prépare le bundle avec Wrangler en mode `--dry-run`, sans publication.

Pour tester l’interface, lancez `npm run dev` depuis la racine du projet : cette commande configure le portail et vérifie ou démarre le relais local. Un serveur statique seul ne renseigne pas l’adresse du relais. Le mode local sert aux navigateurs du même ordinateur ; un essai avec un téléphone physique nécessite des adresses HTTPS accessibles aux deux appareils.

Pour démarrer seulement le relais, depuis `relay/` :

```bash
npm run dev -- --var 'ALLOWED_ORIGINS:https://drslid.github.io,http://127.0.0.1:4187,http://localhost:4187'
```

Dans un autre terminal :

```bash
npm run test:live
```

Ce dernier contrôle crée une session sur `http://127.0.0.1:8787`, chiffre une configuration de test en AES-GCM, vérifie les droits, déchiffre la réception et supprime la session. Les variables facultatives `RELAY_BASE_URL` et `PORTAL_ORIGIN` permettent de viser un autre environnement. Aucun secret n’est écrit dans sa sortie.

## Déployer

Le relais de production est publié à l’adresse [https://evportal-pairing-relay.carbonnier-anthony.workers.dev](https://evportal-pairing-relay.carbonnier-anthony.workers.dev). Son point de contrôle public est [`/health`](https://evportal-pairing-relay.carbonnier-anthony.workers.dev/health). L’adresse configurée dans `js/config.js` active les actions Envoyer et Recevoir dans la rubrique Téléphone du portail.

Après connexion au compte Cloudflare choisi avec Wrangler, `npm run deploy` publie le Worker et crée le namespace SQLite déclaré par la migration `v1`. Le nom par défaut est `evportal-pairing-relay`. L’URL retournée par Wrangler doit ensuite être renseignée dans la configuration du client EvPortal. GitHub Pages continue d’héberger le portail.

Si la connexion a expiré, `npx wrangler login --device --browser=false --scopes account:read user:read workers:write workers_scripts:write` permet de la renouveler depuis un navigateur, même lorsque le terminal est distant. Wrangler indique le lien et le code temporaires. Le droit `workers_scripts:write` est nécessaire pour lire le sous-domaine et déployer le script ; `workers:write` seul ne suffit pas pour cet accès. Vérifiez ensuite la connexion avec `npx wrangler whoami` ; aucun jeton n’est à ajouter au dépôt. [Droits acceptés pour le sous-domaine Workers](https://developers.cloudflare.com/api/resources/workers/subresources/subdomains/methods/get/).

`wrangler.jsonc` autorise uniquement l’origine de production `https://drslid.github.io`. Pour un autre domaine, adapter `ALLOWED_ORIGINS` avec des origines exactes séparées par des virgules, sans chemin ni wildcard. Les origines locales sont un réglage de développement explicite. L’API exige l’en-tête `Origin`, sauf pour `GET /health` ; cet en-tête filtre les navigateurs, il ne remplace pas l’authentification par jeton.

Les identifiants numériques `namespace_id` des deux bindings de limitation doivent rester distincts des autres bindings du même compte. L’observabilité applicative est désactivée ; le code ne journalise ni en-têtes d’autorisation, ni payloads, ni clés.

## Contrat HTTP v1

Toutes les réponses portent `Cache-Control: no-store`. Le relais n’accepte aucun paramètre de requête. CORS permet `Authorization` et `Content-Type`, sans cookies ni credentials.

| Requête | Autorisation | Réponse |
|---|---|---|
| `GET /health` | Aucune | `200 {"status":"ok","service":"evportal-pairing-relay"}` |
| `POST /v1/sessions`, JSON `{}` | Origine autorisée | `201 {id, receiveToken, sendToken, expiresAt}` |
| `GET /v1/sessions/:id` | `Bearer receiveToken` | `200 {status:"waiting",expiresAt}` ou `{status:"ready",expiresAt,payload:{iv,ciphertext}}` |
| `PUT /v1/sessions/:id`, JSON `{iv,ciphertext}` | `Bearer sendToken` | `200 {status:"sent"}` |
| `DELETE /v1/sessions/:id` | `Bearer receiveToken` | `204`, suppression du transfert |

L’identifiant contient 32 caractères hexadécimaux minuscules ; chaque jeton en contient 64. `expiresAt` est un horodatage Unix en millisecondes, fixé à cinq minutes après création. Seules les empreintes SHA-256 des jetons sont stockées.

Un seul dépôt distinct est permis. Réessayer exactement le même `{iv,ciphertext}` renvoie `sent` sans modifier le contenu ni prolonger l’échéance ; un autre dépôt renvoie `409`. Les opérations de lecture, dépôt et suppression passent par une transaction du Durable Object. La réception reste lisible jusqu’à l’accusé de réception `DELETE` ou l’expiration, pour permettre une reprise réseau.

Les erreurs sont des objets `{error:"code"}` : `400` pour un format invalide, `401` pour un jeton absent ou incorrect, `403` pour une origine refusée, `404` pour un chemin inconnu, `405` pour une méthode incorrecte, `409` pour un dépôt déjà effectué, `410` pour une session absente, expirée ou supprimée, `413` pour une taille excessive, `415` pour un type non JSON, `429` pour une limitation et `503` si l’infrastructure est indisponible. Les réponses `429` incluent `Retry-After: 60`.

## Chiffrement et limites

- Configuration avant chiffrement : **64 Kio maximum**. Au-delà, utiliser la sauvegarde JSON sur fichier.
- AES-GCM 256 bits côté navigateurs, nonce aléatoire de 12 octets, tag de 16 octets. Le client lie le message à sa session avec les données authentifiées UTF-8 `evportal-pairing-v1:<id>`.
- `iv` et `ciphertext` sont encodés en base64url canonique sans remplissage `=`. Le ciphertext inclut le tag GCM. Le relais valide le format et les tailles ; il ne possède pas la clé permettant de vérifier ou déchiffrer le contenu.
- Corps JSON HTTP : **100 Kio maximum**, contrôlés pendant la lecture du flux même sans `Content-Length`. La requête de création `{}` est limitée à 1 Kio.
- La clé de chiffrement reste dans les navigateurs et le fragment du QR. Elle n’est jamais envoyée à l’API. Le QR `#receive` transmet le droit de déposer dans la session ; le QR `#download` transmet le droit de lire et supprimer la session déjà alimentée. Aucun ne contient un jeton de compte Telegra.ph.
- La limite de création est de 20 requêtes par minute et par IP ; les autres requêtes authentifiées sont limitées à 120 par minute et par IP. Les bindings Cloudflare appliquent ces compteurs par emplacement et avec une précision permissive : ce sont des limites anti-abus, pas un plafond global de facturation. Des utilisateurs derrière un même réseau mobile peuvent partager cette limite. Un binding manquant entraîne un refus `503`.

Le client accuse réception après déchiffrement et validation en mémoire. Il propose ensuite d’ajouter la sauvegarde à la liste locale. Le relais ne restaure aucune configuration : la restauration est une action explicite distincte dans Mes sauvegardes.

La durée de cinq minutes est contrôlée à chaque requête, sans dépendre du déclenchement ponctuel de l’alarme. L’alarme nettoie également les sessions abandonnées. Une suppression retire le contenu du stockage actif ; elle ne constitue pas une garantie d’effacement physique immédiat des sauvegardes du fournisseur. Les Durable Objects SQLite proposent notamment une restauration historique : seules les données chiffrées et les empreintes de jetons doivent donc y figurer.

Le navigateur Tesla réel reste à tester pour Web Crypto, le scan depuis le téléphone et les changements de connectivité. Si Web Crypto n’est pas disponible, le client doit refuser ce parcours plutôt que transmettre en clair.

## Références techniques

- [Stockage transactionnel et sauvegardes SQLite des Durable Objects](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Alarmes et durée de vie des Durable Objects](https://developers.cloudflare.com/durable-objects/examples/durable-object-ttl/)
- [Bindings de limitation Cloudflare, portée et précision](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [AES-GCM dans Web Crypto](https://www.w3.org/TR/webcrypto/#aes-gcm)
- [Parcours et comparaison avec Telegra.ph](../docs/APPAIRAGE-TELEPHONE-TESLA.md)
