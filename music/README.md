# Les chemins de la couronne

Thème instrumental original pour **Les Quatre Couronnes**, composé pour cette version du jeu et synthétisé depuis MIDI avec **FluidSynth 2.6.0** et la banque locale **MuseScore General HQ**. Aucun enregistrement musical extérieur ni voix.

- Ré majeur, 120 BPM, 4/4, 32 mesures et **64 secondes par boucle**.
- Carte : flûte, clarinette, harpe, guitare nylon, cordes pincées, contrebasse et percussions légères.
- Victoire en vue : la même mélodie et les mêmes accords, avec trompette, violons, cors et percussions plus présentes.
- `les-chemins-de-la-couronne.ogg` : écoute de 128 secondes, version normale puis transition de deux secondes vers la victoire à 1:04.
- `les-chemins-de-la-couronne.mid` : partition éditable des deux versions, douze pistes, repères de sections. Les deux MIDI séparés correspondent aux boucles du jeu.
- `../public/audio/theme-normal.ogg` et `theme-victoire.ogg` : boucles utilisées par le jeu, Vorbis stéréo 44,1 kHz, sans fondu de fin.

## Comportement dans le jeu

La musique démarre avec une partie et un geste de l’utilisateur. Les deux arrangements restent synchronisés ; leur mélange change sur une limite de mesure avec une transition de deux secondes. Le tempo musical reste identique quelle que soit la vitesse de simulation, et la musique continue pendant une pause ou la préparation d’un ordre.

La variation de victoire arrive lorsqu’il reste un seul royaume ennemi vivant, que le joueur possède au moins quatre maisons et 500 PV, et que l’ennemi possède au plus 30 % de ses maisons (ou deux maisons) et 40 % de ses PV totaux, roi compris. Le seuil de retour est volontairement plus large (50 % / 65 %) pour éviter des changements incessants. Une victoire définitive conserve cette variation. Le bouton ♫ coupe/rétablit la musique ; le menu Conseil règle le volume. Ces préférences sont locales, indépendantes des sauvegardes de parties.

## Reproduction

La SoundFont personnelle n’est pas copiée dans ce dépôt. Dépendances : Python 3, NumPy, FluidSynth et ffmpeg.

```sh
mkdir -p qa/music public/audio
python3 scripts/compose-map-theme.py
```

Rendre les MIDI de travail (trois répétitions) avec toutes les options **avant** les fichiers, en remplaçant le chemin de la SoundFont :

```sh
fluidsynth -ni -g 0.55 -R 1 -C 1 -o synth.reverb.room-size=0.35 -o synth.reverb.damp=0.45 -o synth.reverb.level=0.23 -o synth.chorus.level=0.10 -F qa/music/normal-render.wav -r 44100 /chemin/MuseScore_General_HQ.sf2 qa/music/theme-normal-render.mid
fluidsynth -ni -g 0.55 -R 1 -C 1 -o synth.reverb.room-size=0.35 -o synth.reverb.damp=0.45 -o synth.reverb.level=0.23 -o synth.chorus.level=0.10 -F qa/music/victory-render.wav -r 44100 /chemin/MuseScore_General_HQ.sf2 qa/music/theme-victoire-render.mid
python3 scripts/render-map-theme.py
```

Le montage prélève la répétition centrale, avec les queues de réverbération de la précédente. Un raccord de 40 ms conserve l’attaque du cycle suivant, sans fondu vers le silence. Les rapports JSON vérifient l’absence de chevauchements MIDI de même hauteur, les durées, les niveaux, les raccords et l’absence d’écrêtage des OGG décodés.
