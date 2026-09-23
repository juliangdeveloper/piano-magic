# piano-magic

Combate con piano (un jefe). Página estática para GitHub Pages, sin CDN ni red en runtime salvo el JSON del chart (mismo origen).

El YIN monofónico está copiado de [`piano-game`](https://github.com/juliangdeveloper/piano-game) (`js/pitch.js`). **No hay dependencia en runtime** (ni CDN, ni fetch). El juego también usa teclado QWERTY, teclado en pantalla y Web MIDI.

Versión **0.1.5**. El combate (ataque libre, Defend, 12 elementos, HP 15/20) es el de **0.1.1**. El id interno del compás de improvisación sigue siendo `hole`.

El jefe es **un** retrato (nube y rayos juntos) y una barra de HP aparte. La cinta es un pentagrama limpio (sin marco detrás): las notas de Defiende vienen del chart y suenan al cruzar el playhead; lo que tocas en el **Ataque** y en **Defiende** se escribe ahí. En el Ataque, unos números `1 2 3 4` marcan el pulso encima del pentagrama. Un acierto casi o perfecto se funde con la nota del chart. **Pausa** congela cinta, combate y audio. El teclado en pantalla, el QWERTY y el MIDI suenan con Web Audio (sin CDN). El tutorial de la sala habla de **escala y tempo**.

## Jugar

Jefe M0: **Raindrops, Thunder**. HP jugador 15 / jefe 20. BPM 60, sala C = **Agua**.

1. Un compás de **escucha** (sin daño; drone C / toca libre).
2. Bucle **1 Ataque + 4 Defiende** hasta KO (el ataque va primero en el loop).
3. En Defiende, copia las notas de la cinta (`A` `S` `D` = C4 D4 E4). Perfect / Parcial / Fallo — no hay DPS al jefe. La frase del jefe suena al llegar al playhead.
4. En el **Ataque**, improvisa: **mayor → ataque**, **menor → mejora**, **pentatónica → cura**. Tocar no resta HP; el silencio es válido.

El elemento sale de la **clave** (12 del círculo de quintas), no de grados I–VII. ×sala = pasos más cortos entre la tónica improvisada y la sala.

La primera visita muestra un tutorial (Siguiente / Saltar). **?** lo vuelve a abrir. `localStorage.seenTutorial` recuerda que ya se vio.

**Teclado** en el HUD muestra un piano abajo (A–K blancas, W E T Y U negras), las mismas notas que el QWERTY. En pantallas estrechas o táctiles empieza encendido; la elección queda en `localStorage.onscreenKeyboard`. Cada NoteOn suena (oscilador Web Audio) en el `pointerdown`, con un ataque corto. El primer toque — Empezar, Siguiente del tutorial o una tecla — desbloquea el audio con un beep breve (HTML `playsinline` + buffer) y, si el navegador lo permite, `audioSession` en `playback`, para que el **altavoz** del iPhone o iPad suene y no solo los auriculares.

**Micrófono** (apagado al entrar) oye una sola nota — piano, voz o instrumento — y la manda al combate como si fuera una tecla. Pide permiso solo al activarlo. Si lo niegas, el aviso está en español y puedes seguir con el teclado. No dispara dos veces una nota que ya tienes pulsada. Mientras está activo, la melodía del jefe y el metrónomo no suenan: si salieran por el altavoz, el mic las contaría como tuyas. En iPhone/iPad, si al encenderlo dejas de oír el altavoz (el sistema a veces usa el auricular de llamada), apaga el micrófono o usa auriculares. Limitaciones: se equivoca con ruido, acordes y notas fuera de C3–C6; tarda un poco más que el teclado; Safari móvil puede pedir el permiso otra vez al recargar.

**Pausa** / **Continuar** aparece durante el combate (también la tecla `P`). Congela el scroll de la cinta, el reloj del combate y el audio. Al continuar, el beat sigue donde se quedó.

```
python3 -m http.server 8000
# abrir http://localhost:8000
```

`file://` no carga el JSON del chart; hace falta un servidor estático.

## Tests

```
npm test
```

Corre `test/spell.test.js`, `test/chart.test.js`, `test/director.test.js` y `test/ui.test.js` (Node, sin `npm install`).

## Estructura

```
index.html                 UI (español)
css/ui.css
js/pitch.js                 YIN monofónico (copiado de piano-game)
js/instrument/mic-notes.js   hops del mic → NoteOn/NoteOff
js/instrument/translator.js  NoteOn/Off → beats (stub M0)
js/spell/engine.js           12 claves / ×sala / modo / resolve
js/combat/chart.js           chart JSON
js/combat/director.js        setup + loop hasta KO
js/ui/tape.js                pentagrama continuo (sin CDN)
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

Defiende: A/S/D. Ataque: usa el teclado completo para formar gestos (p.ej. C D E, C Eb G, C D E G A).
