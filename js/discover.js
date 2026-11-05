/* This presentation stores no preferences and makes no network requests. */
(function () {
    'use strict';
    const copy = {
        fr: {
            title: 'Découvrir EvPortal — Vos pauses, à votre façon',
            description: 'Vos favoris, vos contenus, vos pauses. Découvrez EvPortal, un portail personnalisable à ouvrir dans le navigateur de votre voiture.',
            skip: 'Aller au contenu', preview: 'Gratuit · Sans installation · Disponible en huit langues',
            eyebrow: 'LE PORTAIL DE VOS PAUSES', headline1: 'Vos pauses,', headline2: 'à votre façon.',
            intro: 'Radio, météo, jeux, sites préférés. Retrouvez ce qui vous plaît sur un écran que vous organisez vous-même.',
            try: 'Essayer EvPortal', howLink: 'Comment commencer', heroNote: 'Dans le navigateur de votre voiture. Sans installation.',
            previewAlt: 'Aperçu illustré : un écran EvPortal avec des favoris et des raccourcis',
            myPause: 'Ma pause', favorites: 'Favoris', music: 'Musique', weather: 'Météo', games: 'Jeux', myLink: 'Mon lien', yourSpace: 'Votre espace, vos favoris', illustration: 'Aperçu illustré de l’interface',
            madeFor: 'PENSÉ POUR LE TEMPS D’UNE PAUSE', valueTitle: 'L’essentiel, à portée de main.',
            feature1Title: 'Votre écran. Vos habitudes.', feature1Body: 'Ajoutez vos liens, classez les raccourcis et gardez vos favoris devant vous. Ajustez leur taille et masquez les catégories inutiles.',
            feature2Title: 'Vos langues, votre catalogue.', feature2Body: 'Choisissez la langue de l’interface, puis le pays et les langues de vos contenus. Des suggestions adaptées, avec vos favoris toujours conservés.',
            feature3Title: 'Une configuration à garder.', feature3Body: 'Créez une sauvegarde, exportez une copie ou utilisez les options de transfert entre appareils. Vérifiez le contenu avant de le restaurer.',
            startEyebrow: 'DU TÉLÉPHONE À LA VOITURE', startTitle: 'Préparez. Ouvrez. Profitez.',
            step1Title: 'Sur votre téléphone', step1Body: 'Ouvrez EvPortal et préparez vos favoris. Une adresse web suffit, sans application à installer.',
            step2Title: 'Dans votre voiture, à l’arrêt', step2Body: 'Ouvrez le site dans le navigateur et ajoutez-le aux favoris. Si vous avez préparé une configuration, utilisez les options de transfert ou importez votre sauvegarde.',
            step3Title: 'Faites-en votre espace', step3Body: 'Choisissez vos contenus, organisez votre écran et gardez une copie de votre configuration.',
            guide: 'Consulter le guide pas à pas', syncBadge: 'EN PRÉPARATION', syncTitle: 'Retrouver ses raccourcis entre appareils.', syncBody: 'La sauvegarde synchronisée chiffrée est en préparation et n’est pas encore activée sur le site. Les transferts QR, sauvegardes locales et exports restent disponibles.',
            lastEyebrow: 'VOTRE PROCHAINE PAUSE COMMENCE ICI', lastTitle: 'Un portail qui vous ressemble.', independent: 'Projet indépendant, non affilié à Tesla.',
            limits: 'Utilisez les médias à l’arrêt. L’accès et la lecture dépendent du modèle, du logiciel, du pays et du service. Une connexion et parfois un abonnement sont nécessaires.', help: 'Guide et aide'
        },
        en: {
            title: 'Discover EvPortal — Your break, your way',
            description: 'Your favorites, your content, your break. Discover EvPortal, a customizable portal for your car’s browser.',
            skip: 'Skip to content', preview: 'Free · No installation · Available in eight languages',
            eyebrow: 'A HOME FOR YOUR BREAK', headline1: 'Your break,', headline2: 'your way.',
            intro: 'Radio, weather, games and favorite websites. Keep the things you enjoy on a screen you make your own.',
            try: 'Try EvPortal', howLink: 'Getting started', heroNote: 'In your car’s browser. No installation.',
            previewAlt: 'Illustrated preview: an EvPortal screen with favorites and shortcuts',
            myPause: 'My break', favorites: 'Favorites', music: 'Music', weather: 'Weather', games: 'Games', myLink: 'My link', yourSpace: 'Your space, your favorites', illustration: 'Illustrated interface preview',
            madeFor: 'MADE FOR A MOMENT TO YOURSELF', valueTitle: 'The essentials, within reach.',
            feature1Title: 'Your screen. Your routine.', feature1Body: 'Add your links, arrange your shortcuts and keep your favorites close. Adjust their size and hide categories you don’t need.',
            feature2Title: 'Your languages, your catalogue.', feature2Body: 'Choose your interface language, then the country and languages for your content. Get relevant suggestions while keeping your favorites.',
            feature3Title: 'A setup worth keeping.', feature3Body: 'Create a backup, export a copy or use the transfer options between devices. Review the contents before restoring them.',
            startEyebrow: 'FROM YOUR PHONE TO YOUR CAR', startTitle: 'Set up. Open. Enjoy.',
            step1Title: 'On your phone', step1Body: 'Open EvPortal and prepare your favorites. All you need is a web address, with no app to install.',
            step2Title: 'In your car, while parked', step2Body: 'Open the website in the browser and bookmark it. If you have prepared a setup, use the transfer options or import your backup.',
            step3Title: 'Make it your space', step3Body: 'Choose your content, organize your screen and keep a copy of your setup.',
            guide: 'Read the step-by-step guide', syncBadge: 'IN DEVELOPMENT', syncTitle: 'Your shortcuts, across devices.', syncBody: 'Encrypted backup sync is in development and is not enabled on the website yet. QR transfers, local backups and exports remain available.',
            lastEyebrow: 'YOUR NEXT BREAK STARTS HERE', lastTitle: 'A portal that feels like you.', independent: 'An independent project, not affiliated with Tesla.',
            limits: 'Use media while parked. Access and playback depend on the model, software, country and service. A connection and sometimes a subscription are required.', help: 'Guide and help'
        }
    };
    function showLanguage(language, updateUrl) {
        language = language === 'en' ? 'en' : 'fr';
        const selected = copy[language];
        document.documentElement.lang = language;
        document.title = selected.title;
        document.querySelector('meta[name="description"]').setAttribute('content', selected.description);
        document.querySelectorAll('[data-copy]').forEach(function (node) { node.textContent = selected[node.dataset.copy]; });
        document.querySelectorAll('[data-copy-aria]').forEach(function (node) { node.setAttribute('aria-label', selected[node.dataset.copyAria]); });
        document.querySelectorAll('[data-language]').forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.language === language)); });
        document.querySelectorAll('[data-guide-link]').forEach(function (link) { link.setAttribute('href', './' + language + '/aide.html'); });
        if (updateUrl) {
            const url = new URL(window.location.href);
            url.searchParams.set('lang', language);
            window.history.replaceState(null, '', url);
        }
    }
    document.querySelectorAll('[data-language]').forEach(function (button) { button.addEventListener('click', function () { showLanguage(button.dataset.language, true); }); });
    const requested = new URLSearchParams(window.location.search).get('lang');
    showLanguage(requested === 'en' || requested === 'fr' ? requested : (navigator.language || '').toLowerCase().startsWith('fr') ? 'fr' : 'en', false);
}());
