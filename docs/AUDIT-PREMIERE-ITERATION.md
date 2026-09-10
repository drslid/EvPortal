> Archive de la première itération, avant le retour utilisateur demandant une interface adaptée à l’écran Tesla. Les descriptions de cette proposition et ses résultats de test ne décrivent pas la version actuelle. Voir [l’audit révisé](AUDIT-AMELIORATIONS.md).

# Audit et propositions d'amélioration — EvPortal

Date : 10 septembre 2026. Périmètre : code local, catalogue de liens, interface, référencement, stockage et documentation. L'état initial comportait déjà des modifications locales de `index.html`, `css/styles.css` et `js/script.js` ; elles ont servi de base à la revue. Aucun classement Google, taux de conversion ni résultat sur véhicule réel n'est déduit de la seule lecture du code.

## Diagnostic

EvPortal dispose d'une base adaptée à son usage : site statique facile à héberger, personnalisation locale et accès direct à des services connus. Son amélioration la plus utile consiste à rendre les raccourcis immédiatement accessibles et fiables, puis à expliquer clairement les capacités et limites du portail. Ajouter uniquement des liens ou des mots-clés ne résoudrait pas les défauts de chargement et de persistance trouvés dans la version initiale.

Le catalogue initial comportait **121 raccourcis dans 10 catégories**. Certains services se retrouvaient dans plusieurs catégories. Le cœur initial représentait environ **85 Ko non compressés** pour HTML, CSS et JavaScript, mais l'affichage dépendait aussi de nombreuses requêtes de favicons et d'une bibliothèque QR code chargée depuis un CDN. Les images du dépôt totalisaient environ 1,2 Mo sur disque ; ce chiffre n'est pas le poids transféré à chaque visite.

## Constats initiaux vérifiables

| Domaine | Constat dans le code initial | Conséquence | Priorité |
| --- | --- | --- | --- |
| Chargement | `getBestFaviconUrl` attendait `onload` sans `onerror` ni délai maximal ; le chargement des catégories attendait ces promesses. | Un favicon inaccessible pouvait empêcher les catégories suivantes de s'afficher. | P0 |
| Entrées | Noms, URL et noms de pages interpolés dans `innerHTML` ; protocoles non filtrés. | Un import ou un raccourci malformé pouvait injecter du HTML ou produire un lien exécutable. | P0 |
| Sauvegarde | Configuration reconstruite à partir du DOM, stockage dispersé et appels asynchrones. | Ordre des raccourcis fragile et incohérences possibles entre affichage et sauvegarde. | P0 |
| Suppression | Suppression de liens par nom et `localStorage.clear()` à la réinitialisation. | Ambiguïtés avec des homonymes ; effacement possible de données d'autres applications sur la même origine. | P0 |
| Import | `?code=` déclenchait un import distant immédiat ; métadonnée `pages` pouvant être traitée comme une catégorie. | Remplacement non préparé et configurations incohérentes. | P0 |
| Export | Énumération de toutes les clés du stockage hors `config`, publication Telegra.ph et affichage du jeton d'accès. | Export trop large, dépendance distante et divulgation visuelle inutile du jeton. | P0 |
| Édition | Gestionnaires multiples pour le mode édition et le déplacement ; attributs `onclick` visant des fonctions limitées à un autre scope. | Risque de double action ou d'erreur lors de l'ajout. | P1 |
| Liens | Catalogue embarqué dans le gros fichier applicatif, anciens noms/adresses et restrictions régionales peu visibles. | Maintenance difficile et confusion entre lien disponible et service utilisable. | P1 |
| Interface | Longue introduction et cartes promotionnelles avant le tableau ; mélange français/anglais. | Les fonctions principales nécessitaient plus de lecture et de défilement. | P1 |
| Accessibilité | Boutons de suppression très petits, libellés symboliques et formulaires surtout décrits par leurs placeholders. | Précision tactile et parcours clavier difficiles. | P1 |
| CSS | Règles de navigation dupliquées, largeur/padding sans normalisation globale et effets de réduction au clic. | Apparence incohérente et risque de débordement sur mobile. | P1 |
| SEO | Titre, description, canonical, Open Graph et `WebApplication` déjà présents ; plusieurs titres cachés ajoutés en plus du H1 visible. | La priorité était la cohérence éditoriale et sémantique, pas l'ajout de balises identiques. | P1 |
| Sitemap | CSS, JS et `/img/logo.webp` inexistant inclus ; dates fixes de 2025. | Liste de ressources peu pertinente pour les pages à indexer. | P1 |
| Robots | Fichier prévu dans `/EvPortal/robots.txt` sur GitHub Pages. | Ce sous-chemin ne remplace pas le robots.txt de la racine d'hôte. | P1 |
| Manifeste | Orientation portrait imposée ; chemins figés ; `msTile` au lieu de `mstile`, dimension annoncée incohérente pour cette icône. | Présentation peu adaptée aux grands écrans et ressource d'installation cassée. | P2 |
| Promesses | « aucune donnée stockée » malgré `localStorage` ; « sans dépendance externe » malgré CDN et favicons distants ; bouton plein écran via redirection YouTube. | Écart entre communication et fonctionnement réel. | P1 |

