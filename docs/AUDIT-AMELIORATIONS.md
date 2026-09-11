# EvPortal — audit révisé pour l’écran Tesla

Révision : 11 septembre 2026. Les retours utilisateur fixent la priorité : un lanceur de raccourcis simple, lisible d’un regard, facile à toucher. La première proposition ajoutait trop de texte et avait remplacé deux parcours utiles : le partage Telegra.ph avec QR code et le lancement plein écran particulier à Tesla. Ces parcours sont rétablis. Les compléments du 11 septembre ajoutent la suppression directe, des adresses de partage aléatoires et un groupe « Sauvegardes » dans les paramètres qui rassemble export, import et réception depuis le téléphone. Le catalogue est ensuite allégé par une identité unique par service, une sélection par pays et des ajouts à la demande ; les préférences d’accueil et de catégories restent dans les paramètres.

Publication sur GitHub Pages autorisée après la recette locale. Aucun résultat sur véhicule physique ou dans Search Console n’est présenté comme acquis.

## Changements de cette révision

| Besoin | Réponse dans le projet |
| --- | --- |
| Retrouver l’identité du portail | Logo EvPortal d’origine centré, rangées de raccourcis centrées et bouton de thème visible dans l’en-tête. |
| Choisir un affichage simple | Deux thèmes visibles : clair et sombre. Les catégories restent accessibles sans défilement horizontal. |
| Utiliser sa langue | Interface, partage, erreurs et aide en anglais, français, espagnol, allemand, italien, russe, arabe et portugais. L’arabe utilise une présentation de droite à gauche. |
| Voir immédiatement les services | Raccourcis avec logo et nom ; descriptions et explications réservées aux vues qui les nécessitent. |
| Éviter les doublons | ABRP, CANAL+ et Pluto TV ont une fiche commune à plusieurs catégories, un seul favori et un seul compteur. Gulli rejoint Télévision. |
| Alléger la sélection | CrazyGames et quelques jeux directs au départ ; autres portails, réseaux sociaux et outils professionnels disponibles dans Ajouter. |
| Choisir son accueil | Pays, catégories affichées et « Ouvrir sur mes favoris » dans Paramètres → Catalogue et accueil, mémorisés sur cet appareil. |
| Retrouver les services habituels | Vue « Tous » classée par nombre d’ouvertures décroissant ; ordre manuel utilisé en cas d’égalité. |
| Toucher et déplacer facilement | Grandes surfaces tactiles ; déplacement des raccourcis dans les catégories et les favoris. Aucun glisser-déposer dans « Tous », dont l’ordre est automatique. |
| Créer sans chercher dans les paramètres | Le bouton « + » affiche « Créer un raccourci », « Créer une catégorie » et le catalogue. Les services déjà présents sont signalés par « Déjà présent ». |
| Personnaliser les catégories | Jusqu’à cinq catégories personnelles créées, nom de 16 caractères maximum, choix d’une icône SVG embarquée et édition par le crayon. |
| Supprimer en un geste | Suppression immédiate des raccourcis et des catégories, sans confirmation intermédiaire. Supprimer une catégorie conserve les raccourcis encore associés à une autre catégorie ; ceux qui lui appartiennent exclusivement sont retirés. La réinitialisation complète reste soumise à confirmation. |
| Ouvrir un service séparément | Les liens des raccourcis demandent un nouvel onglet (`target="_blank"`), conformément au choix utilisateur. |
| Reconnaître un service sans lire | 143 favicons embarqués pour les 147 services du catalogue ; aucune requête de favicon vers un tiers au démarrage. |
| Transférer depuis le téléphone | La Tesla affiche le QR de réception, le téléphone envoie sa configuration chiffrée et la Tesla demande son application. Relais de réception requis. |
| Sauvegarder simplement | Création avec nom facultatif, QR et copie du lien ; historique chargé à l’ouverture de « Mes sauvegardes », avec effacement manuel. |
| Éviter les adresses prévisibles | Les nouveaux partages utilisent un identifiant aléatoire ; le titre choisi reste lisible dans l’historique. Les pages restent publiques et non chiffrées. |
| Retrouver ses anciennes données | Migration locale conservée, réutilisation du compte historique Telegra.ph et import des anciens formats avec aperçu. |
| Retrouver le plein écran Tesla | Rétablissement du lancement via la redirection YouTube de la version historique ; API Fullscreen utilisée pour les navigateurs ordinaires. |
| Conserver un référencement utile | Métadonnées cohérentes, liens réels et explications déplacées dans l’aide ; l’écran de raccourcis n’est pas surchargé pour le SEO. |

