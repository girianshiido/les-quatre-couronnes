# Musiques des Quatre Couronnes

Compositions instrumentales originales, écrites en MIDI puis synthétisées avec **FluidSynth 2.6.0** et la banque personnelle **MuseScore General HQ**. Aucun enregistrement extérieur ni voix. La SoundFont n’est pas redistribuée.

## Cinq ambiances de carte

Chaque série de cinq niveaux possède sa musique. Les mélodies, les instruments, le rythme et les accords changent entre les décors. Chaque musique comporte un arrangement normal et un arrangement d’essor, lorsque le dernier ennemi est affaibli. Les nouvelles variations privilégient les instruments propres à chaque décor ; le premier décor reprend désormais le thème original et sa variante avec cuivres.

| Décor | Normal / victoire proche | Couleurs musicales | Mesure, tempo | Boucle |
| --- | --- | --- | --- | --- |
| Forêt et montagne | Les chemins de la couronne / variation de victoire originale | Flûte, clarinette, harpe, guitare et cordes ; cuivres dans la variante | 4/4, noire = 120 | 64 s |
| Désert et palmeraies | Sept pas dans les dunes / Les caravanes du soleil | Oud évoqué par une guitare nylon, sitar, dulcimer, flûte et peaux ; mode phrygien dominant | 7/8, noire = 120 | 42 s |
| Neige | Les flocons voyageurs / La danse des aurores | Valse de célesta, harpe, flûte, glockenspiel et cordes | 3/4, noire = 96 | 45 s |
| Marais et delta | Au fil des marées / La ronde du delta | Marimba, cor anglais, vibraphone, basse et rythme ondulant | 4/4, noire = 80 | 48 s |
| Forêt cristalline | Le jardin des prismes / Les cinq éclats | Boîte à musique, célesta, nappes et cristaux | 5/4, noire = 120 | 40 s |

Les cartes forêt/montagne (1 à 5) utilisent de nouveau `theme-normal.mid` et `theme-victoire.mid`, avec leurs OGG originaux dans `../public/audio/`. L’écoute `les-chemins-de-la-couronne.ogg` enchaîne ces deux arrangements. Ces fichiers sont repris à l’identique, sans nouvelle synthèse.

Les huit partitions des quatre décors suivants sont `carte-{desert,neige,marais,cristal}-{normal,essor}.mid`, avec les OGG correspondants dans `../public/audio/`. La nouvelle proposition forêt « Sous les branches / La futaie en marche » reste conservée ici en MIDI et OGG `carte-foret-{normal,essor}`, pour une éventuelle réutilisation ; elle n’est plus téléchargée par le jeu.

## Musiques d’écran

| Écran | Morceau | Arrangement | Boucle |
| --- | --- | --- | --- |
| Titre | Sous les quatre bannières | Piano, clarinette, harpe, cordes, cor discret | 60 s, 96 BPM |
| Niveau gagné | Une seule couronne | Fanfare de trompette, violons, cors, timbales et percussions | 30 s, 128 BPM |
| Niveau perdu | Les braises du royaume | Piano, violoncelle, harpe et cordes | 36 s, 80 BPM |

Ces trois morceaux et leurs MIDI sont conservés à l’identique. **La même fanfare termine tous les niveaux**, quel que soit le décor. Elle remplace complètement l’arrangement d’essor de la carte. Fichiers : `ecran-{titre,victoire-finale,defaite}.mid` et les OGG correspondants dans `../public/audio/`.

## Comportement

Le titre démarre au premier geste utilisateur. Ouvrir, charger ou recommencer une carte éteint le titre : la musique de carte attend le premier appui sur ▶. Après le lancement, elle continue pendant les pauses et la planification. La vitesse du jeu ne change pas le tempo.

La victoire proche demande un seul royaume ennemi vivant, au moins quatre maisons et 500 PV pour le joueur, et un ennemi à au plus 30 % de ses maisons (ou deux maisons) et 40 % de ses PV. Les seuils de retour sont 50 % / 65 % pour éviter les oscillations. Les deux arrangements d’un décor partagent exactement la même durée, le même tempo et les mêmes accords ; ils restent synchronisés et se mélangent pendant une mesure, à la prochaine limite de mesure. Changer d’écran utilise un fondu de 0,4 s.

Volume, mode muet et suspension lorsque l’onglet est masqué sont communs à toutes les musiques. Les fichiers compressés peuvent être réutilisés, mais seuls les buffers décodés de la scène courante sont conservés. Une réponse tardive d’un ancien décor ne peut pas remplacer la musique actuelle. Les treize OGG utilisés par le jeu font partie du cache hors connexion.

## Reproduire les cartes

Python 3, NumPy, FluidSynth et ffmpeg sont nécessaires. Valider les MIDI avant le rendu :

```sh
python3 scripts/compose-biome-music.py
python3 scripts/validate-music-midi.py
python3 scripts/render-biome-music.py /chemin/MuseScore_General_HQ.sf2
```

Le rendu effectue trois répétitions de chaque morceau et prélève la répétition centrale avec les réverbérations déjà établies. Un raccord de 40 ms conserve l’attaque du cycle suivant, sans fondu vers le silence. Deux rendus au maximum sont lancés simultanément. Le rendu de la nouvelle proposition forêt est dirigé vers les archives dans `music/`, afin de préserver la paire originale utilisée en jeu. Les rapports `biome-midi-validation.json`, `serialized-midi-validation.json` et `biome-audio-validation.json` vérifient les notes réellement écrites, les durées exactes, la stéréo 44,1 kHz, les niveaux et l’absence d’écrêtage ou de passage silencieux de 50 ms dans les OGG décodés.

Les trois musiques d’écran restent reproductibles avec `compose-screen-music.py`, `validate-music-midi.py`, puis FluidSynth sur les MIDI de travail dans `qa/screen-music/` et `render-screen-music.py`. Toutes les options FluidSynth doivent précéder la SoundFont et le MIDI. Les scripts partagent le petit écrivain MIDI `midi_score.py`, sans dépendance musicale externe.
