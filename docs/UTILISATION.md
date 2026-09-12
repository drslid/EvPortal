# Utiliser EvPortal

[Présentation du projet](../README.md) · [Guide français en ligne](https://drslid.github.io/EvPortal/fr/aide.html) · [Développement](DEVELOPMENT.md)

EvPortal regroupe des raccourcis vers des sites web sur une interface tactile. Ouvrez le portail dans le navigateur du véhicule, du téléphone ou de l’ordinateur. Un raccourci demande l’ouverture du service dans un nouvel onglet ; le comportement final dépend du navigateur.

## Organiser l’écran

La vue **Tous** classe les raccourcis du plus ouvert au moins ouvert. À égalité, elle conserve l’ordre manuel. Chaque raccourci possède son propre compteur, enregistré avec la configuration ; le classement ne nécessite aucun outil d’analyse d’audience.

Pour déplacer des raccourcis, ouvrez une catégorie ou **Favoris**, touchez **Modifier**, utilisez les poignées puis touchez **Terminer**. La vue Tous conserve son classement automatique. Au clavier, sélectionnez une poignée avec Espace, déplacez-la avec les flèches, validez avec Entrée ou annulez avec Échap.

Le bouton **+** ouvre le catalogue commun : 147 services, dont 112 dans la sélection initiale et 35 facultatifs. Ouvrez une catégorie repliable, puis utilisez **Ajouter** ou **Supprimer**. Les actions **Créer un raccourci** et **Créer une catégorie** figurent en haut. Le catalogue est identique pour tous ; les sites externes conservent leurs propres restrictions d’accès.

Vous pouvez créer jusqu’à cinq catégories personnelles, avec un nom de 16 caractères maximum et une icône parmi 25. **Plus d’icônes** affiche les choix supplémentaires. Le crayon d’une catégorie permet de modifier son nom et son icône.

Lors de l’édition d’un raccourci, choisissez sa catégorie principale et, si nécessaire, **Autres catégories**. Un service partagé garde un seul nom, lien, favori et compteur. Il apparaît une seule fois dans Tous et Favoris. Supprimer une catégorie conserve les services appartenant aussi à une autre ; les services qui lui appartiennent exclusivement sont retirés.

La suppression d’un raccourci ou d’une catégorie est immédiate. La réinitialisation complète demande confirmation. Elle ne supprime pas le stockage des autres applications de la même origine, ni les pages Telegra.ph publiées.

## Apparence et accueil

Dans **Paramètres → Apparence**, choisissez la taille **Standard** ou **Petite** et activez ou désactivez **Afficher les noms**. Standard et les noms visibles sont les réglages initiaux. La petite taille réduit les cartes et leurs icônes pour afficher davantage de raccourcis.

Le thème sombre est utilisé par défaut. Le bouton de thème dans l’en-tête permet de passer au clair ; un choix clair déjà enregistré reste respecté.

Dans **Paramètres → Accueil**, choisissez les catégories visibles et **Ouvrir sur mes favoris**. Masquer une catégorie retire son onglet sans supprimer les raccourcis disponibles dans Tous et Favoris.

Taille, affichage des noms, accueil et catégories visibles sont des préférences propres à l’appareil. Elles persistent après rechargement et sont partagées entre les onglets du même navigateur, mais ne sont pas transmises dans les sauvegardes. La langue est également enregistrée séparément. Une adresse traduite impose sa langue au chargement ; les noms personnalisés restent conservés.

## Code ou lien

**Créer** publie une sauvegarde sur Telegra.ph et fournit un code et un lien EvPortal à copier, avec un nom facultatif. Ce parcours n’affiche pas de QR. La page apparaît dans **Mes sauvegardes → En ligne** ; elle n’est pas dupliquée automatiquement dans la liste locale.

**Ajouter** accepte un code, un lien EvPortal ou une ancienne adresse Telegra.ph. Après validation et lecture, la sauvegarde est enregistrée dans **Sur cet appareil**. Elle ne remplace pas les raccourcis actifs. Choisir un fichier JSON dans les options produit le même résultat.

Une adresse EvPortal contenant `?code=...` ou `?config=...` prépare seulement le formulaire. Aucun téléchargement ni remplacement de configuration n’a lieu automatiquement.

Les nouvelles adresses Telegra.ph utilisent un identifiant aléatoire, mais leur contenu reste **public et non chiffré** : toute personne ayant l’adresse peut le lire. Le jeton du compte et les préférences de l’appareil ne sont pas publiés. Une configuration trop grande pour la limite de contenu Telegra.ph de 64 Kio peut être conservée dans un fichier JSON.

## Envoyer ou recevoir avec le téléphone

Dans **Paramètres → Sauvegardes → Téléphone** :

- **Envoyer** affiche un QR que le téléphone scanne pour récupérer les raccourcis de cet écran ou une sauvegarde choisie.
- **Recevoir** affiche un QR permettant au téléphone d’envoyer ses propres raccourcis ou une sauvegarde choisie.

Le destinataire touche **Ajouter** pour conserver la sauvegarde localement. Le transfert ne remplace jamais directement son écran. Il est chiffré, valable cinq minutes et ne constitue pas une synchronisation automatique.

Ce parcours dépend du relais configuré et de sa disponibilité. Les deux appareils doivent pouvoir joindre le portail et le relais dans un contexte sécurisé compatible avec Web Crypto. Les détails, limites et conditions des essais locaux figurent dans [la documentation du transfert](APPAIRAGE-TELEPHONE-TESLA.md). Au-delà de la limite de 64 Kio du transfert, utilisez un fichier JSON.

## Restaurer et gérer les sauvegardes

Ouvrez **Mes sauvegardes → Restaurer**, sélectionnez une entrée, vérifiez le nom et le résumé, puis touchez **Restaurer**. Seule cette dernière action remplace les raccourcis actifs. **Annuler la dernière restauration**, dans les options des paramètres, permet de revenir à la configuration précédente.

**Sur cet appareil** contient les instantanés ajoutés dans ce navigateur. **En ligne** affiche les pages du compte Telegra.ph disponible dans ce navigateur. Une copie locale reste indépendante de sa page d’origine : supprimer la page ne supprime pas cette copie.

La liste locale accepte jusqu’à 50 sauvegardes, dans la limite de 2 Mio par entrée et de l’espace disponible. La corbeille retire une sauvegarde sans modifier les raccourcis actifs. Pour une page en ligne, EvPortal remplace le contenu par un message neutre, efface l’auteur et remplace le titre avant de masquer l’entrée. L’API Telegra.ph ne supprime pas définitivement l’adresse. Un échec laisse la ligne disponible pour réessayer.

Conservez un export JSON en dehors du navigateur avant d’effacer les données du site ou de changer d’appareil. EvPortal n’offre pas de mode hors connexion ; les services ouverts nécessitent leur propre connexion.

## Reprendre une ancienne configuration

Les anciennes clés `pages` et leurs catégories sont reprises lorsqu’aucun état récent n’existe. Elles sont conservées ; les nouvelles modifications utilisent `evportal.state.v2`. Les anciennes adresses connues sont actualisées sans remplacer les noms et destinations personnalisés. Les services partagés sont regroupés sans perdre leurs favoris et compteurs.

Les catégories anciennes dépassant la limite de création de cinq, ou ayant un nom plus long, sont conservées. Les sauvegardes valides restent limitées à 50 catégories et 5 000 raccourcis. Les compteurs absents sont initialisés à zéro. Un thème absent devient sombre ; les choix clair et sombre sont conservés. L’ancien choix de pays n’a plus d’effet et ne supprime aucun raccourci.

Les fichiers historiques `{ "pages": ["cinema"], "cinema": [...] }` et les dictionnaires de catégories restent importables. Le format actuel exporté utilise `version: 2`, les catégories, leurs icônes, les raccourcis, les appartenances `categoryIds`, l’ordre manuel, les favoris, les compteurs et le thème. Les URL importées doivent être HTTP ou HTTPS, sans identifiants dans l’adresse. La validation précède l’enregistrement et la restauration.

## Plein écran et données

À l’arrêt, le plein écran Tesla utilise la redirection YouTube historique : choisissez **Accéder au site** ou **Go to site** pour revenir au portail en mode Théâtre. Si la Tesla n’est pas reconnue, utilisez **Ouvrir le mode Théâtre Tesla** dans Paramètres. Sur un autre navigateur, EvPortal utilise l’API Fullscreen lorsqu’elle est disponible.

Ce mécanisme dépend du logiciel du véhicule et de YouTube ; il ne constitue pas une API officielle Tesla. Les captures du projet montrent l’interface web, sans certifier un essai sur un véhicule. Un lien accessible ne garantit pas la connexion au compte ni la lecture multimédia. Consultez le [manuel Tesla](https://www.tesla.com/ownersmanual/modely/fr_fr/GUID-79A49D40-A028-435B-A7F6-8E48846AB9E9.html) correspondant à votre véhicule.

Les données sont séparées dans le stockage du navigateur :

| Clé | Contenu |
| --- | --- |
| `evportal.state.v2` | Configuration active : raccourcis, catégories, ordre, favoris, compteurs et thème |
| `evportal.preferences.v1` | Réglages d’affichage, accueil et catégories visibles |
| `evportal.language.v1` | Préférence de langue |
| `evportal.backups.v1` | Instantanés de la bibliothèque locale |
| `evportal.telegraph.v1` | Informations du compte Telegra.ph, séparées des sauvegardes |

EvPortal n’intègre pas d’analyse d’audience. Les logos et polices sont servis avec le portail. Telegra.ph est contacté lors d’actions explicites ; le relais traite les transferts QR chiffrés. Les services visités et l’hébergeur appliquent leurs propres politiques. Un stockage bloqué ou illisible reste préservé et l’application indique lorsque les modifications ne peuvent être conservées.
