# prueba_landingpaga_dracula_mitos_colombianos
Este repo es una prueba de cómo se vería la reconstrucción de la propuesta por parte de Drácula para su campaña de mitos colombianos.

Landing interactiva sobre mitos y leyendas de Colombia con la identidad de Drácula (rojo sangre, vainilla y noche).

## Cómo correrla

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # genera /dist listo para subir a cualquier hosting estático
npm run preview  # sirve /dist localmente
npm run map      # regenera src/map-data.json desde world-atlas (Natural Earth 1:50m)
```

El mapa se genera con un script de Node (`scripts/build-map.mjs`) que extrae solo Colombia y sus vecinos del atlas mundial, para que la página no cargue el mundo entero. Las coordenadas de cada criatura están en `src/data.js` (`coords: [longitud, latitud]`).

## Qué incluye

- **Hero 3D** (Three.js + bloom): las criaturas del bestiario aparecen una a una en un bosque con luna, niebla y murciélagos. Siguen el cursor, cambian solas cada 7 s (o con las flechas) y al tocarlas se abre su ficha en 3D.
- **Bestiario**: 10 criaturas (La Llorona, El Silbón, La Patasola, El Mohán, El Hombre Caimán, La Madremonte, El Sombrerón, La Tunda, El Bufeo Colorado y La Candileja), con filtro por región y medidor de terror. Las miniaturas se generan en el navegador a partir de los modelos 3D.
- **Visor 3D**: modal con la criatura animada (se puede girar y hacer zoom), su historia, cómo sobrevivirle y dónde aparece. Se navega con las flechas del teclado.
- **Mapa del miedo** (Three.js): Colombia en relieve con su contorno real, regiones naturales pintadas con puntos y un pin por criatura. Al hacer scroll la cámara baja desde Suramérica hasta Colombia y brotan los pines. Hay tres niveles de zoom (país → región → criatura): al tocar una criatura, la cámara vuela hasta su ubicación y el modelo 3D sale del mapa.
- **Modo linterna**: sección a oscuras donde el cursor (o el dedo) ilumina mensajes ocultos y hay que encontrar 12 pares de ojos.
- **Test "¿Qué criatura te persigue?"**: cuatro preguntas que dan un resultado y llevan al visor 3D. El resultado se puede compartir.
- **Sonido sintetizado** (Web Audio, sin archivos): ambiente de viento y dron, el silbido do‑re‑mi‑fa‑sol‑la‑si del Silbón y golpes de susto. Está apagado por defecto.

## Estructura

```
src/
  data.js             textos de las criaturas, regiones y preguntas del test
  main.js             interacción de la página
  quiz.js             lógica del test
  audio.js            sonido sintetizado
  style.css           diseño y tokens de marca (:root)
  three/hero.js       escena 3D del hero
  three/creatures.js  modelos 3D procedurales, miniaturas y visor
  three/textures.js   texturas de brillo
```

## Personalización

- **Colores de marca**: variables en `:root` al inicio de `src/style.css` (`--sangre`, `--crema`, `--noche`…). Son aproximados a la identidad de Drácula; reemplázalos por los hex oficiales del manual de marca.
- **Textos**: todo el contenido está en `src/data.js`.
- **Modelos 3D**: los modelos son procedurales (sin archivos). Si el equipo de diseño entrega modelos `.glb`, se pueden cargar con `GLTFLoader` en `buildCreature()` de `src/three/creatures.js`.
- Se respeta `prefers-reduced-motion`.
