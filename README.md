# 🎹 piano-magic

> Un combate RPG que se juega tocando piano: improvisa para atacar y copia la melodía del jefe para defenderte. Con teclado, MIDI o micrófono.

**[▶ Jugar ahora](https://juliangdeveloper.github.io/piano-magic/)** · gratis, en el navegador, sin instalar

<img src="docs/screenshot.png" alt="Combate de piano-magic contra el jefe Raindrops, Thunder con la partitura en pantalla" width="720">

## Cómo se juega
- Elige un rival (*Raindrops, Thunder*; *Parade Feather*; *The Veil Boat*; *Tower Chime*; *Guardián del Bosque de Sol*; *Hechicera de la Torre*) o el **Modo libre**.
- El combate alterna compases de **Ataque** y **Defiende** sobre una partitura que avanza al ritmo del metrónomo.
- En **Ataque** improvisas: escalas mayores atacan, menores te mejoran y pentatónicas te curan.
- En **Defiende** copias las notas que trae la partitura; se califican como perfecto, parcial o fallo.
- Toca con el teclado QWERTY (`A S D F G H J K` blancas, `W E T Y U` negras), el teclado en pantalla, un teclado MIDI o el micrófono.
- La primera vez hay un tutorial; **?** lo vuelve a abrir y **P** pausa.

## Stack
JavaScript vanilla, Web Audio, Web MIDI y detección de tono YIN. Sin CDN ni dependencias en runtime.

```
python3 -m http.server 8000   # abrir http://localhost:8000 (file:// no carga los charts)
npm test                      # tests en Node, sin npm install
```

## Relacionado
🎼 [piano-game](https://github.com/juliangdeveloper/piano-game): toca y ve tus notas en una partitura en vivo. [Probar](https://juliangdeveloper.github.io/piano-game/)

---

Más proyectos: https://juliangdeveloper.github.io/

Hecho con ❤️ y 🎹
