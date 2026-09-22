# piano-magic — SPEC v0.1.2 (M0.2 UI)

Producto **0.1.2**. Las reglas de combate siguen las de v0.1.1: `CombatDirector.VERSION` permanece **0.1.1** (HP 15/20, agujero primero, Defend solo copia, 12 elementos, ×sala). Esta versión cambia cromo, tutorial y teclado en pantalla.

Juego de combate con piano, un jefe. Página estática para GitHub Pages. Sin CDN, sin mic/YIN. 100% client-side.

`piano-game` es **otro repo** (solo detección de pitch). Este juego no lo clona ni hace fetch a él.

## Combate (bloqueado)

- HP jugador **15** / jefe **20**.
- Flujo: **setup listen** (BPM + elemento de sala, sin daño) → bucle **1 agujero + 4 Defend** hasta KO. El agujero va **primero** en el loop.
- Cinta continua: un solo ribbon, playhead fijo, preview de compases siguientes en la misma cinta, sin tiempo muerto entre compases.
- HUD: HP de ambos, icono/nombre de sala (12 claves → elemento), BPM/metrónomo, feedback de resolución, buffs activos.
- Sin barra de skills fantástica ni HP inflado.

## Chart M0

`charts/raindrops-thunder.json`

- `bpm` 60, `timeSig` [4, 4], `roomKey` `"C"`.
- `setup`: `{ listenOnly: true, bars: 1 }` — 1 compás. Tocar libre / drone C no hace daño.
- `loop`: 1 `hole` (notas vacías) + 4 `defend` (mismas notas C/D/E). Agujero **primero**.
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

Defend usa **A / S / D** = C4 D4 E4. El resto del teclado es para improvisar en el agujero (gestos mayor / menor / pent).

## SpellEngine v0.1.1

### Modo → acción

`major` = ataque, `minor` = buff, `pentatonic` = cura.

### Ventana de improvisación (agujero)

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

### Agujero ≠ silencio / no es penalización

En `kind: "hole"` el jugador **improvisa**. Tocar es el **DPS principal**. Tocar **no** resta HP al jugador. Silencio es válido (sin auto-castigo). El daño al jugador sale de fallar copias Defend.

## CombatDirector

Resuelve al **cerrar** la ventana:

- `setup` → `resolveSetup` (0 daño).
- `defend` → `resolveDefend` (Perfect / Partial / Fail).
- `hole` → `resolveHole` (idle o spell).

El reloj es inyectable (`now`) para tests. `start` / `reset` restauran HP.

KO: `bossHp === 0` → victoria; `playerHp === 0` → derrota. Overlay + **Reiniciar**.

## UI

- `index.html` + `css/ui.css` — español, fondo azul, columna hasta ~960px. Sin CDN.
- Cromo en `assets/ui/` (mismo origen): icono de sala Agua, orbe BPM, retrato del jefe, barra HP, marco de la cinta, ficha de nota, ranura de hueco, tres iconos de buff. `mockup-full.png` es solo referencia (HP inflado y barra de 6 skills no se usan).
- `js/ui/tape.js` — canvas sobre el pergamino: playhead fijo, fichas, hueco, números de compás reales.
- `js/ui/hud.js` — HP **15/20** (actual / máximo), sala, BPM, metrónomo, feedback, chip ATQ+.
- `js/ui/tutorial.js` — primera visita. Spotlight, **Siguiente** / **Saltar**, `localStorage.seenTutorial`. El botón **?** lo repite. Sin la clave es primera visita y se muestra; un save legado `pmSave` sin la clave cuenta como visto (hoy no hay saves).
- `js/app.js` — chart same-origin, QWERTY, teclado en pantalla, MIDI, synth local, rAF.
- Teclado en pantalla: botón **Teclado** en el HUD. Por defecto activo en viewport estrecho (≤700px), puntero grueso o táctil; si no, apagado. La última elección queda en `localStorage.onscreenKeyboard` (`on` / `off`). Las teclas usan `InstrumentTranslator.KEY_MAP` (A–K blancas, W E T Y U negras) y el mismo `noteOn` / `noteOff` que el teclado físico.

Versión **0.1.2**: `VERSION`, `package.json`, query `?v=0.1.2` en scripts, CSS e imágenes de UI. El director de combate sigue en 0.1.1.

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
3. Loop 1 hole + 4 defend (agujero primero); teclado A/S/D = C4/D4/E4; teclado ampliado para gestos en el agujero.
4. Defend: solo Perfect/Partial/Fail. Cero daño al jefe, cero buff/cura por modo.
5. Agujero: mayor daña al jefe, menor buff, pent cura; tocar no resta HP; silencio no pune.
6. Fin en HP 0 (jugador o jefe) con pantalla victoria/derrota; Reiniciar funciona.
7. `npm test` verde.
8. Versión de producto **0.1.2** (`?v=0.1.2`). Combate sigue en **0.1.1**.
9. GitHub Pages desde la raíz de `main` (ver README). `.nojekyll` en la raíz.
10. Primera visita: tutorial de 5 pasos (Saltar / Siguiente / **?**). `seenTutorial` persiste.
11. Teclado en pantalla con las mismas notas que el QWERTY, acoplado abajo, entra en el combate.
