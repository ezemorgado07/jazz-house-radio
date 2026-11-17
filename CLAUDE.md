# Jazz House Radio

Proyecto de portfolio: reproductor web de radio "Jazz House" con visualizador de audio en tiempo real y mezclador de sonidos ambiente. 100% client-side, liviano, modo oscuro, estética glassmorphism / lo-fi nocturno.

## Stack

- **Framework:** React 19 + TypeScript + Vite 9
- **Estilos:** Tailwind CSS v4 (plugin oficial de Vite, sin `tailwind.config.*` ni `postcss.config`). Temas vía variables CSS en `src/index.css` con selectores `[data-theme="..."]`.
- **Audio:** Web Audio API nativa (`AudioContext`, `AnalyserNode`, `GainNode`, `MediaElementAudioSourceNode`). Sin librerías de audio externas.
- **Gráficos:** HTML5 `<canvas>` 2D a 60 FPS con `requestAnimationFrame`.
- **Fuente de streams:** Radio Browser API (`https://de1.api.radio-browser.info/`), tags como `jazz house`, `nu-jazz`, `deep house`. Fallback: carga de archivo `.mp3`/`.wav` local.
- **Sonidos ambiente:** síntesis con Web Audio API (ruido rosa/marrón filtrado, clicks aleatorios) o archivos en `public/sounds/`.

## Identidad visual

Minimalista, modo oscuro, inspirado en consolas de audio analógicas y radios lo-fi nocturnas. Glassmorphism en los paneles (backdrop-blur + fondo translúcido + borde sutil). Responsive real (mobile + desktop). Transiciones suaves. Nada chillón.

**Tres temas intercambiables** definidos como `[data-theme="..."]` en `src/index.css` con variables CSS:

- **`midnight`** (Midnight Club): azul profundo, acentos ámbar/naranja neón.
- **`rainy`** (Rainy Café): tonos carbón, verde salvia, detalles en cobre/dorado.
- **`vinyl`** (Vinyl Sunset): púrpura oscuro, terracota, retro cálido.

## Arquitectura del motor de audio

Separación estricta entre el **motor imperativo** (Web Audio API) y la **UI declarativa** (React). El motor vive en `useRef` fuera del ciclo de render; React solo le "ordena" qué hacer.

### Grafo de audio

```
                                   ┌─ rainGain ─────┐
<audio> radio                      │                │
   │                               ├─ crackleGain ──┤
   ▼                               │                │
MediaElementSource                 └─ cafeGain ─────┘
   │                                       │
   ▼                                       │
radioGain ──► analyser ──► masterGain ◄────┘
                              │
                              ▼
                          destination (parlantes)
```

**Clave:** el `analyser` solo "escucha" la radio, no los sonidos ambiente. Si el ambiente pasara por el analyser, el visualizador reaccionaría a la lluvia y al crackle, no a la música. El ambiente se mezcla **después** del analyser, directo al `masterGain`.

### Canvas y rendimiento

El `<canvas>` lee `getByteFrequencyData()` del `AnalyserNode` **directamente por ref** dentro de su propio `requestAnimationFrame`. **Nunca** pasar los datos del analyser por `useState` — serían 60 re-renders por segundo y la app se arrastraría.

## Features

### Reproductor
- Play/Pause, siguiente/anterior estación, slider de volumen maestro, mute.
- Indicador con nombre de estación, tags, estado (loading / playing / paused / error).
- Atajos de teclado: `Espacio` (play/pause), `M` (mute), `← →` (cambiar estación).
- Botón para cargar un archivo local como respaldo.

### Visualizador (dos modos intercambiables)
1. **Espectro:** barras de frecuencia simétricas, suavizadas, que reaccionan a graves/medios/agudos.
2. **Vinilo reactivo:** disco central que gira cuando suena; halo pulsa con la intensidad de los bajos.

### Mezclador de ambiente
Tres canales en loop continuo, cada uno con su slider (0–100%) e ícono:
- Lluvia suave (`rain`)
- Estática de vinilo (`crackle`)
- Cafetería (`coffee`)

## Estructura de carpetas

