# Audit et entretien du catalogue EvPortal

Version actuelle : **2026-09-curated**, revue le **11 septembre 2026**. Le catalogue contient **147 services uniques**, dont **35 facultatifs** ; les 112 autres sont proposés à la première installation selon le pays choisi. Les contrôles historiques du 10 septembre sont conservés plus bas avec leurs résultats d’origine.

## Sélection du 11 septembre 2026

Chaque service possède un `serviceId` stable, une URL principale et des `categoryIds`. ABRP appartient à Recharge et Navigation, avec Recharge comme propriétaire ; CANAL+ et Pluto TV appartiennent à Cinéma et Télévision, avec Cinéma comme propriétaire. Chaque service est enregistré une seule fois : la présence dans deux catégories ne crée pas un deuxième favori ou compteur de clics. Gulli est déplacé de Cinéma à Télévision.

Pluto TV utilise désormais l’accueil [pluto.tv](https://pluto.tv/), commun au direct et à la demande. Ses anciennes entrées `/fr/`, `/fr/watch/live-tv/` et `/live-tv` sont reconnues explicitement. Les migrations s’appuient sur les anciennes URL et identités connues ; un nom seul n’identifie pas un raccourci personnel.

La catégorie Jeux démarre avec **CrazyGames, 2048, Lichess, Little Alchemy 2 et Infinite Craft**. Les autres jeux, notamment Poki et les portails similaires, restent disponibles dans Ajouter. Tous les réseaux sociaux et les outils de travail Google Drive, Gmail, Google Agenda, GitHub, Notion, Google Docs, Outlook et OneDrive sont facultatifs (`defaultIncluded: false`). DeepL, Wikipédia et FAST.com restent proposés par défaut.

Les préférences de pays filtrent la sélection initiale et les propositions d’Ajouter ; elles ne suppriment aucun raccourci déjà installé. Le choix **Tous les pays** désactive ce filtre. Les pays proposés sont FR, CA, US, MX, BE, GB, DE, ES, IT, PT, AU, NZ et CH. Le catalogue conserve aussi les codes d’autres pays cités par un éditeur, comme les pays africains couverts par TF1+.

### Régions documentées

`countries` constitue une recommandation éditoriale par pays pour cette destination. L’absence de ce champ signifie qu’aucun filtre régional n’a été défini, pas qu’un service est garanti partout. Les droits peuvent varier selon le programme, le compte, le pays de résidence et le voyage en cours.

| Service | Pays recommandés | Source et nuance |
| --- | --- | --- |
| Crave | CA | La [fiche publiée par Bell Media](https://play.google.com/store/apps/details?id=ca.bellmedia.cravetv), mise à jour en septembre 2026, précise une disponibilité au Canada uniquement. |
| STARZ.com | US | Les [conditions du service STARZ](https://resources.starz.com/legal/spi-terms-web-us-en.html) limitent cette plateforme aux États-Unis et territoires couverts. Le bouquet STARZ d’un autre fournisseur, notamment Crave au Canada, est un accès distinct. |
| iHeartRadio | US, CA, MX, AU, NZ | Liste des cinq pays publiée dans l’[aide officielle iHeart](https://help.iheart.com/hc/en-us/articles/228919427-Is-iHeartRadio-available-in-my-country). |
| RTBF Auvio | BE | La [RTBF indique que certains contenus sont géobloqués en Belgique](https://support.rtbf.be/hc/fr-fr/articles/15710758810513-Probl%C3%A8mes-de-lecture-avec-le-replay-ou-le-direct). Cela ne concerne pas nécessairement tout le catalogue. Une portabilité européenne existe pour les résidents belges éligibles. |
| Molotov | FR | L’[assistance Molotov](https://aide.molotov.tv/hc/fr/articles/6042369113105-Acc%C3%A9der-%C3%A0-Molotov-hors-du-territoire-fran%C3%A7ais) documente l’accès en déplacement européen pour les résidents français avec abonnement payant. Les pays de voyage ne sont pas traités comme des pays de résidence. |
| TF1+ | FR, BE, LU, CH et 22 pays africains | La [liste internationale TF1+](https://help.tf1.fr/hc/fr/articles/19337708703634-La-plateforme-TF1-est-elle-disponible-%C3%A0-l-International), actualisée le 3 août 2026, inclut 26 pays. Les chaînes et programmes peuvent différer selon le pays ; TF1+ n’est donc pas classé « France uniquement ». |

### Quinze nouveaux services

Les liens du tableau sont les destinations officielles consultées. Contrôle HTTP ciblé du 11 septembre : **12 réponses 200 et 3 réponses 403**, aucun 404/410. Les trois protections concernent Electricity Maps, Infinite Craft et Atlas Obscura ; leurs pages ont également été consultées avec le moteur web. Une protection contre un client automatisé ne démontre pas qu’un site est inaccessible au conducteur.

| Catégorie | Service et destination officielle | Usage |
| --- | --- | --- |
| Cinéma | [JustWatch](https://www.justwatch.com/fr) | Trouver les plateformes proposant un film ou une série. |
| Cinéma | [ONF — Office national du film](https://www.onf.ca/) | Documentaires et animation du catalogue canadien. |
| Musique | [SomaFM](https://somafm.com/) | Radios indépendantes par genre et ambiance, financées par les auditeurs. |
| Musique | [Radio Paradise](https://radioparadise.com/) | Radio musicale et différents mix. |
| Musique | [myNoise](https://mynoise.net/) | Ambiances sonores et sons de nature personnalisables. |
| Télévision | [NASA+](https://plus.nasa.gov/) | Missions spatiales, directs et documentaires. |
| Recharge | [Electricity Maps](https://app.electricitymaps.com/) | Carte du mix électrique et de l’intensité carbone, pas un tarif de recharge. |
| Jeux | [Little Alchemy 2](https://littlealchemy2.com/) | Combinaisons d’éléments dans un jeu direct. |
| Jeux | [Infinite Craft](https://neal.fun/infinite-craft/) | Jeu de combinaisons et de découverte. |
| Navigation | [Wikivoyage](https://fr.wikivoyage.org/wiki/Accueil) | Guides de voyage collaboratifs. |
| Navigation | [Atlas Obscura](https://www.atlasobscura.com/) | Lieux insolites et idées d’étapes. |
| Actualités | [Techmeme](https://www.techmeme.com/) | Sélection de titres technologiques en anglais. |
| Météo | [Zoom Earth](https://zoom.earth/) | Images satellite, radar et suivi des tempêtes. |
| Météo | [LightningMaps](https://www.lightningmaps.org/) | Impacts de foudre détectés ; couverture dépendant du réseau de capteurs. |
| Outils | [FAST.com](https://fast.com/) | Mesure du débit Internet ; le test consomme des données. |

Les quinze logos ont été téléchargés une seule fois pour être servis localement, sans requête externe à chaque affichage. Douze proviennent directement des favicons déclarés par les éditeurs, trois du cache de favicons Google ; l’URL de récupération, l’origine connue, les dimensions, la date et l’empreinte SHA-256 figurent dans `img/services/sources.json`. Les 128 logos existants ont été conservés : 143 domaines sont couverts au total, plusieurs services partageant un domaine.

Les vérifications portent sur les destinations et les fichiers locaux. Elles ne constituent pas un test de lecture avec DRM, de connexion à un compte ni de fonctionnement réel dans le navigateur Tesla.

## Audit historique du 10 septembre 2026

Version éditoriale à cette date : **2026-09**.

Le catalogue passe de **121 raccourcis à 135** : **22 destinations actualisées**, **18 ajouts** et **4 retraits de la sélection par défaut**. Les dix identifiants de catégories historiques restent stables. Chaque service dispose désormais d’un nom lisible et d’une description française ; des indications de compte, de région ou de téléphone complètent les entrées concernées.

## Méthode et portée

1. Extraction des 121 raccourcis du `defaultPages` historique avant refonte : 119 URL uniques, les deux doublons exacts étant CANAL+ et ABRP.
2. Contrôle HTTP GET avec redirections, 6 requêtes simultanées au maximum et délai de 10 secondes par requête ; téléchargement du corps annulé après les en-têtes. Aucun compte connecté.
3. Lecture des destinations et recherche sur les sites des éditeurs pour confirmer les changements de marque, les clients web et les nouvelles ressources. Les sources officielles figurent plus bas.
4. Nouvelle passe sur le catalogue final et contrôles ciblés pour les destinations modifiées. Aucune suppression automatique fondée sur un code 403, 429 ou un incident réseau.

| Passe | Entrées / URL uniques | Réponses 2xx | Accès restreints | Erreurs réseau indéterminées |
| --- | ---: | ---: | ---: | ---: |
| Catalogue initial, 14:39 UTC | 121 / 119 | 112 | 6 | 1 |
| Catalogue actualisé, 14:43 UTC | 135 / 133 | 126 | 5 | 2 |

Le dernier chemin Deezer `/fr/channels/explore` a également été vérifié séparément : HTTP 200. Un contrôle intermédiaire a fait apparaître un 404 sur l’ancien chemin Tesla, ensuite corrigé. Le compte rendu ne représente pas une surveillance continue : par exemple France 24 a répondu 429 lors de la première passe, puis 200, et Google Agenda a répondu 200 puis a expiré lors de la dernière passe.

**Un statut 2xx indique seulement une réponse HTTP.** Il peut correspondre à une connexion, une page de restriction, un contrôle automatisé, un squelette JavaScript ou une vitrine commerciale. Cet audit ne valide ni une lecture audio/vidéo avec DRM, ni les abonnements, ni le tactile, ni le fonctionnement dans un véhicule. La compatibilité dépend du navigateur, de sa version et de la région. Il n’y a donc pas de badge « compatible Tesla » dans le catalogue.

## Destinations mises à jour

Le tableau conserve les corrections du 10 septembre. L’entrée Pluto TV a ensuite été réunie sur `https://pluto.tv/`, comme documenté ci-dessus. Les URL d’origine sont exactes pour permettre une migration ciblée ; aucun joker de domaine n’est utilisé.

| Service | Ancienne URL | Nouvelle URL | Justification |
| --- | --- | --- | --- |
| HBO Max | `https://www.max.com/` | [https://www.hbomax.com/](https://www.hbomax.com/) | Redirection observée de Max vers HBO Max ; marque actuelle confirmée par son centre d’aide. |
| Gulli | `https://replay.gulli.fr/Direct` | [https://www.m6.fr/gulli/direct](https://www.m6.fr/gulli/direct) | L’ancien replay redirige désormais vers le direct Gulli de M6+. |
| Deezer | `https://www.deezer.com/en/channels/explore/` | [https://www.deezer.com/fr/channels/explore](https://www.deezer.com/fr/channels/explore) | Accès au catalogue musical en français, à la place du chemin anglais. |
| SoundCloud | `https://www.soundcloud.com/` | [https://soundcloud.com/](https://soundcloud.com/) | Domaine canonique observé, sans www. |
| TIDAL | `https://tidal.com/` | [https://listen.tidal.com/](https://listen.tidal.com/) | Entrée du lecteur web documentée par l’assistance TIDAL ; accès automatisé restreint. |
| Qobuz | `https://www.qobuz.com/` | [https://play.qobuz.com/](https://play.qobuz.com/) | Entrée du lecteur web pour éviter la page de présentation commerciale. |
| M6+ | `https://www.6play.fr/` | [https://www.m6.fr/](https://www.m6.fr/) | 6play est remplacé par M6+, confirmé par le groupe M6. |
| TV5MONDEplus | `https://www.tv5monde.com/` | [https://www.tv5mondeplus.com/fr](https://www.tv5mondeplus.com/fr) | Choix éditorial : accès à la plateforme vidéo francophone du même groupe. |
| RTBF Auvio | `https://www.rtbf.be/auvio/direct` | [https://auvio.rtbf.be/direct](https://auvio.rtbf.be/direct) | Destination actuelle du direct après redirection de l’ancienne URL. |
| Pluto TV | `https://pluto.tv/live-tv` | [https://pluto.tv/fr/watch/live-tv/](https://pluto.tv/fr/watch/live-tv/) | Accès direct aux chaînes en français, après redirection observée. |
| Tesla Superchargeurs | `https://www.tesla.com/findus/location/supercharger` | [https://www.tesla.com/fr_fr/findus](https://www.tesla.com/fr_fr/findus) | L’ancienne route a répondu 403 puis 404 ; utilisation de la carte officielle Nous trouver. |
| Chargemap | `https://fr.chargemap.com/map` | [https://chargemap.com/fr-fr/map](https://chargemap.com/fr-fr/map) | Destination canonique française observée après redirection. |
| GeForce NOW | `https://play.geforcenow.com/mall/#/layout/games` | [https://play.geforcenow.com/](https://play.geforcenow.com/) | Entrée du lecteur sans ancienne route interne avec fragment. |
| CrazyGames | `https://www.crazygames.fr/` | [https://www.crazygames.com/fr/](https://www.crazygames.com/fr/) | Destination française canonique observée après redirection. |
| Waze | `https://www.waze.com/` | [https://www.waze.com/live-map/?locale=fr](https://www.waze.com/live-map/?locale=fr) | Accès à la carte en direct, avec interface française. |
| Apple Plans | `https://beta.maps.apple.com/` | [https://maps.apple.com/](https://maps.apple.com/) | Domaine actuel après redirection de beta.maps.apple.com. |
| TomTom Plan | `https://www.tomtom.com/en_gb/navigation/` | [https://plan.tomtom.com/](https://plan.tomtom.com/) | Planificateur web utilisable, à la place de la vitrine des produits de navigation. |
| X | `https://www.x.com/` | [https://x.com/](https://x.com/) | Domaine canonique observé, sans www. |
| Snapchat | `https://www.snapchat.com/` | [https://web.snapchat.com/](https://web.snapchat.com/) | Client web indiqué par l’assistance officielle. |
| franceinfo | `https://www.francetvinfo.fr/` | [https://www.franceinfo.fr/](https://www.franceinfo.fr/) | Nouveau domaine observé après redirection de francetvinfo.fr. |
| Notion | `https://www.notion.so/` | [https://www.notion.com/](https://www.notion.com/) | Domaine canonique actuel, sans imposer de route de connexion. |
| Outlook | `https://outlook.live.com/` | [https://outlook.live.com/mail/](https://outlook.live.com/mail/) | Accès direct à la messagerie après redirection observée. |

Les corrections de nom sans modification d’adresse incluent TF1+, france.tv, CANAL+, ABRP, Apple TV, Google Agenda et Google Docs. CANAL+ et ABRP restent accessibles dans deux catégories pertinentes ; le vérificateur déduplique les requêtes par URL.

## Quatre retraits de la sélection par défaut

| Ancienne entrée | Observation | Décision |
| --- | --- | --- |
| Hulu | `https://www.hulu.com/` redirige vers Disney+ dans le contexte réseau du contrôle. | Retiré de la sélection francophone car Disney+ est déjà présent ; cela ne signifie pas que Hulu a fermé mondialement. |
| Pandora | Réponse 200 redirigée vers `https://www.pandora.com/restricted`. | Retiré de la sélection par défaut en raison de la restriction observée ; pas de conclusion universelle de panne. |
| StreemaTV | `https://streema.com/tv` redirige vers `https://streema.com/radios?redirect=tv`. | Le raccourci ne mène plus au service TV annoncé ; les radios ont une sélection dédiée. |
| Anime Search | Simple recherche `anime` sur YouTube. | Doublon éditorial d’un moteur de recherche, sans service propre ; YouTube reste présent. |

Ces retraits ne constituent pas des remplacements vers un service différent dans `replacements`. Le catalogue ne demande pas la suppression des raccourcis personnels existants.

## Dix-huit ajouts vérifiés

| Catégorie | Nouveaux services | Intérêt |
| --- | --- | --- |
| Musique & radio | Radio France, FIP, France Inter, France Culture, Radio Garden | Directs et podcasts francophones, découverte des radios du monde. |
| Recharge | IONITY, Electra, Fastned, Freshmile, ChargeFinder | Cartes de réseaux et recherche de bornes pour compléter Chargemap, ABRP, PlugShare et Chargeprice. |
| Jeux | Lichess, Sudoku | Échecs et logique accessibles depuis une page web. |
| Navigation & trafic | Bison Futé, Sytadin | Informations routières françaises et trafic en Île-de-France. |
| Actualités | Automobile Propre | Actualité et essais liés aux véhicules électriques. |
| Météo | Vigilance météo | Carte officielle de vigilance de Météo-France. |
| Outils & services | DeepL, Wikipédia | Traduction et consultation d’informations en français. |

Aucune estimation de tarif de recharge ni disponibilité d’une borne n’est copiée dans EvPortal : l’utilisateur consulte la source correspondante, dont les données peuvent évoluer.

## Liens conservés avec limites de vérification

| Service | Observation | Lecture correcte |
| --- | --- | --- |
| TIDAL | 403 ; le lecteur redirige vers le domaine principal pour notre client HTTP. | Entrée du lecteur confirmée par l’assistance officielle ; lecture non testée. |
| Tesla | Ancienne route 403 puis 404 ; carte française 403. | Ancienne destination corrigée ; carte officielle protégée contre le client automatisé. |
| CNEWS, Libération | 403. | Accès refusé au client ; ne prouve pas la fermeture du site. |
| Reuters | 401. | Accès soumis à des restrictions ; lecture complète non validée. |
| France 24 | 429 lors de la première passe, 200 ensuite. | Limitation temporaire des requêtes ; lien conservé. |
| PlayHop | `UND_ERR_HEADERS_OVERFLOW`. | Limite du client HTTP Node sur les en-têtes ; disponibilité navigateur non établie. |
| Google Agenda | 200 puis `ETIMEDOUT`. | Incident réseau ponctuel ; compte Google toujours nécessaire. |
| MapQuest | 202. | Le serveur accepte la requête ; la fonctionnalité de carte n’est pas démontrée par ce seul statut. |
| Google Drive, Gmail, Google Docs | Redirection vers la connexion Google, réponse 200. | Services authentifiés ; aucune session personnelle testée. |
| OneDrive | Sans session, l’accueil redirige vers la présentation Microsoft. | Entrée générale conservée ; accès aux fichiers après connexion à vérifier. |
| Crave, STARZ, iHeartRadio, RTBF Auvio, RT | Restrictions possibles selon la région et le contenu. | Indication « Selon région » ; aucune garantie géographique. |

Certaines lectures via le moteur web ont aussi été bloquées par `robots.txt` ou des protections, notamment Radio France et franceinfo. Les vérifications HTTP locales et les pages d’aide des éditeurs permettent de documenter les adresses sans prétendre tester la lecture. Les résultats dépendent du réseau d’exécution ; la région exacte de l’IP n’a pas été certifiée.

## Sources primaires consultées

Changements d’adresse et accès web :

- [Annonce officielle M6 : 6play devient M6+](https://actu.m6.fr/information-et-magazines/officiel-la-plateforme-6play-devient-m6-et-devoile-ses-nouveautes), [direct Gulli sur M6+](https://www.m6.fr/gulli/direct).
- [Centre d’aide HBO Max](https://help.hbomax.com/us/) et redirection HTTP de `max.com` vers `hbomax.com`.
- [Apple : navigateurs pris en charge par Plans sur le web](https://support.apple.com/en-us/120585). La liste des navigateurs ne constitue pas une validation des navigateurs embarqués.
- [Waze : carte en direct française](https://www.waze.com/live-map/?locale=fr), [TomTom : aide sur Plan.TomTom.com](https://help.tomtom.com/hc/fr-be/articles/360013958599-Importation-d-%C3%A9l%C3%A9ments-dans-Plan-TomTom-com).
- [TIDAL : accès au lecteur web](https://support.tidal.com/hc/en-us/articles/115005868269-Download-Tidal), [lecteur Qobuz](https://play.qobuz.com/), [catalogue français Deezer](https://www.deezer.com/fr/channels/explore).
- [Snapchat : accès à Snapchat for Web](https://help.snapchat.com/hc/en-gb/articles/8133227022484-How-do-I-get-Snapchat-for-Web).
- [TV5MONDE : présentation de TV5MONDEplus](https://latina.tv5monde.com/fr/node/560596), [plateforme vidéo TV5MONDEplus](https://www.tv5mondeplus.com/fr).
- [RTBF : compte Auvio nécessaire](https://support.rtbf.be/hc/fr-fr/articles/15711012839441-Dois-je-m-inscrire-pour-profiter-des-contenus-RTBF-Auvio), [direct Auvio](https://auvio.rtbf.be/direct).
- [Tesla : assistance Superchargeur et carte Nous trouver](https://www.tesla.com/fr_fr/support/charging/supercharging).
- [Carte Chargemap française](https://chargemap.com/fr-fr/map), [franceinfo](https://www.franceinfo.fr/). Leurs nouveaux chemins ont aussi été constatés dans les redirections de leurs anciennes adresses.

Nouvelles ressources :

- [Radio France : directs et replays disponibles sur radiofrance.fr](https://www.radiofrance.com/faq/comment-reecouter-un-programme-dune-radio-de-radio-france), [offre de podcasts de Radio France](https://www.radiofrance.com/podcasts), [Radio Garden](https://radio.garden/).
- [IONITY : trouver une station](https://support.ionity.eu/en/how-to-charge-at-ionity/how-can-i-find-an-ionity-charging-station), [carte du réseau](https://www.ionity.eu/network).
- [Stations Electra](https://stations.go-electra.com/fr), [carte Fastned](https://www.fastnedcharging.com/fr/emplacements).
- [Freshmile : adresse de la carte dans la FAQ officielle](https://www.freshmile.com/aide-contact/), [ChargeFinder français](https://chargefinder.com/fr).
- [Lichess français](https://lichess.org/fr), [Sudoku français](https://sudoku.com/fr).
- [Carte Bison Futé](https://www.bison-fute.gouv.fr/zoommaintenant.html), [Sytadin](https://www.sytadin.fr/), [vigilance Météo-France](https://vigilance.meteofrance.fr/fr).
- [Automobile Propre](https://www.automobile-propre.com/), [traducteur DeepL](https://www.deepl.com/fr/translator), [Wikipédia francophone](https://fr.wikipedia.org/).

## Reproduire les vérifications

Node.js 20 ou plus récent, sans installation de dépendances :

```sh
node scripts/check-links.mjs --timeout 10000 --concurrency 6 --output rapport-liens.json
```

Le JSON est écrit dans le fichier demandé et sur la sortie standard. Il contient la date, la méthode, les URL finales, les redirections, le code HTTP, la durée et la catégorie de résultat. Le corps des pages n’est pas conservé. Sans `--output`, seul le JSON sur la sortie standard est produit.

Pour vérifier un ancien catalogue ou une sélection :

```sh
node scripts/check-links.mjs --input anciens-liens.json --output rapport-anciens-liens.json
```

Le fichier d’entrée accepte un tableau de `{ "name": "Service", "url": "https://…" }`, ou un objet de catégories contenant ces tableaux. Les seules URL autorisées sont HTTP et HTTPS. Les réponses 401, 403, 407, 429 et 451 sont classées `restricted-or-unverifiable`, les 404 et 410 `not-found-to-review`, et les incidents réseau `network-unverifiable`. Le script produit un inventaire et ne supprime jamais de lien. Les résultats HTTP ne provoquent pas volontairement un échec global ; une erreur de configuration ou d’entrée, elle, termine le programme en erreur.

## Entretien conseillé

- Relancer le contrôle chaque mois et après un signalement utilisateur. Une planification automatique peut être ajoutée ultérieurement à l’intégration continue.
- Revoir manuellement les 404/410 et les changements de domaine, en consultant la source officielle avant de modifier le catalogue.
- Refaire un essai des services audio/vidéo dans les navigateurs réellement ciblés, avec des comptes de test autorisés, puis dater la matrice de compatibilité par navigateur.
- Garder les descriptions sans prix, sans promesse de disponibilité universelle et sans garantie de compatibilité embarquée.
- Pour chaque prochaine version : compléter les remplacements exacts, documenter les ajouts/retraits et préserver les choix enregistrés par l’utilisateur.
