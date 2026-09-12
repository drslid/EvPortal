# Référencement multilingue d’EvPortal

EvPortal fournit de vraies pages HTML dans huit langues. Le tableau conserve son interface épurée ; le guide présente le fonctionnement du portail, ses raccourcis, les sauvegardes et les limites du navigateur Tesla. Les pages sont préparées pour être explorées et indexées, sans présumer de leur présence ni de leur position dans les résultats de recherche.

## Adresses publiques et langues

L’adresse de référence reste **https://drslid.github.io/EvPortal/**. Le générateur produit 18 pages : les deux adresses historiques à la racine du projet, huit tableaux traduits et huit guides traduits. Les chemins ci-dessous sont relatifs à cette adresse.

| Version | Tableau | Guide |
| --- | --- | --- |
| Historique, `x-default` | `./` | `aide.html` |
| Anglais | `en/` | `en/aide.html` |
| Français | `fr/` | `fr/aide.html` |
| Espagnol | `es/` | `es/aide.html` |
| Allemand | `de/` | `de/aide.html` |
| Italien | `it/` | `it/aide.html` |
| Russe | `ru/` | `ru/aide.html` |
| Arabe | `ar/` | `ar/aide.html` |
| Portugais | `pt/` | `pt/aide.html` |

Chaque page possède une URL canonique propre et neuf liens `hreflang` réciproques : les huit langues et l’adresse historique en `x-default`. Les tableaux désignent les autres tableaux ; les guides désignent les autres guides. Le [sitemap du projet](https://drslid.github.io/EvPortal/sitemap.xml) répertorie les 18 URL publiques sans paramètres de sauvegarde. Les annotations linguistiques sont dans le HTML, ce qui correspond à l’une des méthodes décrites par [Google pour les versions localisées](https://developers.google.com/search/docs/specialty/international/localized-versions).

Sur une adresse comme `de/`, la langue du chemin prévaut sur celle du navigateur et sur une préférence enregistrée. Aucune redirection automatique ne change cette adresse au chargement. Le sélecteur permet de naviguer explicitement vers une autre langue ; les raccourcis et la bibliothèque locale restent conservés. Les deux adresses historiques servent de repli : leur HTML initial est français, puis leur interface conserve la sélection de langue habituelle. Le guide propose aussi des liens HTML vers les huit versions. Ce choix suit les recommandations de [Google pour les sites multilingues](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites).

## Contenu présent dans le HTML

Les titres, descriptions, URL canoniques, métadonnées Open Graph et Twitter sont écrits pendant la génération. Le guide traduit reste lisible sans JavaScript. L’application utilise toujours JavaScript pour afficher et personnaliser les raccourcis ; son référencement ne dépend plus d’une traduction exécutée uniquement dans le navigateur. Google décrit séparément les étapes d’exploration, de rendu et d’indexation dans sa [documentation sur le référencement JavaScript](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).

Le JSON-LD décrit une `WebApplication` gratuite pour le tableau, et une `WebPage` avec fil d’Ariane pour le guide. Il ne contient ni note, ni avis, ni nombre d’utilisateurs inventé. Il n’annonce aucune compatibilité universelle avec les services externes. Ces données descriptives ne constituent pas une promesse d’affichage enrichi dans un moteur de recherche.

Le tableau relie aussi son guide traduit avec la propriété [`softwareHelp`](https://schema.org/softwareHelp). Le balisage descriptif reste volontairement distinct d’une promesse de résultat enrichi : [Google exige notamment un avis ou une note pour son résultat enrichi d’application](https://developers.google.com/search/docs/appearance/structured-data/software-app), données dont EvPortal ne dispose pas. Les titres décrivent la page dans sa langue, sans accumulation de mots-clés, conformément aux [recommandations Google sur les titres](https://developers.google.com/search/docs/appearance/title-link).

Les textes supplémentaires restent dans l’aide : démarrage dans le navigateur Tesla à l’arrêt, accès aux services pendant une recharge, gratuité, transfert avec le téléphone et absence de mode hors connexion. Ils distinguent **Ajouter**, qui conserve une sauvegarde, de **Restaurer**, qui remplace explicitement les raccourcis. Aucun paragraphe SEO supplémentaire n’encombre le tableau.

L’aide présente une capture réelle du portail dans un navigateur d’ordinateur, avec une sélection de démonstration en anglais. Son texte alternatif et sa légende sont traduits ; largeur et hauteur explicites réservent sa place, et son chargement différé évite de retarder le haut de page. L’illustration de partage est un fichier distinct. Les métadonnées sociales utilisent son format PNG et ses dimensions réellement lues dans le fichier, ainsi qu’un texte alternatif qui la décrit comme une illustration. Les propriétés d’image suivent le [protocole Open Graph](https://ogp.me/).

## Modifier et générer les pages

Les sources éditables sont `index.html` et `aide.html` à la racine du dépôt, ainsi que les dictionnaires `js/locales/*-{lang}.json`. Les familles `static`, `help` et `seo` contiennent notamment les titres, descriptions et textes du guide. Modifiez les annotations et la structure dans les pages sources ; modifiez les textes traduits dans les dictionnaires.

Après une modification des sources ou des traductions :

```bash
npm run build:seo
npm run check:seo
npm run test:seo
```

`build:seo` régénère d’abord le bundle des traductions, puis les pages HTML, le sitemap, `robots.txt` et l’empreinte `seo-release.json`. Il actualise aussi les métadonnées des deux pages sources en français. `check:seo` vérifie que les fichiers générés correspondent aux sources, sans les réécrire. `test:seo` exerce les adresses traduites avec et sans JavaScript, la priorité de langue, les métadonnées, les ressources et la conservation des raccourcis, sauvegardes et préférences d’apparence lors d’un changement de langue. Ce test utilise Chromium via Playwright.

Les fichiers `en/index.html`, `fr/aide.html` et leurs équivalents sont **générés : ne les modifiez pas directement**. Livrez les sources et leurs sorties régénérées ensemble ; GitHub Pages sert ces fichiers statiques. Cette génération ne modifie pas le Worker du relais QR.

Le workflow GitHub Actions `Site quality` vérifie les fichiers générés et exécute les tests unitaires à chaque pull request et chaque mise à jour de `main`. Il signale une traduction ou une page modifiée sans régénération.

La configuration SEO est centralisée dans [`seo.config.json`](../seo.config.json). Ses paramètres principaux sont :

```json
{
  "baseURL": "https://drslid.github.io/EvPortal/",
  "socialImage": "img/evportal-social.png",
  "verification": {
    "google": "",
    "bing": ""
  }
}
```

`baseURL` doit être une adresse HTTPS terminée par `/`. Elle alimente les URL SEO absolues. Un changement d’hébergement nécessite aussi de vérifier les adresses publiques utilisées par le partage, le manifeste et la configuration du relais ; ce fichier ne réalise pas à lui seul une migration du service.

`socialImage` désigne un PNG local dans `img/`. La génération refuse un fichier absent, un format incorrect ou des dimensions nulles. Régénérez après toute modification d’image, de script ou de CSS : l’empreinte de publication couvre aussi ces ressources. La section `indexNow.keyFile` référence le fichier public de preuve d’hébergement créé pour ce projet ; elle est décrite ci-dessous.

Les champs `verification.google` et `verification.bing` sont facultatifs et actuellement vides. Lorsqu’un code est fourni, sa valeur `content` seule permet de générer la balise `google-site-verification` ou `msvalidate.01`. La validation de propriété et la soumission du sitemap nécessitent l’accès au compte webmaster du propriétaire ; la génération des pages ne réalise pas ces opérations. Une propriété peut aussi avoir été validée par une autre méthode, indépendamment de ces champs.

## Particularité de robots.txt sur GitHub Pages

Le fichier `/EvPortal/robots.txt` est dans un sous-dossier. Il ne définit pas les règles de tout l’hôte `drslid.github.io` : les robots recherchent `/robots.txt` à la racine de l’hôte. Lors de la vérification accompagnant cette documentation, cette adresse renvoyait HTTP 404. Pour Google, ce statut signifie qu’aucune règle d’interdiction n’est disponible ; il ne bloque donc pas à lui seul l’exploration. Voir les [règles officielles concernant l’emplacement et les erreurs de robots.txt](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec).

Si la racine de l’hôte devient administrable, elle peut annoncer le sitemap du projet. La soumission directe dans les outils webmaster reste adaptée à cet hébergement en sous-dossier. Un fichier présent dans le dépôt et une soumission dans un compte webmaster sont deux opérations distinctes.

Le sous-dossier impose aussi une limite d’identité dans Google : le [nom de site](https://developers.google.com/search/docs/appearance/site-names) et le [favicon des résultats](https://developers.google.com/search/docs/appearance/favicon-in-search) se rattachent au domaine ou sous-domaine, pas à chaque projet hébergé sous un chemin. Les titres « EvPortal » et les icônes du navigateur restent utiles, mais un logo ou nom de résultat propre au seul sous-dossier ne peut pas être promis.

## Notifications IndexNow après publication

IndexNow accepte une clé hébergée dans un sous-dossier via `keyLocation`. Sa portée couvre alors les URL de ce sous-dossier. EvPortal utilise un fichier public `indexnow-…txt` à la racine du projet, référencé par `indexNow.keyFile`. La notification contient seulement les 18 URL canoniques présentes dans le sitemap. Aucune URL avec code de sauvegarde, paramètre, fragment QR ou chemin extérieur au projet n’est acceptée. Voir la [documentation officielle IndexNow, option 2](https://www.indexnow.org/documentation).

Le workflow [Notify search engines after Pages](../.github/workflows/indexnow.yml) se déclenche après une construction Pages réussie, ou manuellement. Il extrait la révision de cette construction et attend jusqu’à cinq minutes sa disponibilité. Avant le moindre envoi, le script contrôle l’empreinte de la publication, le fichier de preuve d’hébergement, le sitemap et le contenu exact des 18 pages publiées. Une révision ancienne, un fichier manquant ou une page différente bloque la notification. L’empreinte est calculée à partir des HTML et des ressources publiques JavaScript, CSS et images, sans horodatage inventé ; des changements locaux non régénérés sont également refusés.

Pour contrôler la préparation sans réseau, puis notifier après publication :

```bash
node scripts/notify-indexnow.mjs
node scripts/notify-indexnow.mjs --submit --wait=300
```

La première commande prépare uniquement la liste. La seconde vérifie le site public, puis adresse une seule requête au point d’entrée IndexNow. Une réponse HTTP 200 confirme la réception ; 202 signifie que la vérification de la clé reste en attente. Aucun de ces statuts ne prouve une indexation ni un classement. Un refus du service est signalé, sans soumissions répétées automatiques. Les journaux n’affichent ni la clé ni le contenu des pages.

Les tests automatisés utilisent des réponses simulées : ils contrôlent les exclusions d’URL, les révisions périmées, les fichiers absents, l’identité des contenus et les réponses 200/202/429. La réussite d’une notification réelle doit être constatée dans le journal du workflow ou de la commande après le déploiement. Ce parcours ne remplace pas la validation d’une propriété Search Console ou Bing Webmaster Tools.

## Démarches après publication

1. **Valider Google Search Console.** Ajouter une propriété de type « Préfixe de l’URL » pour `https://drslid.github.io/EvPortal/`. Choisir la méthode par balise HTML, renseigner le code dans `verification.google`, régénérer et publier, puis lancer la validation dans Search Console. La propriété de préfixe peut inclure ce chemin, sans revendiquer tout l’hôte GitHub. [Propriété de préfixe](https://support.google.com/webmasters/answer/10432366?hl=fr) et [validation de propriété](https://support.google.com/webmasters/answer/9008080?hl=fr).
2. **Soumettre le sitemap et inspecter quelques pages.** Soumettre `https://drslid.github.io/EvPortal/sitemap.xml`, puis contrôler notamment les tableaux et guides français et anglais. Vérifier la version explorée et la canonique choisie. Un sitemap facilite la découverte mais ne garantit pas l’indexation. [Créer et soumettre un sitemap Google](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
3. **Configurer Bing Webmaster Tools.** Ajouter le site et vérifier sa propriété, par exemple avec le code de balise HTML dans `verification.bing`, puis soumettre le même sitemap. Une propriété Google déjà validée peut également être importée lorsque l’outil le propose. [Ajouter et valider un site dans Bing](https://www.bing.com/webmasters/help/add-and-verify-site-12184f8b) et [guide officiel Bing](https://blogs.bing.com/webmaster/June-2025/Start-Using-Bing-Webmaster-Tools-to-Improve-Your-Site-Visibility).
4. **Mesurer avant d’élargir.** Relever les requêtes, impressions, clics et taux de clics sur 28 jours, puis comparer avec les 28 jours précédents quand les données sont disponibles. Filtrer par page et par pays pour repérer les guides utiles et les descriptions à améliorer. Ces mesures ne préjugent pas d’un gain de trafic. [Rapport de performances Search Console](https://support.google.com/webmasters/answer/7576553?hl=fr).

## Pistes d’acquisition à évaluer

- Travailler les intentions réellement couvertes : « portail navigateur Tesla », « raccourcis Tesla » ou « sauvegarder favoris Tesla » en français ; « Tesla browser dashboard », « Tesla browser shortcuts » ou « Tesla bookmarks backup » en anglais. Ce sont des pistes de requêtes, sans volumes de recherche mesurés.
- Compléter le guide à partir de questions et de tests réels sur véhicule : une procédure illustrée courte vaut mieux que plusieurs pages presque identiques.
- Présenter le projet dans des communautés Tesla pertinentes avec un exemple original, ses limites et le lien du guide dans la bonne langue. Choisir des espaces où ce partage est autorisé et utile. Aucune publication ou prise de contact n’a été effectuée dans cette intervention.
- Étudier un nom de domaine propre si une adresse plus courte facilite la mémorisation et le partage. La disponibilité et le prix restent à vérifier ; aucun domaine n’a été réservé. Prévoir la migration des URL et des données du navigateur avant tout changement d’origine.