## Socle mis à jour

Le travail porte sur un tableau utilisable dès l'ouverture, avec recherche globale, favoris et thème automatique/clair/sombre. Les icônes sont des monogrammes locaux, sans requête à un fournisseur de favicons. Le catalogue est séparé dans `js/catalog.js` pour que l'ajout d'un service n'impose pas de modifier le moteur de l'application. L'édition permet de renommer un raccourci, de modifier son adresse et sa description et de le déplacer vers une autre catégorie. Le script `scripts/check-links.mjs` permet de refaire un contrôle HTTP sans dépendance npm. Le catalogue passe de 121 à **135 raccourcis** : **22 destinations actualisées, 18 ajouts et 4 retraits de la sélection initiale**. Les corrections comprennent M6+, HBO Max, Apple Plans, Gulli et la carte Tesla ; les ajouts incluent IONITY, Electra, Fastned, Radio France, Lichess et Bison Futé. [Détail des corrections, sources et vérifications](LIENS.md).

Le modèle de données et ses validations sont isolés dans `js/state.js`, avec des tests dans `tests/state.test.js`. La nouvelle sauvegarde versionnée utilise la clé `evportal.state.v2`. Elle distingue les identifiants et les libellés, conserve les anciennes données et ne réintroduit pas systématiquement les raccourcis supprimés. Les adresses obsolètes sont corrigées par correspondance exacte et les noms personnels restent préservés. La validation des noms, structures et protocoles intervient avant l'application d'un import. L'import JSON montre un aperçu puis demande le remplacement ; l'ancienne entrée Telegra.ph est une lecture explicite et ne lance plus d'import automatique depuis l'URL.

L'export courant est un fichier JSON local. Les anciens exports Telegra.ph publiés restent sur ce service ; la réinitialisation du tableau ne les supprime pas. La communication de confidentialité décrit donc le stockage local et les requêtes externes réellement possibles.

Le titre et les descriptions sont recentrés sur les raccourcis Tesla, la recharge et les services du quotidien. Une capture réelle de la nouvelle interface, `img/evportal-preview.png` (1200 × 630), alimente l’aperçu de partage. Le contenu utile, les liens de secours sans JavaScript et la FAQ sont présents dans le HTML.

Le sitemap est ramené à la seule page canonique. Les champs de priorité et de fréquence sont retirés ; une date `lastmod` n'est pas inventée pour un déploiement qui n'a pas encore eu lieu. Google ignore `priority` et `changefreq` et n'exploite une date de modification que si elle est fiable. [Documentation officielle des sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

Le manifeste conserve trois icônes PNG réelles aux dimensions vérifiées, résout ses chemins relativement à `img/`, décrit l'application en français et accepte les orientations disponibles. Cette configuration facilite la présentation dans les navigateurs compatibles ; elle ne constitue pas à elle seule un cache hors connexion. [Référence du manifeste : icônes](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/icons), [orientation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/orientation).

## Stratégie éditoriale et SEO

### Positionnement recommandé

Promesse principale : **« Vos raccourcis Tesla : recharge, navigation, musique et divertissement, réunis dans un tableau personnalisable. »** Elle décrit ce que fait EvPortal sans affirmer que chaque plateforme est lisible sur tous les véhicules.

