# piano-magic — SPEC v0.1.0 (M0)

Juego de combate con piano, un jefe. Página estática para GitHub Pages. Sin CDN, sin mic/YIN en M0. 100% client-side.

`piano-game` es **otro repo** (solo detección de pitch). Este juego no lo clona ni hace fetch a él.

## Combate (bloqueado)

- HP jugador **15** / jefe **20**.
- Flujo: **setup listen** (BPM + elemento de sala, sin daño) → bucle **4 Defend + 1 agujero** hasta KO.
- Cinta continua: un solo ribbon, playhead fijo, preview de compases siguientes en la misma cinta, sin tiempo muerto entre compases.
- HUD: HP de ambos, icono de sala, BPM/metrónomo, feedback de resolución, buffs activos.
- Sin barra de skills fantástica ni HP inflado.

## Chart M0

`charts/raindrops-thunder.json`

- `bpm` 60, `timeSig` [4, 4], `roomKey` `"C"`.
- `setup`: `{ listenOnly: true, bars: 1 }` — 1 compás. Tocar libre / drone C no hace daño.
- `loop`: 4 `defend` (notas C/D/E del chart) + 1 `hole` (notas vacías).
- La cinta recorre setup y después el `loop` sin huecos hasta que jugador o jefe llega a 0 HP.

## InstrumentTranslator (stub M0)

Contrato: `noteOn` / `noteOff` + `timeMs` → beats y límites de compás (`measureAt`).

Entrada M0:

- Teclado QWERTY → pitches del chart (y vecinos para mayor/menor/pentatónica).
- Web MIDI si existe (`requestMIDIAccess`).
- **No** micrófono / YIN.

Mapeo documentado en pantalla:

```
A=C4  S=D4  D=E4  F=F4  G=G4  H=A4  J=B4  K=C5
W=C#4 E=Eb4 T=F#4 Y=Ab4 U=Bb4
```

## SpellEngine v1

- **modo → acción**: `major` = ataque, `minor` = buff, `pentatonic` = cura.
- Clasificación sobre pitch classes relativas a `roomKey`:
  - 3ª menor sin 3ª mayor → `minor`.
  - Fragmento con 4ª/7ª (o subconjunto mayor tipo C-D-E) → `major`.
  - Subconjunto pentatónico que incluye 5ª o 6ª (G o A) sin 4ª/7ª → `pentatonic`.
- **grado → elemento** (I Tierra, II Agua, III Fuego, IV Aire, V Trueno, VI Hielo, VII Luz).
- **multiplicador de sala**: distancia en el círculo de quintas entre la tónica del hechizo y `roomKey`:
  - 0 → ×1.5, 1–2 → ×1.0, 3–4 → ×0.75, 5–6 → ×0.5.
- Ataque base **2** × multiplicador × buff × fuerza (1 si accuracy ≥ 0.75, 0.5 si ≥ 0.5). En sala C con C mayor: `round(2×1.5)=3` al jefe.
- Cura base **3**. Buff `ATQ+` (+0.5, 2 ventanas).
- Fallo de Defend (`accuracy < 0.5`) o notas en el agujero: **3** HP al jugador.
- Ventana de hit: ±0.45 beats respecto del onset esperado.

## CombatDirector

Resuelve al **cerrar** la ventana:

- `setup` → `resolveSetup` (0 daño).
- `defend` → `resolveDefend`.
- `hole` con notas → `hole-miss`; silencio → `hole-clear`.

El reloj es inyectable (`now`) para tests. `start` / `reset` restauran HP.

KO: `bossHp === 0` → victoria; `playerHp === 0` → derrota. Overlay + **Reiniciar**.

## UI

- `index.html` + `css/ui.css` — móvil-ish ~390px, fondo oscuro, etiquetas en español.
- `js/ui/tape.js` — canvas, playhead fijo a la izquierda, notas y compases se desplazan.
- `js/ui/hud.js` — HP, sala, BPM, pulsos de metrónomo, feedback, buffs.
- `js/app.js` — fetch same-origin del JSON, teclado, MIDI, synth local (oscilador), rAF.

Versión **0.1.0**: `VERSION`, `package.json`, query `?v=0.1.0` en scripts/CSS.

## Tests

```
npm test
```

Node nativo (`node --test`), sin `npm install`. Puros:

- `test/spell.test.js`
- `test/chart.test.js`
- `test/director.test.js`

## Reparto de archivos

```
index.html
css/ui.css
js/app.js
js/instrument/translator.js
js/spell/engine.js
js/combat/director.js
js/combat/chart.js
js/ui/tape.js
js/ui/hud.js
charts/raindrops-thunder.json
test/
SPEC.md README.md package.json VERSION .nojekyll
```

Módulos de lógica: UMD (`module.exports` + `window.*`), sin DOM.

## Criterios M0

1. Abrir `index.html` (servidor estático): cinta + HUD de Raindrops, Thunder.
2. Setup: 1 compás listen-only a BPM del chart (60), `roomKey` C, sin daño.
3. Loop 4 defend + 1 hole; teclado A/S/D = C4/D4/E4 (mapeo en pantalla).
4. Notas correctas en Defend aplican ataque/buff/cura; fallos y errores de agujero dañan al jugador.
5. Fin en HP 0 (jugador o jefe) con pantalla victoria/derrota; Reiniciar funciona.
6. `npm test` verde.
7. Versión **0.1.0**.
8. GitHub Pages desde la raíz de `main` (ver README).
