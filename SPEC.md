# piano-magic — SPEC v0.1.4 (pausa, audio, fusión, ataques)

Producto **0.1.4**. Las reglas de combate siguen las de v0.1.1: `CombatDirector.VERSION` permanece **0.1.1** (HP 15/20, `hole` primero, Defend solo copia, 12 elementos, ×sala). En la UI el `hole` se llama **Ataque**. Esta versión añade pausa, melodía audible del chart, notas del jugador en Defiende con fusión, y quita el marco detrás de la cinta.

Juego de combate con piano, un jefe. Página estática para GitHub Pages. Sin CDN, sin mic/YIN. 100% client-side.

`piano-game` es **otro repo** (solo detección de pitch). Este juego no lo clona ni hace fetch a él.

## Combate (bloqueado)

- HP jugador **15** / jefe **20**.
- Flujo: **setup listen** (BPM + elemento de sala, sin daño) → bucle **1 ataque (`hole`) + 4 Defend** hasta KO. El ataque va **primero** en el loop.
- Cinta continua: un solo ribbon, playhead fijo, preview de compases siguientes en la misma cinta, sin tiempo muerto entre compases. Las notas del chart van en pentagrama (clave de sol). En el Ataque, los NoteOn se escriben en ese pentagrama en el beat en que suenan y siguen visibles mientras la cinta avanza. En Defiende, los NoteOn del jugador también se escriben, con otro color y la plica hacia abajo, hasta fundirse con el blanco si el onset cae en la ventana.
- HUD: HP de ambos, icono/nombre de sala (12 claves → elemento), BPM/metrónomo, feedback de resolución, buffs activos.
- Sin barra de skills fantástica ni HP inflado.

## Chart M0

`charts/raindrops-thunder.json`

- `bpm` 60, `timeSig` [4, 4], `roomKey` `"C"`.
- `setup`: `{ listenOnly: true, bars: 1 }` — 1 compás. Tocar libre / drone C no hace daño.
- `loop`: 1 `hole` (notas vacías) + 4 `defend` (mismas notas C/D/E). El ataque **primero**.
- La cinta recorre setup y después el `loop` sin saltos hasta que jugador o jefe llega a 0 HP.

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

Defend usa **A / S / D** = C4 D4 E4. El resto del teclado es para improvisar en el Ataque (gestos mayor / menor / pent).

## SpellEngine v0.1.1

### Modo → acción

`major` = ataque, `minor` = buff, `pentatonic` = cura.

### Ventana de improvisación (ataque / `hole`)

- **Longitud:** todos los NoteOn del compás hole (1 barra = 4 beats a BPM del chart).
- **Conjunto:** pitch classes únicas. Hace falta **≥ 2** clases distintas para un gesto; 1 nota o silencio = sin hechizo, sin daño.
- **Tónica:** se prueban las 12 claves. Puntúa: tónica presente, 3ª del modo, coincidencia con la 1ª nota, empate hacia `roomKey`.
- **Reglas de modo** (relativo a la tónica inferida):
  1. 3ª menor sin 3ª mayor → `minor`.
  2. Subconjunto pentatónico `{0,2,4,7,9}` con 2ª o 6ª (color pent) y 5ª/6ª, sin 4ª/7ª → `pentatonic`. Una tríada mayor 0-4-7 es `major`, no pent.
  3. Fragmento mayor (p.ej. C-D-E / 0-2-4) o 4ª/7ª mayor → `major`.
- Fuerza: 3+ clases → 1.0; 2 clases → 0.5.

### Elemento = 12 claves (círculo de quintas)

No son grados I–VII. Tonalidad tocada → elemento:

| Clave | Enarmónico | Elemento |
|-------|------------|----------|
| C | | Agua |
| G | | Planta |
| D | | Eléctrico |
| A | | Volador |
| E | | Lucha |
| B | | Dragón |
| F# | Gb | Fuego |
| Db | C# | Hielo |
| Ab | G# | Tierra |
| Eb | D# | Roca |
| Bb | A# | Psíquico |
| F | | Hada |

Sala C muestra **Agua**.

### ×sala (pasos en el círculo de quintas)