Les recherches à travailler sont des hypothèses éditoriales, pas des volumes mesurés : « portail Tesla », « raccourcis navigateur Tesla », « sites utiles recharge voiture électrique », « personnaliser navigateur Tesla ». Search Console servira à vérifier lesquelles apportent réellement des impressions et des visites.

Le contenu utile doit rester visible : fonctionnement de la sauvegarde locale, personnalisation, différences entre portail et lecteur de streaming, compatibilité du navigateur et lien vers l'aide. Google construit principalement les extraits depuis le contenu et peut choisir de réécrire la meta description. Une description factuelle améliore la compréhension, sans garantir un texte précis dans les résultats. [Guide Google sur les descriptions](https://developers.google.com/search/docs/appearance/snippet).

Les raccourcis doivent rester de vrais liens `<a href="…">` avec un nom explicite. Une interaction JavaScript seule n'offre pas la même base de navigation. Les catégories du tableau sont des vues locales ; elles ne sont pas artificiellement annoncées comme autant de pages publiques indexables. [Bonnes pratiques Google pour les liens](https://developers.google.com/search/docs/crawling-indexing/links-crawlable).

### Contenus à publier ensuite

| Page envisagée | Besoin servi | Contenu distinct nécessaire | Mesure |
| --- | --- | --- | --- |
| Guide d'installation | Mettre EvPortal en favori ou sur l'écran d'accueil. | Étapes et captures réellement testées par navigateur ; limites plein écran. | Visites, clics vers le portail et questions de support. |
| Guide compatibilité Tesla | Comprendre pourquoi un lien s'ouvre mais une vidéo ne se lance pas. | Tableau véhicule/logiciel/région, date d'essai et distinction connexion/lecture. | Couverture de tests et baisse des signalements non reproductibles. |
| Outils de recharge et voyage | Choisir les bons outils avant une pause ou un trajet. | Comparaison de cas d'usage, filtres pays et liens officiels. | Visites organiques et ouvertures des outils depuis cette page. |
| Sauvegarder son tableau | Restaurer une configuration sur un nouvel appareil. | Exemple d'export, étapes de restauration, limites du stockage navigateur. | Taux de réussite dans des essais utilisateurs. |

Ces pages n'existent pas encore. Ne les ajouter au sitemap qu'une fois publiées avec contenu propre, titre et canonical cohérents. Ne pas créer des pages quasi identiques pour chaque mot-clé.

## Propositions de fonctionnalités

Les efforts sont des ordres de grandeur en jours de développement pour une personne connaissant le projet, après validation du besoin. Ils incluent les vérifications usuelles, sans constituer un calendrier garanti.

