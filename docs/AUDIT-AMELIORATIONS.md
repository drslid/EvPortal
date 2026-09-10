# EvPortal — audit révisé pour l’écran Tesla

Révision : 10 septembre 2026. Les retours utilisateur fixent la priorité : un lanceur de raccourcis simple, lisible d’un regard, facile à toucher. La première proposition ajoutait trop de texte et avait remplacé deux parcours utiles : le partage Telegra.ph avec QR code et le lancement plein écran particulier à Tesla. Ces parcours sont rétablis ; la présente révision affine le classement, la personnalisation et le transfert téléphone → Tesla.

Publication sur GitHub Pages autorisée après la recette locale. Aucun résultat sur véhicule physique ou dans Search Console n’est présenté comme acquis.

## Changements de cette révision

| Besoin | Réponse dans le projet |
| --- | --- |
| Retrouver l’identité du portail | Logo EvPortal d’origine centré, rangées de raccourcis centrées et bouton de thème visible dans l’en-tête. |
| Choisir un affichage simple | Deux thèmes visibles : clair et sombre. Les catégories restent accessibles sans défilement horizontal. |
| Utiliser sa langue | Interface, partage, erreurs et aide en anglais, français, espagnol, allemand, italien, russe, arabe et portugais. L’arabe utilise une présentation de droite à gauche. |
| Voir immédiatement les services | Raccourcis avec logo et nom ; descriptions et explications réservées aux vues qui les nécessitent. |
| Retrouver les services habituels | Vue « Tous » classée par nombre d’ouvertures décroissant ; ordre manuel utilisé en cas d’égalité. |
| Toucher et déplacer facilement | Grandes surfaces tactiles ; déplacement des raccourcis dans les catégories et les favoris. Aucun glisser-déposer dans « Tous », dont l’ordre est automatique. |
| Créer sans chercher dans les réglages | Le bouton « + » affiche « Créer un raccourci », « Créer une catégorie » et le catalogue. Les services déjà présents sont signalés par « Déjà présent ». |
| Personnaliser les catégories | Jusqu’à cinq catégories personnelles créées, nom de 16 caractères maximum, choix d’une icône SVG embarquée et édition par le crayon. |
| Ouvrir un service séparément | Les liens des raccourcis demandent un nouvel onglet (`target="_blank"`), conformément au choix utilisateur. |
| Reconnaître un service sans lire | 128 favicons embarqués pour les 135 raccourcis ; aucune requête de favicon vers un tiers au démarrage. |
| Préparer le tableau sur téléphone | Publication Telegra.ph explicite, code affiché et copiable, lien d’import et QR code généré localement. Sur Tesla, l’import utilise le code ou le lien ; le QR se scanne avec un téléphone. |
| Retrouver ses anciennes données | Migration locale conservée, réutilisation du compte historique Telegra.ph et import des anciens formats avec aperçu. |
| Retrouver le plein écran Tesla | Rétablissement du lancement via la redirection YouTube de la version historique ; API Fullscreen utilisée pour les navigateurs ordinaires. |
| Conserver un référencement utile | Métadonnées cohérentes, liens réels et explications déplacées dans l’aide ; l’écran de raccourcis n’est pas surchargé pour le SEO. |

Les descriptions restent dans le catalogue pour faciliter la recherche et la maintenance ; elles n’occupent plus les raccourcis. Les boutons d’édition et les options avancées ne sont affichés que dans les parcours correspondants.

Le vocabulaire de l’interface est uniformisé autour de « raccourci ». La sélection de langue est enregistrée à part sur l’appareil ; elle ne renomme pas les services ni les catégories personnelles et n’impose pas la langue de l’auteur lors d’un partage. Les langues sont proposées avec leurs noms natifs. Les traductions sont embarquées dans le site et se changent sans rechargement.

## Fiabilité conservée