Les descriptions restent dans le catalogue pour faciliter la recherche et la maintenance ; elles n’occupent plus les raccourcis. Les boutons d’édition et les options avancées ne sont affichés que dans les parcours correspondants.

Le vocabulaire de l’interface est uniformisé autour de « raccourci ». La sélection de langue est enregistrée à part sur l’appareil ; elle ne renomme pas les services ni les catégories personnelles et n’impose pas la langue de l’auteur lors d’un partage. Les langues sont proposées avec leurs noms natifs et leurs drapeaux ; le nom reste lisible pour identifier la langue. Les traductions sont embarquées dans le site et se changent sans rechargement.

## Fiabilité conservée

Le catalogue reste séparé dans `js/catalog.js` et compte **147 services uniques dans 10 catégories**, dont **35 facultatifs**. Une nouvelle configuration française contient **108 raccourcis**, contre 135 auparavant ; les 15 nouveaux services demandés sont inclus dans le catalogue. Les autres pays ont une sélection adaptée aux recommandations documentées. Les configurations déjà personnalisées conservent leurs choix : le changement de pays filtre Ajouter sans retirer leurs raccourcis. La première révision avait actualisé 22 destinations, ajouté 18 raccourcis et retiré 4 entrées de la sélection initiale. Les adresses corrigées et les limites des contrôles HTTP sont documentées dans [le rapport des liens](LIENS.md). Une réponse HTTP réussie ne prouve ni la disponibilité régionale, ni la connexion au compte, ni la lecture vidéo dans le véhicule.

Chaque service est stocké une seule fois avec ses appartenances `categoryIds` et, pour les services du catalogue, un `serviceId` stable. La migration regroupe uniquement les identités historiques reconnues, additionne leurs ouvertures, conserve leurs favoris et ne fusionne pas les raccourcis personnalisés sur la seule base d’un nom. Les appartenances sont modifiables dans « Autres catégories » ; l’import et l’export les conservent.

Le pays est proposé à partir de la région explicite du navigateur lorsqu’elle est reconnue, sans GPS ni service tiers, puis modifiable. Le filtre concerne la sélection initiale et Ajouter ; « Voir tous les pays » rend tous les services accessibles. Pays, catégories masquées et accueil sur les favoris sont enregistrés séparément et ne sont pas transmis dans les sauvegardes ou les transferts QR. Tous et Favoris restent toujours accessibles.

Le modèle versionné `evportal.state.v2` conserve la personnalisation, l’ordre manuel, les favoris, les icônes de catégories, les compteurs d’ouvertures et le thème. Chaque compteur `clickCount` est lié à l’identifiant de son raccourci et persiste après rechargement. Les anciens formats sans compteur commencent à zéro ; le classement « Tous » s’appuie sur ces compteurs puis sur l’ordre manuel pour départager les égalités. Le compteur est enregistré dès l’ouverture ; l’affichage est reclassé au retour sur le portail ou lors de la prochaine visite de « Tous », sans interrompre l’ouverture du nouvel onglet.

Les limites de cinq catégories personnelles et de 16 caractères s’appliquent à la création dans l’interface. Les configurations existantes ou importées qui possèdent davantage de catégories ou des noms plus longs sont préservées dans les limites de validation historiques, dont 50 catégories au total. Les imports sont validés avant remplacement et une mise à jour ne réintroduit pas systématiquement les raccourcis supprimés. Réinitialiser EvPortal n’efface pas le stockage des autres applications de la même origine.

Le partage ne doit contenir que la configuration EvPortal. Le jeton Telegra.ph reste séparé et n’est pas inclus dans la page publiée, le QR code ou l’export JSON. Une publication est publique ; cette information appartient au dialogue de partage. Les QR codes sont rendus avec une bibliothèque embarquée et ne passent pas par un service de génération distant.