Distancia más corta entre la tónica improvisada y `roomKey`:

| Pasos | ×sala |
|------:|------:|
| 0 | 1.0 |
| 1 | 0.85 |
| 2 | 0.7 |
| 3 | 0.5 |
| 4 | 0.35 |
| 5 | 0.2 |
| 6 | **0** |

Ataque base **2** × ×sala × buff × fuerza (redondeo; 0 es válido). Cura base **3** × ×sala × fuerza. Buff `ATQ+` (+0.5, 2 ventanas) si ×sala > 0.

### Defend = copiar

En `kind: "defend"` **no** se resuelve SpellEngine (ni ataque, ni buff, ni cura; 0 DPS al jefe). Solo nota:

- **Perfect** — todas las notas esperadas a tiempo, &lt;2 extras → 0 daño al jugador.
- **Partial** — al menos un acierto, no Perfect → daño parcial (`round(3 × missRatio)`, mín. 1).
- **Fail** — 0 aciertos → 3 HP al jugador.

Ventana de hit: ±0.45 beats respecto del onset esperado.

La fusión en pantalla reutiliza esa ventana y un subconjunto más cerrado (`PERFECT_WINDOW_BEATS` = 0.15): onset dentro de 0.15 → fusión fuerte (Perfect); dentro de 0.45 pero fuera de 0.15 → fusión suave (Partial); fuera de 0.45, o pitch distinto → Fail, sin fusión. `judgeNoteSync` no cambia el grado del compás ni el daño.

### Ataque ≠ silencio / no es penalización

En `kind: "hole"` (etiqueta **Ataque**) el jugador **improvisa**. Tocar es el **DPS principal**. Tocar **no** resta HP al jugador. Silencio es válido (sin auto-castigo). El daño al jugador sale de fallar copias Defend.

## CombatDirector

Resuelve al **cerrar** la ventana:

- `setup` → `resolveSetup` (0 daño).
- `defend` → `resolveDefend` (Perfect / Partial / Fail).
- `hole` → `resolveHole` (idle o spell).

El reloj es inyectable (`now`) para tests. `start` / `reset` restauran HP.

KO: `bossHp === 0` → victoria; `playerHp === 0` → derrota. Overlay + **Reiniciar**.

## UI

- `index.html` + `css/ui.css` — español, fondo azul, columna hasta ~960px. Sin CDN.
- Cromo en `assets/ui/` (mismo origen): icono de sala Agua, orbe BPM, **un** retrato del jefe (`boss-portrait.png`: cara de la nube y rayos en la misma imagen, sin cortes horizontales), barra HP fina aparte (`hp-bar-style.png`, diamantes incluidos; no lleva rebanadas del cuerpo), clave de sol, tres iconos de buff. `tape-frame.png` queda en assets pero **no** se pinta detrás de la cinta. `mockup-full.png` es solo referencia (HP inflado y barra de 6 skills no se usan). `boss-cloud.png` es el recorte viejo y **no** se muestra.
- `js/ui/tape.js` — pentagrama en canvas sobre el pergamino: clave de sol, cabezas, plicas, alteraciones, líneas adicionales, playhead fijo. El Ataque es un marco en el mismo pentagrama (no una ficha de letras). No hay imagen detrás del ribbon (`tape-frame.png` no se usa). Las notas Defend salen del JSON del chart. `improvNotes` (solo compases `hole`) se dibujan en su beat absoluto. `defendNotes` se dibujan en azul (plica abajo) y, si el sync es perfect o partial, se funden con halo y chispas sobre el blanco. Fail queda en rojo, en su beat, con una cruz. Sin VexFlow y sin CDN.
- `js/ui/hud.js` — HP **15/20** (actual / máximo), sala, BPM, metrónomo, feedback, chip ATQ+. Un `<img>` de retrato y, encima, la barra HP.
- `js/ui/tutorial.js` — primera visita. El paso de sala dice **escala y tempo** (la sala sigue siendo el elemento del círculo de quintas por dentro). Spotlight, **Siguiente** / **Saltar**, `localStorage.seenTutorial`. El botón **?** lo repite. Sin la clave es primera visita y se muestra; un save legado `pmSave` sin la clave cuenta como visto (hoy no hay saves).
- `js/app.js` — chart same-origin, QWERTY, teclado en pantalla, MIDI, synth local (Web Audio, oscilador), rAF. Cada NoteOn — pantalla, teclado físico o MIDI — pasa por `InstrumentTranslator` y suena. El AudioContext se crea y se reanuda en el gesto (tap, tecla, Empezar, Siguiente), con un buffer mudo, y el oscilador arranca cuando el contexto está `running` (reintento corto si el primer turno aún estaba suspendido). `preventDefault` de la tecla en pantalla va **después** del NoteOn. Por defecto audible. En Defiende y en setup (si el chart trae notas) la melodía del chart suena al cruzar el playhead, más baja y en seno, por el mismo master. No suena en el Ataque libre.
- **Pausa / Continuar** (y la tecla `P`) durante el combate. `director.pause` congela el beat; al continuar se desplaza `startTimeMs` por el tiempo en pausa, así no se resuelven compases de golpe. El AudioContext se suspende y se reanuda en ese clic. El tutorial y el overlay de victoria/derrota siguen igual: no se puede Empezar con el tutorial abierto, y al terminar se oculta Pausa.
- Teclado en pantalla: botón **Teclado** en el HUD. Por defecto activo en viewport estrecho (≤700px), puntero grueso o táctil; si no, apagado. La última elección queda en `localStorage.onscreenKeyboard` (`on` / `off`). Las teclas usan `InstrumentTranslator.KEY_MAP` (A–K blancas, W E T Y U negras) y el mismo `noteOn` / `noteOff` que el teclado físico.