```
src/
├── main.tsx
├── App.tsx
├── index.css                 # @import "tailwindcss" + variables CSS de los temas
│
├── audio/                    # motor imperativo (lives in refs)
│   ├── useAudioEngine.ts
│   ├── useAmbientMixer.ts
│   ├── noise.ts              # síntesis: ruido rosa/marrón, clicks de vinilo
│   └── graph.ts
│
├── radio/
│   ├── radioBrowser.ts       # fetch a la API + curado
│   ├── stations.ts           # lista curada de respaldo (CORS-friendly)
│   └── useStations.ts
│
├── components/
│   ├── Visualizer/
│   │   ├── Visualizer.tsx
│   │   ├── drawSpectrum.ts
│   │   └── drawVinyl.ts
│   ├── Player/
│   │   ├── PlayerControls.tsx
│   │   ├── StationInfo.tsx
│   │   └── VolumeSlider.tsx
│   ├── AmbientMixer/
│   │   ├── AmbientMixer.tsx
│   │   └── AmbientChannel.tsx
│   └── ThemeSwitcher.tsx
│
├── theme/
│   ├── themes.ts
│   └── useTheme.ts
│
├── hooks/
│   └── useKeyboardShortcuts.ts
│
└── types/
    └── index.ts
```

## Trampas críticas de la Web Audio API

Las tres cosas que rompen el 90% de estos proyectos. Resolver siempre antes de agregar features.

### 1. Política de autoplay
El `AudioContext` se construye **una sola vez**, dentro de un handler que nace de un gesto del usuario (clic en Play). Nunca al montar el componente, porque queda en estado `suspended` y no sale sonido sin ningún error visible. Siempre `await ctx.resume()` después de cada interacción, porque un contexto creado puede volver a suspenderse.

### 2. CORS en streams de radio
- `audio.crossOrigin = 'anonymous'` **se setea antes** de asignar `src`.
- `createMediaElementSource()` se llama **una sola vez por elemento `<audio>`, para siempre**. Reconstruirlo tira excepción. Para cambiar de estación, reasignar `el.src`, nunca recrear el nodo.
- Muchas radios no mandan cabeceras CORS → el analyser recibe silencio o `.play()` falla. Mantener una **lista curada de estaciones CORS-friendly** en `src/radio/stations.ts`. Fallback elegante: si una falla, saltar automáticamente a la siguiente; si todas fallan, animación de "reposo" en el visualizador en vez de congelarse.

### 3. Limpieza de memoria
En el cleanup de los `useEffect`:
- `cancelAnimationFrame` en el canvas.
- `.disconnect()` en cada nodo (source, gains, analyser).
- `URL.revokeObjectURL()` para archivos locales.
- `ctx.close()` el AudioContext (recurso finito del navegador).

## Patrones descubiertos durante la implementación

### Mirror refs para state que leen callbacks estables

Cualquier state de React que necesite ser leído desde adentro de una callback con `useCallback(..., [])` o un `useEffect` con `[]` debe tener su "espejo" en un ref. Si no, la callback cierra sobre el valor inicial y lee uno stale cuando el state cambia. En el motor de audio esto aplica a `volumeRef` y `isMutedRef`, que acompañan a su `useState` y se actualizan en el mismo setter.

Regla: si un valor de UI tiene que afectar un nodo de Web Audio desde una callback estable, duplicarlo en un ref.

### Cleanup correcto del elemento `<audio>` que reproduce streams

Pausar un `<audio>` no cierra el buffer de red: la conexión al stream queda abierta y el navegador sigue descargando en segundo plano. Al desmontar o cambiar de fuente, además de `pause()` hay que hacer:

    el.removeAttribute('src')
    el.load()

Eso fuerza al elemento a soltar el buffer y cerrar la conexión. Importante para evitar leaks cuando el usuario navega o cuando cambiamos de estación.

## Convenciones

- **Idioma del código:** inglés para identificadores (variables, funciones, archivos, componentes). Comentarios en español cuando ayuden a entender decisiones de diseño o las trampas.
- **TypeScript estricto.** Nada de `any` salvo casos puntuales justificados con comentario.
- **Estado vs refs:** estado de UI va en `useState`; motor de audio (contexts, nodes, animation frames) vive en `useRef`.
- **Un componente por archivo.** Hooks en `src/audio/` o `src/hooks/`.
- **Tailwind + variables CSS:** colores siempre vía `bg-[var(--surface)]`, `text-[var(--accent)]`, etc. Layout/spacing con utilidades estándar de Tailwind.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `style:`, `docs:`).
- **ESLint** debe pasar antes de commitear.

## Flujo de trabajo preferido

- Trabajar en fases chicas y commiteables. Nada de "escribo todo y después pruebo".
- Antes de crear un nuevo hook o componente grande, confirmar el plan en una o dos líneas.
- Priorizar código legible sobre código ingenioso.
- Para cada cambio: implementar → verificar que compila (`tsc --noEmit` o que `npm run dev` no tire errores) → explicar brevemente qué cambió.