Le catalogue reste séparé dans `js/catalog.js` et compte **135 raccourcis dans 10 catégories**. La première révision avait actualisé 22 destinations, ajouté 18 raccourcis et retiré 4 entrées de la sélection initiale. Les adresses corrigées et les limites des contrôles HTTP sont documentées dans [le rapport des liens](LIENS.md). Une réponse HTTP réussie ne prouve ni la disponibilité régionale, ni la connexion au compte, ni la lecture vidéo dans le véhicule.

Le modèle versionné `evportal.state.v2` conserve la personnalisation, l’ordre manuel, les favoris, les icônes de catégories, les compteurs d’ouvertures et le thème. Chaque compteur `clickCount` est lié à l’identifiant de son raccourci et persiste après rechargement. Les anciens formats sans compteur commencent à zéro ; le classement « Tous » s’appuie sur ces compteurs puis sur l’ordre manuel pour départager les égalités. Le compteur est enregistré dès l’ouverture ; l’affichage est reclassé au retour sur le portail ou lors de la prochaine visite de « Tous », sans interrompre l’ouverture du nouvel onglet.

Les limites de cinq catégories personnelles et de 16 caractères s’appliquent à la création dans l’interface. Les configurations existantes ou importées qui possèdent davantage de catégories ou des noms plus longs sont préservées dans les limites de validation historiques, dont 50 catégories au total. Les imports sont validés avant remplacement et une mise à jour ne réintroduit pas systématiquement les raccourcis supprimés. Réinitialiser EvPortal n’efface pas le stockage des autres applications de la même origine.

Le partage ne doit contenir que la configuration EvPortal. Le jeton Telegra.ph reste séparé et n’est pas inclus dans la page publiée, le QR code ou l’export JSON. Une publication est publique ; cette information appartient au dialogue de partage. Les QR codes sont rendus avec une bibliothèque embarquée et ne passent pas par un service de génération distant.

