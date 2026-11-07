# Arquitectura y seguridad

## Visión general

```
Navegador ──► CDN Netlify ──► «/»  Edge Function landing ──► Blobs (contenido publicado)
                 │                    └─ inyecta SEO, Open Graph, JSON-LD y el contenido en el HTML
                 ├──► /api/content, /api/media/*, /api/health ─► Function api-public (solo lectura, cacheada)
                 ├──► /api/admin/*                            ─► Function api-admin  (Identity + rol admin)
                 ├──► /sitemap.xml, /robots.txt               ─► Function seo
                 └──► /admin → admin.html · /preview → index.html (archivos estáticos)
```

- **Frontend**: React 19 + TypeScript + Vite con dos entradas independientes: `index.html` (landing, ~13 KB gzip propios + React + GSAP) y `admin.html` (panel). El código del panel nunca se descarga en la web pública.
- **Animación**: GSAP 3 con ScrollTrigger y SplitText. Los componentes declaran intenciones (`data-anim="lines|words-scrub|fade-up|stagger|mask|rule|draw|chars"`, `data-parallax`) y `src/landing/anim/choreography.ts` las ejecuta con `gsap.matchMedia()`: solo `transform`, `opacity` y `clip-path`; parallax solo en escritorio; nada bloquea el scroll; todo el contenido es visible sin JavaScript o con `prefers-reduced-motion`.
- **Estructura**: `content.layout.sections` define orden, visibilidad y bloques personalizados de la landing. `shared/layout.ts` incluye la **migración no destructiva** que completa contenidos guardados con la versión anterior (al leerlos en servidor y Edge Function), respetando la comparativa si estaba oculta.
- **Sistema de diseño compartido**: `shared/brand.ts` (tipografías y ornamentos vectoriales propios) y la paleta de campaña los usan tanto la landing como el Estudio.
- **Estudio Creativo**: `src/admin/studio/` (Konva, cargado solo al abrirlo) con plantillas en `shared/studio-templates.ts` y modelo validado en `shared/studio.ts`. La exportación renderiza el mismo lienzo a escala 1 con las dimensiones exactas del formato; el PDF (jsPDF) se descarga solo al pedirlo.
- **Datos**: un único documento JSON validado con Zod (`shared/schema.ts`) y una proyección pública (`shared/public.ts`) que elimina notas internas, secciones pendientes, cantidades pendientes, horario no verificado y menús no publicados.

## Almacenamiento (Netlify Blobs)

Stores **de sitio** (`getStore`), que persisten entre despliegues, con **consistencia fuerte**:

| Store | Clave | Contenido |
| --- | --- | --- |
| `torero-content` | `content/draft` | Borrador `{ content, revision, updatedAt, updatedBy }` |
| | `content/published` | Versión publicada `{ …, publishedAt, publishedBy, sourceRevision }` |
| | `history/<fecha>-r<n>` | Versiones publicadas anteriores (máx. 30) |
| | `media/index` | Índice de imágenes subidas |
| | `designs/<id>` · `designs-index` | Diseños del Estudio Creativo y su listado con miniaturas |
| `torero-media` | `files/<id>` y `files/<id>@sm` | Imagen optimizada y miniatura |

- **Contenido inicial seguro**: si no existe borrador se crea con `onlyIfNew` a partir de lo publicado o, si no hay nada, del contenido inicial (`shared/seed.ts`). Nunca se sobrescribe un cambio posterior. La web pública muestra el contenido inicial sin escribir nada mientras no haya publicación.
- **Conflictos de edición**: cada guardado indica la revisión sobre la que se editó; si no coincide → `409`. Cuando Blobs devuelve ETag, la escritura es además condicional (`onlyIfMatch`).
- **Nunca** se escribe en el sistema de archivos de las funciones.

## API

