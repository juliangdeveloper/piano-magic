# 🎹 piano-magic

> Un combate RPG que se juega tocando piano: improvisa para atacar y copia la melodía del jefe para defenderte. Con teclado, MIDI o micrófono.

**[▶ Jugar ahora](https://juliangdeveloper.github.io/piano-magic/)** · gratis, en el navegador, sin instalar

<img src="assets/screenshot.png" alt="Pantalla de combate de piano-magic: partitura en curso con cursor, barras de HP y maná, BPM y teclado" width="720">

## Cómo se juega
- Elige un rival en el modal: una tarjeta por canción, con su retrato, el tempo, la escala, la dificultad y tus victorias contra ese rival (y el **Modo libre**, sin rival).
- El combate alterna compases de **Ataque** y **Defiende** sobre una partitura que avanza al ritmo del metrónomo.
- En **Ataque** improvisas: cualquier nota de la escala ataca, y la tríada mayor pega doble.
- En **Defiende** copias las dos manos: la derecha en clave de sol y la izquierda en clave de fa. Un par a la vez es perfecto si suenan las dos notas, y parcial si solo entra una.
- Toca con el teclado QWERTY (baja hasta el Do3: `Q M , .`), el teclado en pantalla (Do2 a Do7, 61 teclas), un teclado MIDI o el micrófono. El micrófono cubre esas 61 teclas. Cada mano tiene su color. El juego sigue sonando si enciendes el micrófono.
- El teclado en pantalla siempre está a la vista: la nota del jefe se enciende en morado y la tuya en verde, al mismo tiempo que el indicador pasa por la nota y suena.
- Los números junto a las notas indican el dedo (1–5): arriba para la mano derecha, abajo para la izquierda.
- Las notas ligadas se tocan una sola vez.
- El jefe toca con las dinámicas de la partitura: *p*, *f*, reguladores y staccato cambian su volumen y su duración.
- Para practicar, abre la partitura del rival (o pausa el combate), elige una o varias secciones y escúchalas en loop a tempo real, ×0.75 o ×0.5. **Practicar** inicia un combate con ese loop, y no cuenta como pelea real. Cada sección suena entera, sin cortarse.
- La primera vez hay un tutorial; **?** lo vuelve a abrir y **P** pausa.
- La nota musical abre el volumen de **Piano** (tu teclado), **Rival** (el jefe y la partitura) y **Metrónomo**; se guarda en el dispositivo.
- La energía del jugador dura un compás al atacar y se recupera en cuatro compases al defender; la del rival dura su frase más larga.
- En la app para iPhone y iPad, conecta un teclado MIDI Bluetooth desde el panel de sonido (Ajustes).

## Stack
JavaScript vanilla, Web Audio y Web MIDI. La detección de notas se carga en vivo desde el motor de [piano-transcribe](https://github.com/juliangdeveloper/piano-transcribe) (`engine/v1`). El juego solo lee las notas y dibuja su combate. Sin dependencias de npm y sin copia local del detector.
Al abrirse guarda el progreso en `localStorage` (`meta.v1.piano-magic`), que lee el [portafolio](https://juliangdeveloper.github.io/). La app para iPhone y iPad está en prueba en TestFlight.

```
python3 -m http.server 8000   # abrir http://localhost:8000 (file:// no carga los charts)
npm test                      # tests en Node, sin npm install
```

## Relacionado
🎼 [piano-transcribe](https://github.com/juliangdeveloper/piano-transcribe): motor de notas y partitura en vivo. [Probar](https://juliangdeveloper.github.io/piano-transcribe/)

---

Más proyectos: https://juliangdeveloper.github.io/

Hecho con ❤️ y 🎹