| Priorité | Proposition | Valeur utilisateur | Effort estimé | Prérequis et critère de réussite |
| --- | --- | --- | --- | --- |
| P1 | Contrôle récurrent des liens et suivi daté | Évite le retour d'un catalogue périmé. | 1–2 j | Contrôle depuis une tâche serveur/CI, sans requêtes de test depuis chaque véhicule ; rapport hebdomadaire distinguant 404, redirections, anti-bot et connexion requise ; triage des nouveaux échecs. |
| P1 | Filtres pays, gratuité, compte et compatibilité | Réduit les services qui ne correspondent pas à la situation de l'utilisateur. | 2–3 j | Champs explicites et source/date ; couvrir les 30 services les plus utiles avant généralisation ; aucune étiquette « testé Tesla » sans essai identifié. |
| P1 | Annuler une suppression et sauvegarde avant import | Rattrape une erreur sans réinitialiser tout le tableau. | 1–2 j | Un état précédent versionné ; restauration exacte des liens, ordre et favoris après suppression/import. |
| P1 | Renommer/masquer les catégories et choisir un accueil fixe | Facilite un tableau personnel plus court. | 1–2 j | Préserver les identifiants ; une catégorie masquée doit rester récupérable et les favoris rester cohérents. |
| P1 | Planification CI et vérifications sur plusieurs navigateurs | Sécurise les futures mises à jour. | 1–2 j | Exécuter en CI les tests de données et la recette Chromium du dépôt ; étendre à un second moteur puis aux cas de véhicule identifiés. |
| P1 | Guides SEO et configuration Search Console | Rend le portail découvrable et les problèmes mesurables. | 2–4 j | Publication de 2 guides testés, accès à la propriété Search Console, sitemap accepté et suivi à 28/56 jours. |
| P2 | Profils locaux « quotidien », « recharge », « voyage » | Change de contexte sans refaire les favoris. | 2–4 j | Schéma de données migrable ; bascule en deux actions au plus et export/restauration de tous les profils. |
| P2 | QR code de transfert avec aperçu | Facilite le passage téléphone → véhicule. | 3–5 j | Choisir entre payload local limité et hébergement explicite ; test de taille, durée et confidentialité ; import réversible. |
| P2 | Mode compact/grandes tuiles | Adapte la densité à l'écran et à la portée tactile. | 1–2 j | Validation tactile sur véhicule ; accès aux favoris sans débordement à 320 px et sur grands écrans. |
| P2 | Cache du tableau et indication de connexion | Permet de consulter sa configuration quand le réseau disparaît. | 2–4 j | Service worker limité aux fichiers locaux, stratégie de mise à jour et test de migration ; les sites externes restent dépendants du réseau. |
| P2 | Traduction anglaise et sélection locale | Ouvre l'usage aux communautés hors francophonie. | 2–4 j | Dictionnaire de libellés, revue humaine ; routes linguistiques et `hreflang` uniquement pour de vraies pages traduites. |
| P2 | Signalement d'un lien depuis sa fiche | Réduit l'effort nécessaire pour maintenir le catalogue. | 1 j | Formulaire GitHub prérempli, envoi volontaire ; URL, région, symptôme et date sans inclure le reste des liens personnels. |
| P3 | Synchronisation entre appareils | Évite les échanges manuels de fichiers. | 5–10 j | Choix d'un service, authentification, coûts, résolution de conflits et suppression des données ; état identique sur deux appareils après modifications concurrentes. |
| P3 | Widgets météo/recharge près d'une destination | Apporte de l'information directement dans le tableau. | 4–8 j | API, attribution, quotas et consentement de localisation ; état hors ligne et fraîcheur de l'information visibles. |
| P3 | Collections communautaires | Facilite une première configuration par profil d'usage. | 4–7 j | Validation des liens, modération et aperçu ; aucune application automatique à l'ouverture d'un partage. |

La prochaine étape recommandée réunit **le contrôle des liens, les filtres de pertinence et la restauration d'une action**. Elle protège les bénéfices de la refonte. La synchronisation et les widgets viennent ensuite, car ils impliquent une infrastructure et des données supplémentaires.

## Validation et limites

La relecture de code révèle des défauts et permet de vérifier la cohérence des structures, mais ne remplace pas un essai de navigation. La disponibilité HTTP d'un site n'établit ni sa disponibilité commerciale dans tous les pays, ni la compatibilité DRM, ni la réussite de l'authentification dans un véhicule.

Tesla documente des options de divertissement variables selon la région, la date de construction et la configuration. Le Théâtre sur l'écran concerné est présenté pour une utilisation en stationnement et avec connexion réseau. Un test doit donc noter le modèle, le logiciel, la région, la connexion et le résultat exact, par exemple « page ouverte » ou « lecture après connexion réussie ». [Manuel Tesla](https://www.tesla.com/ownersmanual/modely/fr_fr/GUID-79A49D40-A028-435B-A7F6-8E48846AB9E9.html).

Le contrôle HTTP du catalogue final a recensé 133 URL distinctes : 126 réponses 2xx, 5 accès restreints et 2 erreurs réseau indéterminées. Il ne démontre pas la disponibilité des comptes ou de la lecture vidéo. Les exceptions, dates et conditions figurent dans [le rapport des liens](LIENS.md).

Les **18 tests du modèle de données** passent via `npm test` : migration, validation des imports, sauvegardes, limites et préservation des configurations.