Versión **0.1.4**: `VERSION`, `package.json`, query `?v=0.1.4` en scripts, CSS e imágenes de UI. El director de combate sigue en 0.1.1. El snapshot añade `paused`, `ribbon`, `improvNotes` (NoteOn del ataque) y `defendNotes` (NoteOn de Defiende, con `sync` / `targetBeat`). No cambia el daño.

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
js/ui/tutorial.js
charts/raindrops-thunder.json
assets/ui/
test/
SPEC.md README.md package.json VERSION .nojekyll
```

Módulos de lógica: UMD (`module.exports` + `window.*`), sin DOM.

## Criterios M0.1

1. Abrir `index.html` (servidor estático): cinta + HUD de Raindrops, Thunder. Sala C = **Agua**.
2. Setup: 1 compás listen-only a BPM del chart (60), `roomKey` C, sin daño.
3. Loop 1 hole + 4 defend (ataque primero en la UI; kind `hole`); teclado A/S/D = C4/D4/E4; teclado ampliado para gestos en el Ataque.
4. Defend: solo Perfect/Partial/Fail. Cero daño al jefe, cero buff/cura por modo.
5. Ataque (`hole`): mayor daña al jefe, menor buff, pent cura; tocar no resta HP; silencio no pune.
6. Fin en HP 0 (jugador o jefe) con pantalla victoria/derrota; Reiniciar funciona.
7. `npm test` verde.
8. Versión de producto **0.1.4** (`?v=0.1.4`). Combate sigue en **0.1.1**.
9. GitHub Pages desde la raíz de `main` (ver README). `.nojekyll` en la raíz.
10. Primera visita: tutorial de 5 pasos (Saltar / Siguiente / **?**). El paso de sala dice escala y tempo. `seenTutorial` persiste.
11. Teclado en pantalla con las mismas notas que el QWERTY, acoplado abajo, entra en el combate y **suena** (Web Audio) en cada NoteOn. Igual el teclado físico y el MIDI.
12. El jefe es un solo retrato (`boss-portrait.png`) más la barra HP aparte. HP en pantalla 15/20.
13. La cinta es un pentagrama sin imagen detrás. Las notas Defend del chart se leen como cabezas y suenan al cruzar el playhead. En el Ataque, lo que se toca se escribe en el pentagrama y permanece al avanzar la cinta. En Defiende, la nota del jugador se escribe aparte y se funde si el timing es perfecto o parcial.
