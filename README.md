# piano-magic

Combate con piano (un jefe). Página estática para GitHub Pages, sin CDN ni red en runtime salvo el JSON del chart (mismo origen).

La detección de micrófono/pitch vive en el repo aparte [`piano-game`](https://github.com/juliangdeveloper/piano-game). **Este juego no depende de él** (ni CDN, ni fetch). M0 usa teclado QWERTY + Web MIDI.

Versión **0.1.2**. El combate (agujero, Defend, 12 elementos, HP 15/20) es el de **0.1.1**.

## Jugar

Jefe M0: **Raindrops, Thunder**. HP jugador 15 / jefe 20. BPM 60, sala C = **Agua**.

1. Un compás de **escucha** (sin daño; drone C / toca libre).
2. Bucle **1 Agujero + 4 Defiende** hasta KO (el agujero va primero en el loop).
3. En Defiende, copia las notas de la cinta (`A` `S` `D` = C4 D4 E4). Perfect / Parcial / Fallo — no hay DPS al jefe.
4. En el **agujero**, improvisa: **mayor → ataque**, **menor → mejora**, **pentatónica → cura**. Tocar no resta HP; el silencio es válido.

El elemento sale de la **clave** (12 del círculo de quintas), no de grados I–VII. ×sala = pasos más cortos entre la tónica improvisada y la sala.

La primera visita muestra un tutorial (Siguiente / Saltar). **?** lo vuelve a abrir. `localStorage.seenTutorial` recuerda que ya se vio.

**Teclado** en el HUD muestra un piano abajo (A–K blancas, W E T Y U negras), las mismas notas que el QWERTY. En pantallas estrechas o táctiles empieza encendido; la elección queda en `localStorage.onscreenKeyboard`.

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
js/spell/engine.js           12 claves / ×sala / modo / resolve
js/combat/chart.js           chart JSON
js/combat/director.js        setup + loop hasta KO
js/ui/tape.js                cinta continua
js/ui/hud.js
js/ui/tutorial.js
js/app.js
charts/raindrops-thunder.json
assets/ui/                   cromo del mockup (sin CDN)
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

Defiende: A/S/D. Agujero: usa el teclado completo para formar gestos (p.ej. C D E, C Eb G, C D E G A).
