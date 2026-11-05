# Plein écran Tesla : vérification du 5 novembre 2026

Le manuel européen Model 3 2024+ consulté affiche la version 2026.38.3. Il décrit
le Théâtre pour les services vidéo à l'arrêt, avec Wi-Fi ou connexion Premium.
Il ne documente pas d'API web pour placer un site arbitraire dans ce conteneur.

Sources officielles : [manuel et version](https://www.tesla.com/ownersmanual/model3/fr_fr/),
[Théâtre](https://www.tesla.com/ownersmanual/model3/fr_fr/GUID-79A49D40-A028-435B-A7F6-8E48846AB9E9.html).

## Méthode encore utilisée par les portails

Des implémentations récentes emploient toujours
`https://www.youtube.com/redirect?q=URL_ENCODEE` dans la fenêtre courante. Le
passage par YouTube demande généralement de choisir « Go to site ». La page est
ensuite affichée dans le conteneur du Théâtre, sans barre d'adresse, lorsque le
logiciel du véhicule conserve ce comportement.

- [Tesdash : construction de l'URL](https://github.com/crstian19/tesdash/blob/main/src/lib/url.ts),
  projet dont le dernier commit observé était du 4 novembre 2026.
- [Front Row : fonctionnement, retour au mode normal et réserves](https://github.com/alexluckett/tesla-front-row).
- [Tescast : description par son développeur, mise à jour du 30 octobre 2026](https://tescast.app/en/blog/tesla-browser-full-screen-video).

Ces sources prouvent une utilisation actuelle de la méthode. Elles ne garantissent
pas son fonctionnement sur toutes les Highland, toutes les versions ou tous les services.
Les observations d'ouverture automatique de certains services ne sont pas une API
officielle ni une liste de compatibilité certifiée.

## Comportement d'EvPortal

`js/tesla.js` demande cette navigation sur Tesla et conserve le chemin du portail,
ses paramètres publics et sa langue. Les fragments de transfert et paramètres
privés sont retirés avant la construction du lien tiers. Sur un navigateur ordinaire,
le bouton utilise l'API web `requestFullscreen()`.

L'[API web standard](https://fullscreen.spec.whatwg.org/) et le conteneur Théâtre
sont distincts. Le résultat `theater` de notre helper signifie qu'une navigation
a été demandée, pas que la voiture a confirmé son plein écran. L'existence de
`document.fullscreenElement` ne suffit pas à détecter le conteneur Tesla.

Le mécanisme existant est conservé. Il reste à vérifier dans la Highland :

1. Ouvrir le portail, lancer le bouton et confirmer l'étape YouTube.
2. Vérifier la disparition de la barre d'adresse et la conservation des favoris.
3. Ouvrir plusieurs raccourcis : leurs liens `_blank` pourraient changer de vue.
   Certains portails de référence naviguent dans la même fenêtre.
4. Vérifier le retour et la fermeture du mode Théâtre.

La « vue Stationnement en plein écran » de l'interface Tesla est encore une autre
fonction : elle ne prouve pas qu'une page web dispose du plein écran.
Aucun essai dans une vraie Tesla n'a été effectué pour cette vérification.