Le contenu publié par Telegra.ph est limité à 64 Kio UTF-8 ; le dépassement est détecté avant une requête. L’export JSON reste disponible pour une sauvegarde locale et les configurations plus volumineuses. [API Telegra.ph : createPage](https://telegra.ph/api#createPage).

## Transfert téléphone → Tesla

Le parcours décrit dans l’application et l’aide est le suivant : préparer le tableau sur téléphone, ouvrir « Partager », créer la sauvegarde publique et conserver son code ou son lien. Sur la Tesla, ouvrir **Réglages → Importer depuis Telegra.ph**, saisir le code ou le lien, toucher **Charger mes raccourcis**, puis confirmer avec **Utiliser ces raccourcis** après l’aperçu.

Le QR code sert à ouvrir le partage sur un téléphone qui le scanne. Le parcours ne suppose pas que la Tesla puisse scanner le QR affiché par le téléphone. La publication est un instantané : les modifications suivantes nécessitent un nouveau partage et un nouvel import. Le compte de publication et les données locales de deux appareils ne sont pas synchronisés automatiquement.

Pour essayer une version locale sur plusieurs appareils, ils doivent pouvoir accéder à la même version d’EvPortal. `localhost` ne désigne pas l’ordinateur depuis le téléphone ou la Tesla. L’adresse de retour du partage doit être une adresse de cet aperçu joignable par les appareils concernés ; l’adresse publique affiche la version publiée, qui peut différer de cet aperçu.

## Plein écran Tesla

Le plein écran web standard ne reproduit pas nécessairement le passage dans l’environnement Théâtre du véhicule. Le bouton Tesla reprend le principe de la version historique : ouvrir le parcours YouTube qui redirige vers l’adresse d’EvPortal. Il faut ensuite choisir « Accéder au site » ou « Go to site ». Le chemin de retour conserve le déploiement utilisé, y compris un sous-dossier GitHub Pages et le code d’un partage. L’entrée « Ouvrir le mode Théâtre Tesla » dans les réglages couvre les navigateurs qui ne s’identifient pas comme Tesla. [Parcours décrit dans la FAQ myTesla](https://mytesla.nu/).

Ce comportement doit être essayé sur la Tesla concernée : il dépend du logiciel et n’est pas une API officielle Tesla. Un test Chromium permet de vérifier la construction et le déclenchement de l’URL, mais pas l’entrée effective dans le Théâtre d’un véhicule.

Le lancement d’EvPortal en Théâtre et l’ouverture des raccourcis sont deux actions distinctes. Les raccourcis utilisent désormais `target="_blank"` à la demande de l’utilisateur. La présentation du nouvel onglet et son comportement depuis le Théâtre doivent être vérifiés sur véhicule ; la documentation ne promet plus que chaque raccourci reste dans le même onglet.

La recette sur véhicule doit noter le modèle, la version logicielle, la région et la connexion, puis distinguer « EvPortal ouvert », « plein écran obtenu » et « lecture d’un service réussie ». Tesla décrit des options de divertissement variables selon le véhicule et la région, avec un usage du Théâtre en stationnement. [Manuel Tesla](https://www.tesla.com/ownersmanual/modely/fr_fr/GUID-79A49D40-A028-435B-A7F6-8E48846AB9E9.html).

## SEO compatible avec un tableau épuré

Le titre et la description doivent dire ce que fait le produit : des raccourcis personnalisables pour Tesla et véhicules électriques, avec recharge, navigation et divertissement. Ils ne doivent pas promettre que tous les services sont lisibles sur tous les véhicules.

La nouvelle [page d’aide](../aide.html) est accessible depuis les réglages : déplacement des raccourcis, transfert téléphone → véhicule, différences entre ouverture d’un lien et lecture vidéo, limites du plein écran, essai local sur téléphone et récupération d’une sauvegarde. Elle possède son titre, sa canonical et une entrée au sitemap, qui contient désormais deux pages. Les catégories internes ne sont pas présentées comme autant de pages indexables.

Les raccourcis restent de vrais liens avec un nom accessible. L’aide doit pouvoir être lue par les visiteurs et les robots ; aucun texte accumulé hors écran n’est nécessaire pour conserver un tableau simple. Google peut réécrire la description dans ses résultats ; les balises servent à décrire correctement la page, sans garantir une position. [Liens explorables](https://developers.google.com/search/docs/crawling-indexing/links-crawlable), [descriptions dans les résultats](https://developers.google.com/search/docs/appearance/snippet).

Sur GitHub Pages projet, `EvPortal/robots.txt` n’est pas le `robots.txt` de la racine de l’hôte. L’indexation se suit avec la propriété Search Console correspondante et la soumission du sitemap après publication. [Emplacement du robots.txt](https://developers.google.com/crawling/docs/robots-txt/create-robots-txt).

## Propositions prioritaires

Les améliorations doivent réduire les gestes ou faciliter la récupération d’une configuration. Elles ne justifient pas d’ajouter du texte permanent à l’écran.

| Priorité | Proposition | Bénéfice | Effort indicatif |
| --- | --- | --- | --- |
| P1 | Annuler la dernière suppression ou le dernier import | Récupérer son tableau après une mauvaise manipulation. | 1–2 jours |
| P1 | Masquer des catégories et choisir « Favoris » comme accueil | Limiter les choix aux services réellement utilisés. | 1–2 jours |
| P2 | Profils « quotidien » et « voyage » | Changer de sélection sans reconstruire ses liens. | 2–4 jours |
| P2 | Réglage discret de la taille des raccourcis | Adapter la densité à l’écran après essais tactiles. | 1–2 jours |
| P2 | Signaler un lien depuis son raccourci | Faire remonter une destination inaccessible sans encombrer l’accueil. | 1 jour |

La maintenance doit prévoir un contrôle périodique des liens hors du véhicule, sans requêtes de contrôle à chaque ouverture du portail. La recette sur Tesla avec un téléphone doit valider le déplacement tactile, le plein écran, les nouveaux onglets et l’import par code ou lien. Ces vérifications ne nécessitent pas de nouveaux éléments dans le tableau.

Les filtres détaillés, les widgets et les collections communautaires ne sont plus des priorités de l’interface. Ils n’ont d’intérêt que si les essais montrent un besoin et s’ils restent à l’écart du tableau quotidien.

## Vérifications et limites

Les icônes de cette révision ont été téléchargées puis décodées avec Chromium : **128 images sur 128 chargées**, au plus **64 × 64 px**, pour **environ 162 Kio** au total. Les URLs sources, dates, dimensions et empreintes sont conservées dans `img/services/sources.json`. Le script `scripts/fetch-icons.mjs` permet de refaire la récupération ; aucun appel à Google Favicon n’est exécuté par le portail.

La recette de l’interface révisée doit couvrir le classement « Tous » après plusieurs ouvertures et rechargement, l’ordre stable en cas d’égalité, l’absence de déplacement dans cette vue, le glisser-déposer à la souris, au toucher et au clavier dans les catégories et les favoris, les rangées centrées et les nouveaux onglets. Pour les catégories, elle doit distinguer les limites de création de la préservation des anciennes sauvegardes et vérifier l’édition du nom et de l’icône. Le partage doit être vérifié avec des réponses API simulées : code affiché et copié, lien, QR décodé, aller-retour avec aperçu, reprise des anciens formats et absence de jeton publié.

La recette actuelle confirme **59 tests unitaires réussis**, **9 groupes de vérifications navigateur**, **9 groupes d’interactions** et **3 groupes de vérification du partage**. Les interactions utilisent Chromium complet en mode headless : déplacement à la souris, événements tactiles, clavier, ouverture réelle des nouveaux onglets au clic, au clic central et au toucher, compteurs, catégories, thème et changement de langue avec passage de droite à gauche. Le navigateur headless-shell plantait lors du clic central ; la recette d’interactions utilise donc `channel: 'chromium'`.

Le partage a été publié et réimporté avec une API simulée : aucune donnée n’a été publiée sur Telegra.ph pendant la recette. Le QR a été décodé et comparé au lien copié ; le code affiché et copié, le collage du lien EvPortal dans l’import, l’aperçu avant remplacement et l’absence du jeton dans le contenu partagé ont été vérifiés. Un changement vers l’arabe pendant une publication conserve le bouton désactivé et ne relance pas la requête. L’historique déjà chargé se traduit ensuite en allemand, y compris les libellés accessibles, sans nouvel appel réseau ni modification des noms personnels.

La recette `npm run test:i18n` passe dans les **huit langues sur six largeurs**, soit **48 vues de 320 à 1 920 px**. Elle contrôle les catégories sans défilement horizontal, les erreurs d’import, le partage, l’aide, les deux thèmes, la persistance de la langue et la direction du texte. Les captures françaises, allemandes et arabes ont également été inspectées. La recette navigateur comprend quatre audits axe en clair/sombre et sur mobile/ordinateur, sans violation WCAG A/AA détectée dans ces vues. Les captures et rapports sont dans `test-results/`. Ces contrôles ne constituent pas un audit exhaustif ni un essai physique sur une Tesla.

Les résultats de la première itération sont conservés dans [l’audit archivé](AUDIT-PREMIERE-ITERATION.md). Ses anciens chiffres de tests et captures ne valident pas à eux seuls cette nouvelle interface. Les commandes reproductibles sont indiquées dans le [README](../README.md) ; les résultats de la recette actuelle sont produits dans `test-results/`.

Aucun essai physique Tesla, publication de page Telegra.ph de test ou déploiement n’est requis pour les contrôles locaux. Le plein écran effectif et le transfert entre le téléphone et le véhicule restent à confirmer dans leur environnement réel. Les résultats Search Console et les performances terrain ne peuvent être mesurés qu’après publication.
