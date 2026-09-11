# Drapeaux Unicode locaux

`evportal-flags.woff2` et son secours `evportal-flags.ttf` sont un sous-ensemble
couleur de **Noto Color Emoji**, renommé **EVPortal Flag Emoji**. Ils affichent les
séquences Unicode conservées dans le sélecteur de langue : 🇬🇧 🇫🇷 🇪🇸 🇩🇪 🇮🇹 🇷🇺 🇸🇦 🇵🇹.
Les caractères restent du texte ; aucune image SVG ne les remplace.

La police contient 21 glyphes : les 12 lettres régionales nécessaires, les 8
ligatures de drapeaux et `.notdef`. Les tables `GSUB`, `CBDT` et `CBLC` sont
conservées. Les autres combinaisons de pays ne font pas partie de ce sous-ensemble.
Il faut conserver chaque paire de caractères dans le même élément et ne pas
désactiver les ligatures ni ajouter d'espacement entre ses caractères.

## Provenance et licence

- Dépôt officiel : [googlefonts/noto-emoji](https://github.com/googlefonts/noto-emoji).
- Commit épinglé : `8998f5dd683424a73e2314a8c1f1e359c19e8742`.
- Source : [fonts/NotoColorEmoji.ttf](https://github.com/googlefonts/noto-emoji/blob/8998f5dd683424a73e2314a8c1f1e359c19e8742/fonts/NotoColorEmoji.ttf).
- Licence source : [fonts/LICENSE](https://github.com/googlefonts/noto-emoji/blob/8998f5dd683424a73e2314a8c1f1e359c19e8742/fonts/LICENSE), recopiée sans modification dans [OFL-NotoEmoji.txt](OFL-NotoEmoji.txt).
- Licence du sous-ensemble : SIL Open Font License 1.1. Les notices intégrées à la
  police sont conservées ; son nom de famille a été changé pour distinguer cette
  version modifiée.

| Fichier | Octets | SHA-256 |
| --- | ---: | --- |
| Source NotoColorEmoji.ttf | 10 673 480 | `72a635cb3d2f3524c51620cdde406b217204e8a6a06c6a096ff8ed4b5fd6e27b` |
| evportal-flags.woff2 | 30 016 | `9d126912d1c2deb14fb6a8c1806ac272bf50bd5f756929c9601c48669921b80a` |
| evportal-flags.ttf | 34 784 | `daabc2359932eccdf051a9ba7bf9f11a25fef290f7636aa4497a552410908e72` |
| OFL-NotoEmoji.txt | 4 301 | `6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2` |

## Intégration et compatibilité

Exemple depuis `css/styles.css` :

```css
@font-face {
  font-family: "EVPortal Flag Emoji";
  src: url("../fonts/evportal-flags.woff2") format("woff2"),
       url("../fonts/evportal-flags.ttf") format("truetype");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  unicode-range: U+1F1E6-1F1FF;
}
```

Placer cette famille avant les polices système pour les éléments qui portent les
drapeaux. `unicode-range` réserve cette police aux caractères régionaux ; les noms
des langues continuent à employer la police de l'interface. Conserver les polices
emoji système en secours.

Noto documente son format couleur CBDT/CBLC comme compatible avec Chrome/Chromium.
La disponibilité dépend du moteur et de la plateforme : le secours TTF change le
conteneur, pas ce format couleur. Cette police ne constitue donc pas une garantie
de compatibilité avec toutes les versions de WebKit ou du navigateur Tesla.
Les séquences, couleurs et dimensions doivent également être vérifiées dans le
véhicule. [Documentation Noto](https://github.com/googlefonts/noto-emoji#using-notocoloremoji).

## Régénérer

Depuis la racine du projet, utiliser un environnement Python temporaire ; aucune
dépendance de production ni requête vers Google Fonts n'est nécessaire au chargement
du portail. Le sous-ensemble désactive l'expansion automatique des ligatures après
avoir explicitement retenu les huit glyphes façonnés par HarfBuzz. Cette méthode
conserve les substitutions utiles sans inclure tous les pays formables avec les
mêmes lettres. [Documentation fontTools](https://fonttools.readthedocs.io/en/latest/subset/index.html).

```sh
python3 -m venv /tmp/evportal-flags-build
/tmp/evportal-flags-build/bin/pip install fonttools==4.65.0 brotli==1.2.0 uharfbuzz==0.56.1
/tmp/evportal-flags-build/bin/python - <<'PY'
from pathlib import Path
from urllib.request import urlopen
from io import BytesIO
import hashlib
import uharfbuzz as hb
from fontTools import subset
from fontTools.ttLib import TTFont

commit = '8998f5dd683424a73e2314a8c1f1e359c19e8742'
base = f'https://raw.githubusercontent.com/googlefonts/noto-emoji/{commit}/fonts/'
data = urlopen(base + 'NotoColorEmoji.ttf', timeout=60).read()
assert hashlib.sha256(data).hexdigest() == '72a635cb3d2f3524c51620cdde406b217204e8a6a06c6a096ff8ed4b5fd6e27b'
license_data = urlopen(base + 'LICENSE', timeout=60).read()
assert hashlib.sha256(license_data).hexdigest() == '6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2'

flags = ['🇬🇧', '🇫🇷', '🇪🇸', '🇩🇪', '🇮🇹', '🇷🇺', '🇸🇦', '🇵🇹']
font = TTFont(BytesIO(data), recalcTimestamp=False)
shaper = hb.Font(hb.Face(data))
glyphs = set()
for flag in flags:
    buffer = hb.Buffer()
    buffer.add_str(flag)
    buffer.guess_segment_properties()
    hb.shape(shaper, buffer)
    ids = [info.codepoint for info in buffer.glyph_infos]
    assert len(ids) == 1 and ids[0] != 0, (flag, ids)
    glyphs.add(font.getGlyphName(ids[0]))

options = subset.Options()
options.layout_features = ['*']
options.layout_closure = False
options.name_IDs = ['*']
options.name_languages = ['*']
options.glyph_names = True
subsetter = subset.Subsetter(options=options)
subsetter.populate(text=''.join(flags), glyphs=glyphs)
subsetter.subset(font)
names = {
    1: 'EVPortal Flag Emoji', 2: 'Regular',
    3: 'EVPortal Flag Emoji subset 8998f5dd',
    4: 'EVPortal Flag Emoji', 6: 'EVPortalFlagEmoji',
    16: 'EVPortal Flag Emoji', 17: 'Regular',
}
for name_id, value in names.items():
    font['name'].setName(value, name_id, 3, 1, 0x409)
    font['name'].setName(value, name_id, 1, 0, 0)

target = Path('fonts')
target.mkdir(exist_ok=True)
font.save(target / 'evportal-flags.ttf')
font.flavor = 'woff2'
font.save(target / 'evportal-flags.woff2')
(target / 'OFL-NotoEmoji.txt').write_bytes(license_data)

# Vérifier aussi les ligatures après décompression du fichier distribué.
check = TTFont(target / 'evportal-flags.woff2', recalcTimestamp=False)
assert all(table in check for table in ['CBDT', 'CBLC', 'GSUB'])
assert len(check.getGlyphOrder()) == 21
check.flavor = None
decoded = BytesIO()
check.save(decoded)
shaper = hb.Font(hb.Face(decoded.getvalue()))
for flag in flags:
    buffer = hb.Buffer()
    buffer.add_str(flag)
    buffer.guess_segment_properties()
    hb.shape(shaper, buffer)
    ids = [info.codepoint for info in buffer.glyph_infos]
    assert len(ids) == 1 and ids[0] != 0, (flag, ids)
print('8 drapeaux vérifiés ; couleur et ligatures conservées.')
PY
```