La commande `npm run test:browser` réussit **9 groupes de vérifications dans Chromium**. Elle contrôle les favoris, l’ordre et le thème après rechargement, l’ajout et la modification de liens, le rendu de HTML saisi comme texte, l’export limité aux données EvPortal, le refus d’un import invalide sans mutation, l’aperçu d’un ancien JSON, la migration de 6play vers M6+, le stockage bloqué ou corrompu et la réinitialisation isolée. Un import Telegra.ph simulé vérifie qu’aucune requête ne part avant l’action explicite et qu’un aperçu précède l’application.

Aucun débordement horizontal n’a été détecté aux largeurs **320, 390, 768, 1024, 1440 et 1920 px**. Les **4 audits axe**, en thèmes sombre/clair à 390/1440 px, n’ont signalé aucune violation des règles automatisées WCAG 2 A/AA et 2.1 AA sélectionnées. Aucune erreur JavaScript de page n’a été relevée. Cela ne constitue pas un audit d’accessibilité exhaustif, notamment avec lecteur d’écran, et n’établit pas la compatibilité sur un véhicule physique.

Le script utilise un serveur local temporaire sous `/EvPortal/` et intercepte les services externes pour la recette applicative ; le contrôle des destinations HTTP est un travail distinct. Les captures et rapports sont générés dans `test-results/`, non versionné, et peuvent être reproduits avec les commandes du README.

Vérifications statiques effectuées : JSON du manifeste et XML du sitemap/configuration Microsoft valides ; existence et dimensions exactes des trois icônes PNG ; chemins de démarrage et de périmètre vérifiés à la racine locale, sous `/EvPortal/` et sous un sous-chemin alternatif ; une seule URL canonique dans le sitemap ; liens locaux de la documentation valides ; absence d’erreur d’espacement signalée par `git diff --check`.

La matrice de recette à conserver couvre : première ouverture ; reprise du format historique ; ajouter/modifier/supprimer/réordonner ; favoris après rechargement ; recherche sans accents ; choix de thème ; export/import aller-retour ; import refusé sans mutation ; stockage bloqué ou corrompu ; utilisation clavier ; largeur 320 px, tablette et grand écran. Les résultats réellement obtenus doivent être séparés de cette liste de vérifications attendues.

Aucune mesure d'audience Search Console ni mesure terrain sur Tesla n'est disponible dans cet audit. Les objectifs de performance après publication sont **LCP ≤ 2,5 s, INP ≤ 200 ms et CLS ≤ 0,1**, à évaluer sur l'expérience réelle et à compléter par une mesure de laboratoire reproductible. Ce sont des cibles, pas des scores obtenus. [Indicateurs Core Web Vitals de Google](https://developers.google.com/search/docs/appearance/core-web-vitals).

## Après déploiement

1. Vérifier les réponses de la page, des scripts, du CSS, du manifeste, des icônes et du sitemap sur l'URL publique, ainsi que l'absence d'erreur console.
2. Si le domaine change, mettre à jour canonical, Open Graph, JSON-LD, sitemap, robots.txt et l'ancienne configuration Microsoft de manière cohérente.
3. Exposer le fichier `robots.txt` à la racine de l'hôte si possible. Sur GitHub Pages projet, `/EvPortal/robots.txt` n'est pas l'emplacement interprété pour l'hôte ; utiliser la racine `drslid.github.io` ou soumettre le sitemap dans Search Console. [Règle Google](https://developers.google.com/crawling/docs/robots-txt/create-robots-txt).
4. Vérifier la propriété Search Console puis soumettre `https://drslid.github.io/EvPortal/sitemap.xml`. Inspecter l'URL et le HTML rendu pour contrôler la canonical choisie et le contenu réellement accessible.
5. Vérifier les métadonnées de partage et le balisage structuré. Décrire l'application sans notes, avis ou compatibilités inventés ; un JSON-LD valide ne garantit pas un résultat enrichi.
6. Mesurer le chargement publié avec PageSpeed Insights et une recette sur écran Tesla ; conserver le navigateur, la connexion et les conditions de test pour comparer.
7. Relever à 28 puis 56 jours les impressions, clics, requêtes et pages indexées. Comparer des périodes de durée équivalente et noter les changements de contenu ; ne pas attribuer automatiquement toute variation au titre ou à la refonte.

La publication, la validation Search Console et les essais sur véhicule nécessitent l'environnement correspondant. Ils ne sont pas présentés comme réalisés par les modifications locales du dépôt.
