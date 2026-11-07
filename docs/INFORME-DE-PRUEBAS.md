# Informe de pruebas

## Actualización · 8 de noviembre de 2026 (secciones, bloques y Estudio Creativo)

| Comprobación | Resultado |
| --- | --- |
| Lint, typecheck y build | ✅ sin errores |
| Unitarias e integración (Vitest + Blobs local) | ✅ **49/49** (12 nuevas) |
| E2E (Playwright) | ✅ **29/29**, ejecutadas dos veces seguidas sin fallos |
| Lighthouse móvil / escritorio | **97·100·100·100** / **100·100·100·100** (CLS 0) |
| `netlify build --offline` | ✅ 3 funciones + edge function con ruta `/` |

Nuevas pruebas:
- **Secciones**: migración no destructiva de contenido antiguo (respeta la comparativa oculta), validación de enlaces y duplicados, protección de secciones esenciales, solo secciones visibles en la web; en navegador: ocultar y volver a mostrar la comparativa (desaparece de la web y de la navegación), protección de portada/menús/reservas, reordenar, editar textos desde el gestor, crear un bloque «Llamada a la acción» con enlace a reservas y entrada en la navegación, publicar y recargar sin perder cambios.
- **Estudio Creativo**: las 10 plantillas generan diseños válidos con el tamaño de su formato; los textos de menú salen de lo publicado (sin postre ni bebida inventados para el Menú Distinción); las historias respetan la zona segura; API de diseños (guardar, listar, reabrir, duplicar, eliminar; 401/403 sin permisos; 422 con datos o miniatura no válidos); en navegador: publicación 4:5 desde plantilla, añadir y editar texto, insertar el precio vinculado a un menú publicado, insertar una imagen de la biblioteca existente, guardar, reabrir y **exportar PNG 1080×1350, JPG 1080×1350 y PDF** (dimensiones leídas del archivo descargado); historia exportada a **1080×1920**; aviso para actualizar o conservar un diseño cuando cambia el precio publicado.
- **Compatibilidad**: el gestor de imágenes sigue subiendo y listando imágenes; no permite borrar una imagen usada por un diseño del Estudio; todas las pruebas anteriores de landing y panel siguen pasando.
- Revisión visual de los 8 tipos de bloque a 1440 y 390 px (sin desbordes horizontales) y de las 10 plantillas del Estudio.

---

## Versión inicial

Fecha de ejecución: 7 de noviembre de 2026. Entorno: Linux, Node.js 22, Chromium (Playwright 1.63).

## Resumen

| Comprobación | Resultado |
| --- | --- |
| `npm install` (con `.npmrc` → `legacy-peer-deps`) | ✅ |
| Typecheck (`tsc -b`, modo estricto) | ✅ sin errores |
| Lint (ESLint + typescript-eslint + react-hooks + jsx-a11y) | ✅ sin errores ni avisos |
| Build de producción (`vite build`) | ✅ |
| Pruebas unitarias e integración API (Vitest) | ✅ **37/37** |
| Pruebas e2e (Playwright) | ✅ **22/22** |
| Empaquetado Netlify (`netlify build --offline`) | ✅ 3 funciones + edge function empaquetadas (ver nota) |
| Lighthouse móvil | Rendimiento **96** · Accesibilidad **100** · Buenas prácticas **100** · SEO **100** |
| Lighthouse escritorio | **100 · 100 · 100 · 100** |

## Pruebas unitarias y de integración (`npm test`)

Se ejecutan contra el **cliente real de `@netlify/blobs`** conectado a un `BlobsServer` local (el mismo protocolo que en Netlify).

- Contenido inicial: cumple el esquema; menús, platos, cantidades y precios exactamente como el encargo; postre y bebida del Menú Distinción vacíos y pendientes; URL de reservas oficial; redes vacías; horario no verificado; todas las imágenes existen.
- Validación: rechaza `javascript:`, `data:`, reservas sin `https`, caracteres de control, textos demasiado largos y paletas sin contraste suficiente; las 4 paletas predefinidas cumplen WCAG.
- Proyección pública: no publica secciones/cantidades pendientes, notas internas, horario sin verificar ni menús en borrador.
- Comparativa: generada desde el contenido; detecta platos comunes; deja «pendiente» sin inventar.
- SEO: escape de HTML e inyección segura (incluido `$&` y `</script>`); JSON-LD solo con datos verificados.
- **API**: contenido inicial sin escrituras; 401 sin sesión; 403 sin rol; acceso con `ADMIN_EMAILS`; 403 sin cabecera anti-CSRF y con `Origin` ajeno o ausente; un usuario sin rol no puede guardar ni publicar; 415/413 por tipo y tamaño.
- **Edición**: cambiar un precio no afecta a la web hasta publicar; tras publicar se ve y se purga la caché; conflicto `409`; validación `422` con ruta del campo; edición de platos, textos y horarios especiales.
- **Tercer menú**: borrador oculto → bloqueado al publicarlo sin precio/platos (`422 publish_blocked`) → publicado al completarlo y visible en la API.
- **Persistencia**: instancias nuevas de los manejadores (equivalente a un nuevo despliegue) leen los mismos datos; el contenido inicial no sobrescribe cambios.
- **Historial**: restaurar en el borrador sin cambiar la web; rechazo de claves manipuladas (`../`).
- **Imágenes**: subida WebP con miniatura, servida con tipo correcto e `immutable`; uso en la portada publicada; bloqueo de borrado en uso; borrado; rechazo de SVG disfrazado de PNG; las imágenes incluidas no se pueden borrar.

