---
name: clima
description: Devuelve el clima actual de una ciudad. Por defecto Elda, España. Usar cuando el usuario pida el clima, el tiempo o la temperatura, o invoque /clima.
---

# clima

Devuelve el clima actual de una ciudad usando wttr.in (sin API key).

## Ciudad

- Si el usuario indica una ciudad (argumento de `/clima` o en el mensaje), usa esa.
- Si no indica ninguna, usa **Elda, Spain**.

## Pasos

1. Ejecuta con Bash (sustituye `CIUDAD`, con espacios como `+`, p. ej. `Madrid,Spain`):

   ```bash
   curl -s -m 10 "https://wttr.in/CIUDAD?0T&lang=es"
   ```

   Por defecto:

   ```bash
   curl -s -m 10 "https://wttr.in/Elda,Spain?0T&lang=es"
   ```

2. Resume en español, en pocas líneas: ciudad, condición, temperatura (y sensación térmica), viento, visibilidad y precipitación.
3. Si `curl` falla o devuelve vacío, dilo y sugiere reintentar. No inventes datos.
