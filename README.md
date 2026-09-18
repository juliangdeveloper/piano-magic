# piano-magic

Combate con piano (un jefe). Página estática para GitHub Pages, sin CDN ni red en runtime salvo el JSON del chart (mismo origen).

La detección de micrófono/pitch vive en el repo aparte [`piano-game`](https://github.com/juliangdeveloper/piano-game). **Este juego no depende de él** (ni CDN, ni fetch). M0 usa teclado QWERTY + Web MIDI.

Versión **0.1.0** (M0).

## Jugar

Jefe M0: **Raindrops, Thunder**. HP jugador 15 / jefe 20. BPM 60, sala C.

1. Un compás de **escucha** (sin daño; drone C / toca libre).
2. Bucle **4 Defiende + 1 Agujero** hasta KO.
3. En Defiende, sigue las notas de la cinta (`A` `S` `D` = C4 D4 E4).
4. En el **agujero**, silencio. Tocar duele.

Hechizos v1: mayor → ataque, menor → buff, pentatónica → cura. El elemento y el multiplicador salen del grado / círculo de quintas contra la sala.

```
python3 -m http.server 8000
# abrir http://localhost:8000
```

`file://` no carga el JSON del chart; hace falta un servidor estático.

## Tests

```
npm test
```

Corre `test/spell.test.js`, `test/chart.test.js` y `test/director.test.js` (Node, sin `npm install`).

## Estructura

```
index.html                 UI (español)
css/ui.css
js/instrument/translator.js  NoteOn/Off → beats (stub M0)
js/spell/engine.js           modo / elemento / resolve
js/combat/chart.js           chart JSON
js/combat/director.js        setup + loop hasta KO
js/ui/tape.js                cinta continua
js/ui/hud.js
js/app.js
charts/raindrops-thunder.json
test/
SPEC.md
```

## GitHub Pages

Servir **desde la raíz** de `main`:

1. Repo → **Settings** → **Pages**.
2. Build and deployment → **Deploy from a branch**.
3. Branch: `main` / folder: `/ (root)` → Save.

Queda en `https://juliangdeveloper.github.io/piano-magic/`.

Hay un `.nojekyll` para no pasar Jekyll. Tras el primer push a `main`, Pages puede tardar un minuto.

## Mapeo de teclas

| Tecla | Nota |
|-------|------|
| A S D F G H J K | C4 D4 E4 F4 G4 A4 B4 C5 |
| W E T Y U | C#4 Eb4 F#4 Ab4 Bb4 |