## Pruebas de extremo a extremo (`npm run test:e2e`)

Sobre el servidor local (`scripts/local-server.ts`), con la librería real `@netlify/identity` en el navegador frente a una emulación de GoTrue.

Landing:
- Los dos menús con 36 € y 45 €; «Para compartir en el centro de la mesa» y «A elegir un plato por comensal»; ningún postre/bebida del Menú Distinción; entrantes sin alternativas («o») y principales con alternativa.
- **Enlaces de reserva**: todos los `[data-book]` (hero, navegación, cada menú, comparativa, celebración, cómo reservar, pie, barra móvil, menú móvil) apuntan a Qamarero con `target=_blank` y `rel=noopener`.
- **Sin scroll horizontal** a 320, 390, 768 y 1440 px (recorriendo toda la página).
- **Accesibilidad axe-core** (WCAG 2.0/2.1/2.2 A y AA) a 390 y 1440 px: 0 incidencias graves o críticas.
- Intro: aparece la primera vez, se salta con el botón y no se repite; con movimiento reducido no hay intro y el contenido es visible.
- Menú móvil: diálogo accesible, cierre con Escape y devolución del foco.
- Barra móvil de reserva: aparece tras la portada con «desde 36 €».
- SEO: título, Open Graph, Twitter Card, JSON-LD (`BarOrPub` con menús, sin dirección no verificada), robots y sitemap.
- Cabeceras de seguridad (CSP, X-Frame-Options) y acordeón de preguntas.

Panel:
- Credenciales incorrectas → mensaje comprensible; usuario sin rol → «Sin permisos»; `/preview` sin sesión → protegida.
- **Cambiar un precio** (39,50 €) → guardar → publicar → visible en la landing.
- **Crear y publicar un tercer menú** desde la interfaz → 3 menús en la web y comparativa de 3 columnas; su postre y bebida pendientes no aparecen.
- **Horarios, textos e imagen**: verificar horario y añadir «Nochebuena», cambiar el titular, subir una imagen → publicar → visibles en la web; tras recargar el panel, los datos persisten.
- Vista previa del borrador con sesión.
- Los enlaces de invitación de Identity que llegan a la portada se redirigen a `/admin` y muestran «Activa tu cuenta».

## Persistencia tras una nueva compilación

Tras la batería e2e se borró `dist/`, se recompiló y se reinició el servidor sobre el mismo almacenamiento: la API devolvió los cambios hechos desde el panel (precio 39,50 €, «Menú Tradición» a 52 €, titular editado y horario verificado).

## Revisión visual

Capturas a 390, 768 y 1440 px de toda la página y del panel, revisadas y corregidas: descendentes recortados por las máscaras de texto, tamaño del titular en móvil, crédito de imagen superpuesto, jerarquía de color de la comparativa, composición de la sección de celebración y filas de platos del panel en móvil. Sin errores en consola.

## Rendimiento (Lighthouse 13.6, servidor local)

| | FCP | LCP | TBT | CLS | Speed Index |
| --- | --- | --- | --- | --- | --- |
| Móvil (4G lento simulado, CPU ×4) | 1,4 s | 1,4 s | 220 ms | 0 | 2,7 s |
| Escritorio | 0,4 s | 0,4 s | 20 ms | 0,015 | 0,8 s |

Mejoras aplicadas tras la primera medición (móvil 76 → 96): composición del titular tras cargar fuentes (CLS 0,18 → 0), precarga de la cursiva, animaciones de scroll en tiempo ocioso, capa de grano sin `mix-blend-mode`, `aria` de SplitText.

## Limitaciones de la verificación

- **Netlify real**: no se ha desplegado en una cuenta de Netlify desde este entorno. Identity (correos, roles), Blobs en producción, la ejecución de la Edge Function y la purga de caché se verificaron mediante emulación/local y empaquetado, y deben comprobarse tras el primer despliegue con la lista de `docs/DESPLIEGUE.md`.
- **Empaquetado**: `netlify build --offline` empaquetó las 3 funciones y la edge function (ruta `/` registrada desde `netlify.toml`). El aviso «Could not load configuration for edge function» se debe a que este entorno no puede descargar `edge.netlify.com/bootstrap`; la configuración está declarada en `netlify.toml`, por lo que no afecta.
- **Navegadores**: las pruebas automáticas usan Chromium. Se ha cuidado la compatibilidad (Safari: sticky, `@property`, WebP/JPEG al subir), pero conviene una revisión manual en iPhone (Safari) y Android antes de difundir la web.
- Lighthouse se ejecutó contra el servidor local; los valores en Netlify (CDN, HTTP/2, compresión) suelen ser iguales o mejores.