| Método | Ruta | Acceso | Descripción |
| --- | --- | --- | --- |
| GET | `/api/content` | Público | Contenido publicado (cache CDN + etiqueta `torero-content`) |
| GET | `/api/media/:id[?v=sm]` | Público | Imagen subida (`immutable`) |
| GET | `/api/health` | Público | Comprueba Blobs |
| GET | `/api/admin/session` | Admin | Usuario actual |
| GET | `/api/admin/state` | Admin | Borrador, estado, imágenes y avisos |
| PUT | `/api/admin/draft` | Admin | Guardar borrador `{content, baseRevision}` |
| POST | `/api/admin/publish` | Admin | Publicar `{baseRevision}`; valida bloqueos y purga caché |
| GET | `/api/admin/preview[?drafts=1]` | Admin | Vista previa del borrador |
| GET | `/api/admin/history` | Admin | Historial |
| POST | `/api/admin/history/restore` | Admin | Restaurar versión en el borrador |
| POST | `/api/admin/media` | Admin | Subir imagen (multipart) |
| PATCH/DELETE | `/api/admin/media/:id` | Admin | Editar / eliminar imagen (no si está en uso en la web o en un diseño) |
| GET | `/api/admin/designs` | Admin | Diseños del Estudio (resumen y miniatura) |
| GET/PUT/DELETE | `/api/admin/designs/:id` | Admin | Abrir, guardar (validado) o eliminar un diseño |

## Seguridad

- **Autenticación real en el servidor**: `getUser()` de `@netlify/identity` valida el JWT (cabecera `Authorization` o cookie `nf_jwt`) contra la API de Identity en cada petición.
- **Autorización**: solo rol `admin` (`app_metadata.roles`) o correo incluido en `ADMIN_EMAILS` (variable del servidor). Sin rol → `403`; sin sesión → `401`.
- **Registro solo por invitación** (configuración de Identity).
- **CSRF**: todas las peticiones de administración exigen la cabecera `X-Torero-Admin: 1` (obliga a preflight CORS, que no se concede a otros orígenes) y las de escritura exigen `Origin` igual al del sitio. La cookie de sesión es `SameSite=Lax; Secure`.
- **Validación**: todo lo que se guarda pasa por el esquema Zod en el servidor (longitudes máximas, enlaces solo `http(s)`, reservas solo `https`, caracteres de control prohibidos, colores con contraste mínimo, identificadores restringidos). Cuerpos JSON limitados a 600 KB y solo `application/json`.
- **XSS**: React escapa todo el contenido; no se usa `dangerouslySetInnerHTML`. El HTML inyectado por la Edge Function escapa atributos y serializa JSON neutralizando `<`, `>`, `&` y separadores de línea. Content-Security-Policy estricta (`script-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`…).
- **Subida de imágenes**: firma binaria comprobada (JPEG, PNG, WebP, AVIF), dimensiones reales leídas en el servidor, tamaño máximo 4 MB, SVG/HTML rechazados, se sirven con `nosniff`, CSP `sandbox` y tipo detectado (no el declarado). Las imágenes en uso no se pueden borrar.
- **Abuso**: límites de peticiones por IP en las funciones (`rateLimit`: 120/min en administración, 400/min en lectura). Las respuestas públicas se sirven desde la CDN.
- **Cabeceras**: `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS, `COOP`; `/admin` y `/preview` con `noindex` y `no-store`.
- **Enlaces externos**: `target="_blank"` con `rel="noopener noreferrer"`.
- **Sin secretos en el repositorio**: Blobs e Identity usan las credenciales que Netlify inyecta en tiempo de ejecución.
- **Privacidad**: sin analítica ni cookies de seguimiento; fuentes autoalojadas; Google Maps solo como enlace.

## Rendimiento

- Imágenes en AVIF + WebP con `srcset` (640/1280/1920 px), marcador LQIP, `loading="lazy"` y prioridad alta solo en la portada.
- Fuentes autoalojadas y precargadas; el titular se compone cuando la fuente está lista (CLS 0).
- Animaciones de scroll preparadas en un momento ocioso (`requestIdleCallback`).
- HTML de la portada con el contenido ya inyectado: sin petición adicional para pintar.
