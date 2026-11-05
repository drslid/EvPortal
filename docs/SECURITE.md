# Sécurité et limites de publication

Audit local du 4 novembre 2026 sur `local-international-preview`. Le contrôle
couvre le code courant et les scénarios locaux, pas un test de pénétration du
compte Cloudflare ou de la voiture.

## Corrections vérifiées

- Une déconnexion oublie l'accès dans les autres onglets du même navigateur.
  Les réponses HTTP tardives ne peuvent plus réenregistrer un code oublié.
- La commande de suppression et révocation est accessible dans **Mes appareils**,
  avec confirmation. Elle conserve les raccourcis locaux et invalide les anciens
  codes côté serveur. Déconnecter et révoquer restent deux actions distinctes.
- Le fichier du service local n'a qu'un seul propriétaire à la fois. Un ancien
  processus ne peut plus perdre des écritures ni ressusciter un profil révoqué.
- Une bibliothèque abîmée ne bloque plus les raccourcis valides. Ses octets
  d'origine restent intacts et l'export du portail demeure utilisable.
- Les pages refusent les scripts exécutables en ligne, `eval` et les connexions
  non autorisées avec une Content Security Policy. Les scripts d'aide sont externes.
  Les styles en ligne restent permis pour les couleurs et les composants.
- Le référent est `no-referrer`. La redirection Théâtre retire les fragments privés
  et paramètres de jetons avant de construire le lien tiers.
- Les dépendances de développement des deux services ont été actualisées. Les
  trois audits npm ne signalent plus de vulnérabilité connue au jour du contrôle.
- La CI installe Chromium et exécute le scénario de sécurité du navigateur.
  Les fichiers `.env*`, `.dev.vars.*`, bases locales et outils sont ignorés par Git.

## Confidentialité et confiance

Les snapshots sont chiffrés côté client avec AES-GCM. Le serveur conserve
l'enveloppe, une empreinte de jeton, une révision et des dates. Le code de reprise
donne accès au profil : mémoire uniquement par défaut, mémorisation explicite.

Une déconnexion ne révoque pas un autre appareil possédant le code. Si ce code
est compromis, récupérer ses raccourcis sur un appareil de confiance, révoquer
la sauvegarde puis en créer une nouvelle. Il n'y a pas de révocation individuelle.

Le chiffrement ne protège pas un navigateur déverrouillé, un script du site
compromis ou la suppression des données par l'hébergeur. Sur GitHub Pages,
`drslid.github.io/EvPortal/` partage son origine et son stockage avec les autres
projets de `drslid.github.io`. Un domaine dédié réduit ce périmètre de confiance.

Les sauvegardes historiques Telegra.ph restent publiques pour toute personne
possédant leur adresse ; l'interface annonce ce caractère public. Elles ne
deviennent pas privées par l'ajout de la synchronisation chiffrée.

## Avant l'activation cloud

Le portail peut être proposé en revue avec la synchronisation distante désactivée.
La configuration publique n'a pas de `syncURL`. Le Worker est fermé par défaut :
seule la valeur explicite `SYNC_ENABLED="true"` ouvre le service.

Il reste à :

1. Configurer le compte, D1 et les origines HTTPS autorisées.
2. Définir des plafonds persistants globaux de création et de stockage, avec les
   protections contre les abus. Le limiteur en mémoire repart au redémarrage et
   ne couvre pas toutes les instances. Le drapeau d'activation ne remplace pas
   ces protections.
3. Ajouter l'origine exacte de l'API à `connect-src` des pages lors du réglage de
   `EV_CONFIG.syncURL`, puis régénérer les pages traduites.
4. Tester le service réel et la Model 3 Highland, avec sa version logicielle notée.
5. Vérifier les paramètres Pages et les protections de branche du dépôt distant.

La CSP et le référent ont ici une protection HTML. Les politiques exigeant un
en-tête HTTP, notamment `frame-ancestors`, demandent un hébergement/proxy adapté.
Un fichier `_headers` ne configure pas à lui seul GitHub Pages.

`.gitignore` protège la sélection Git, pas une archive arbitraire du disque.
Ne jamais publier de base locale, variables privées ou répertoire d'outillage.
L’audit du 4 novembre n’a réalisé aucun déploiement Cloudflare ni réglage de compte distant. Une publication du frontend ne déploie pas la nouvelle API de synchronisation.

## Contrôles reproductibles

Avec Node.js 24 et les dépendances installées :

```sh
npm run check:seo
npm test
npm run test:security
npm run test:browser
npm run test:pairing
node sync/worker-smoke.cjs
```

`EVPORTAL_TEST_BROWSER_CHANNEL=msedge` sélectionne Edge sous Windows.
`EVPORTAL_SKIP_SCREENSHOTS=1` omet certaines captures sans désactiver les
assertions ni les contrôles d'accessibilité.

Les tests utilisent des configurations synthétiques et des bases temporaires,
sans afficher ou enregistrer les codes privés. Le scan de secrets est heuristique,
porte sur les fichiers courants et ne couvre pas l'historique Git. Les audits npm
ne garantissent pas l'absence de faille inconnue.