Le contenu publié par Telegra.ph est limité à 64 Kio UTF-8 ; le dépassement est détecté avant une requête. L’export JSON reste disponible pour une sauvegarde locale et les configurations plus volumineuses. [API Telegra.ph : createPage](https://telegra.ph/api#createPage).

## Adresses de partage aléatoires

Une nouvelle publication utilise 128 bits produits par le générateur cryptographique du navigateur, encodés en 32 caractères hexadécimaux avec le préfixe `EVP-`. Le nom choisi par l’utilisateur sert au titre visible de la sauvegarde, sans déterminer cette partie aléatoire de l’adresse. Si la génération cryptographique est indisponible, l’application interrompt le partage ; elle ne se rabat pas sur `Math.random`.

La publication se fait en deux étapes : création d’une page provisoire sans configuration, vérification de la conservation de l’identifiant aléatoire dans le chemin retourné, puis écriture de la configuration et du titre choisi. Si le chemin initial ne conserve pas cet identifiant, aucune configuration n’est envoyée à cette page. Une page provisoire peut donc exister sans contenir de configuration si une étape échoue.

Ces identifiants rendent les nouvelles adresses difficiles à deviner. Ils n’ajoutent ni authentification du lecteur ni chiffrement : la page reste consultable par toute personne disposant du lien. Les anciens liens conservent leur adresse et leur accessibilité ; les rendre privés ou les supprimer n’est pas un effet de cette évolution. Leur import reste pris en charge.

## Transfert téléphone → Tesla

Le nouveau parcours affiche le QR sur l’écran récepteur : **Paramètres → Sauvegardes → Recevoir depuis mon téléphone** dans la Tesla, scan depuis le téléphone, choix et envoi de ses raccourcis ou d’une sauvegarde Telegra.ph, puis confirmation sur la Tesla. Le transfert chiffré est valable cinq minutes et ne constitue pas une synchronisation continue. La configuration précédente est conservée localement pour permettre d’annuler le dernier transfert.

Ce parcours utilise le relais temporaire décrit dans [la documentation d’appairage](APPAIRAGE-TELEPHONE-TESLA.md). Le code d’interface ne suffit pas à activer le service : sa configuration et son déploiement sont nécessaires. Si le service est absent ou indisponible, les sauvegardes Telegra.ph et l’import manuel restent disponibles dans les options. La disponibilité publique du relais n’est pas déduite des seuls tests locaux.

Dans **Paramètres → Sauvegardes**, les actions **Exporter une sauvegarde**, **Importer une sauvegarde** et **Recevoir depuis mon téléphone** sont réunies. L’export ouvre la création avec nom facultatif, le QR, la copie du lien et l’historique ; le fichier JSON reste dans ses options. L’import présente les sauvegardes disponibles, puis un aperçu avant confirmation ; le code, le lien et le fichier JSON restent dans ses options. Le tableau principal garde ses seuls outils quotidiens. Les URLs de partage utilisent l’adresse publique d’EvPortal ; aucun champ d’adresse ou code manuel n’occupe ce dialogue. Les essais locaux doivent tenir compte du fait que le téléphone ouvre la version publique.

## Effacement des sauvegardes

L’ouverture de « Mes sauvegardes » charge directement l’historique du compte existant. Chaque ligne permet de retrouver son QR ou d’effacer son contenu, sans confirmation intermédiaire. La suppression ne crée pas de compte. Un échec conserve la ligne et affiche une erreur traduite ; un succès retire la ligne et le QR s’il correspondait à cette sauvegarde.

L’API Telegra.ph ne fournit pas de suppression définitive de page. EvPortal utilise [`editPage`](https://telegra.ph/api#editPage) pour remplacer tout le contenu par un paragraphe neutre (« EvPortal backup removed. »), avec des informations d’auteur vides et le titre `Deleted Page`, puis filtre cette entrée de l’historique. La documentation ne garantit pas qu’un tableau de contenu vide soit accepté ; ce remplacement conserve un format de contenu explicitement documenté. Le résultat est vérifié avant d’annoncer l’effacement. L’adresse reste existante et cet effacement ne retire pas d’éventuelles copies conservées ailleurs.

## Plein écran Tesla

Le plein écran web standard ne reproduit pas nécessairement le passage dans l’environnement Théâtre du véhicule. Le bouton Tesla reprend le principe de la version historique : ouvrir le parcours YouTube qui redirige vers l’adresse d’EvPortal. Il faut ensuite choisir « Accéder au site » ou « Go to site ». Le chemin de retour conserve le déploiement utilisé, y compris un sous-dossier GitHub Pages et le code d’un partage. L’entrée « Ouvrir le mode Théâtre Tesla » dans les paramètres couvre les navigateurs qui ne s’identifient pas comme Tesla. [Parcours décrit dans la FAQ myTesla](https://mytesla.nu/).

Ce comportement doit être essayé sur la Tesla concernée : il dépend du logiciel et n’est pas une API officielle Tesla. Un test Chromium permet de vérifier la construction et le déclenchement de l’URL, mais pas l’entrée effective dans le Théâtre d’un véhicule.

Le lancement d’EvPortal en Théâtre et l’ouverture des raccourcis sont deux actions distinctes. Les raccourcis utilisent désormais `target="_blank"` à la demande de l’utilisateur. La présentation du nouvel onglet et son comportement depuis le Théâtre doivent être vérifiés sur véhicule ; la documentation ne promet plus que chaque raccourci reste dans le même onglet.

La recette sur véhicule doit noter le modèle, la version logicielle, la région et la connexion, puis distinguer « EvPortal ouvert », « plein écran obtenu » et « lecture d’un service réussie ». Tesla décrit des options de divertissement variables selon le véhicule et la région, avec un usage du Théâtre en stationnement. [Manuel Tesla](https://www.tesla.com/ownersmanual/modely/fr_fr/GUID-79A49D40-A028-435B-A7F6-8E48846AB9E9.html).

## SEO compatible avec un tableau épuré

Le titre et la description doivent dire ce que fait le produit : des raccourcis personnalisables pour Tesla et véhicules électriques, avec recharge, navigation et divertissement. Ils ne doivent pas promettre que tous les services sont lisibles sur tous les véhicules.

La nouvelle [page d’aide](../aide.html) est accessible depuis les paramètres : déplacement des raccourcis, transfert téléphone → véhicule, différences entre ouverture d’un lien et lecture vidéo, limites du plein écran, essai local sur téléphone et récupération d’une sauvegarde. Elle possède son titre, sa canonical et une entrée au sitemap, qui contient désormais deux pages. Les catégories internes ne sont pas présentées comme autant de pages indexables.

Les raccourcis restent de vrais liens avec un nom accessible. L’aide doit pouvoir être lue par les visiteurs et les robots ; aucun texte accumulé hors écran n’est nécessaire pour conserver un tableau simple. Google peut réécrire la description dans ses résultats ; les balises servent à décrire correctement la page, sans garantir une position. [Liens explorables](https://developers.google.com/search/docs/crawling-indexing/links-crawlable), [descriptions dans les résultats](https://developers.google.com/search/docs/appearance/snippet).

Sur GitHub Pages projet, `EvPortal/robots.txt` n’est pas le `robots.txt` de la racine de l’hôte. L’indexation se suit avec la propriété Search Console correspondante et la soumission du sitemap après publication. [Emplacement du robots.txt](https://developers.google.com/crawling/docs/robots-txt/create-robots-txt).

## Propositions prioritaires

Les améliorations doivent réduire les gestes ou faciliter la récupération d’une configuration. Elles ne justifient pas d’ajouter du texte permanent à l’écran.

| Priorité | Proposition | Comportement proposé |
| --- | --- | --- |
| P1 | Annuler une suppression | Un bouton temporaire restaure le raccourci ou la catégorie, son emplacement, ses favoris et ses compteurs, sans demander confirmation avant la suppression. |
| P1 | Raccourcis Standard / Grands | Agrandir les logos et les zones tactiles tout en gardant les rangées centrées ; le choix reste dans les paramètres. |
| P2 | Profils « quotidien » et « voyage » | Retrouver deux sélections de raccourcis sans refaire leur organisation. |
| P2 | Accueil disponible hors connexion | Garder l’interface et les icônes visibles après une première visite ; les services externes nécessitent toujours une connexion. |

Ces propositions restent à implémenter. Le réglage de taille s’inspire du choix de taille du texte déjà proposé par Tesla ; le cache local répond aux variations de connexion, sans permettre de consulter hors connexion les sites externes. [Manuel Tesla — Écran tactile](https://www.tesla.com/ownersmanual/model3/fr_fr/GUID-518C51C1-E9AC-4A68-AE12-07F4FF8C881E.html), [Tesla — Connectivité](https://www.tesla.com/fr_fr/support/connectivity).

La maintenance doit prévoir un contrôle périodique des liens hors du véhicule, sans requêtes de contrôle à chaque ouverture du portail. La recette sur Tesla avec un téléphone doit valider le déplacement tactile, le plein écran, les nouveaux onglets et l’import par code ou lien. Ces vérifications ne nécessitent pas de nouveaux éléments dans le tableau.

Les filtres détaillés, les widgets et les collections communautaires ne sont plus des priorités de l’interface. Ils n’ont d’intérêt que si les essais montrent un besoin et s’ils restent à l’écart du tableau quotidien.

## Vérifications et limites

La recette actuelle comprend **104 tests unitaires du portail**, **10 groupes navigateur**, **10 groupes d’interactions**, **9 parcours de catalogue**, **3 groupes de partage** et **3 groupes d’appairage avec API simulée**. Les tests couvrent les services uniques, les favoris et compteurs partagés, les appartenances multiples, la suppression avec reclassement, les personnalisations et les préférences locales. Les anciennes configurations reçues d’un autre onglet et la sauvegarde du dernier transfert sont migrées avant leur affichage ou leur restauration. La nouvelle configuration française et les ajouts à la demande sont vérifiés dans le navigateur. Les commandes reproductibles sont dans le [README](../README.md).

Le transfert est aussi exercé avec le **vrai Worker local et ses Durable Objects SQLite**, en suivant directement le QR et la configuration servis par `npm run dev`, sans substitution dans le navigateur de test : QR décodé, chiffrement, aperçu, application explicite, conservation de l’ancien état lorsque le stockage est plein, annulation après rechargement et entre onglets. Les **8 tests du relais** et la construction du bundle Worker ont été validés lors de la révision de l’appairage ; le relais n’a pas changé pour ce complément de catalogue. Aucune page Telegra.ph réelle n’a été publiée ou effacée pendant les tests.

La recette `npm run test:i18n` passe dans les **huit langues sur six largeurs**, soit **48 vues de 320 à 1 920 px**. Elle contrôle les catégories sans défilement horizontal, les erreurs d’import, le partage, l’aide, les deux thèmes, la persistance de la langue et la direction du texte. Les nouveaux réglages et l’édition des appartenances ont également été inspectés en français et en arabe, avec six contrôles de débordement et d’accessibilité WCAG A/AA sans violation détectée. Les captures et rapports sont conservés dans `test-results/`. Ces contrôles ne constituent pas un audit exhaustif ni un essai physique sur une Tesla.

Les interactions utilisent Chromium complet en mode headless : déplacement à la souris, événements tactiles, clavier, ouverture réelle des nouveaux onglets au clic, au clic central et au toucher. Le navigateur headless-shell plantait lors du clic central ; la recette utilise donc `channel: 'chromium'`.

Les **143 icônes locales** occupent environ **221 Kio**. Les URL sources, dates, dimensions et empreintes sont conservées dans `img/services/sources.json`. Le script `scripts/fetch-icons.mjs` permet de refaire la récupération ; aucun appel à Google Favicon n’est exécuté par le portail. Les 15 nouvelles destinations ont fait l’objet d’un contrôle ciblé : 12 réponses 200, 3 réponses 403, aucun 404/410. Un refus automatisé ne suffit pas à conclure qu’un site est inaccessible ; le détail et les sources primaires figurent dans [le rapport des liens](LIENS.md).

Les résultats de la première itération sont conservés dans [l’audit archivé](AUDIT-PREMIERE-ITERATION.md). Ses anciens chiffres ne valident pas à eux seuls cette nouvelle interface.

Le plein écran effectif, les nouveaux onglets dans le Théâtre et le transfert entre téléphone et véhicule restent à confirmer sur une Tesla physique. Le relais public doit encore être activé suivant [la documentation d’appairage téléphone–Tesla](APPAIRAGE-TELEPHONE-TESLA.md). Les résultats Search Console et les performances terrain ne peuvent être mesurés qu’après publication.
