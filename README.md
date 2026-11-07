# GastroBar Torero · Navidad 2026

Web de la campaña de Navidad de **GastroBar Torero** (Fuenlabrada de los Montes, Badajoz) con **panel de administración privado** en `/admin`.

- **Landing** cinematográfica (intro, portada, «La Navidad se comparte», menús, comparativa, celebración, cómo reservar, preguntas frecuentes, sobre nosotros y pie) diseñada primero para móvil.
- **Panel `/admin`** con Netlify Identity: **secciones** (ordenar, mostrar/ocultar, eliminar y crear bloques con 8 plantillas), menús (crear, duplicar, reordenar arrastrando, ocultar, eliminar), textos, establecimiento y horarios, imágenes, campaña/colores/ornamentos/SEO, vista previa, publicación e historial.
- **Estudio Creativo — Redes Sociales** en el panel: editor visual (Konva) con 10 plantillas de la campaña, formatos de Instagram (4:5, 1:1, 9:16, carrusel y personalizado), datos vinculados a los menús publicados, diseños guardados y exportación PNG/JPG/PDF a tamaño real.
- **Contenido persistente** en Netlify Blobs: los cambios se publican **sin tocar código ni redesplegar** y sobreviven a nuevos despliegues.
- **Reservas** en la plataforma externa existente (Qamarero). Todos los botones enlazan a `https://booking.qamarero.com/new-reservation/bar-torero` (editable).

> ⚠️ Esta web **no es un HTML estático**: el panel necesita Netlify Functions, Edge Functions, Blobs e Identity. Despliégala con Git o con Netlify CLI (ver abajo). Arrastrar solo la carpeta `dist/` a Netlify Drop dejaría la web visible pero **sin panel ni contenido editable**.

---

## Índice de documentación

| Documento | Para qué |
| --- | --- |
| [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md) | Publicar en Netlify paso a paso, activar Identity, crear el primer administrador y comprobar Blobs. |
| [`docs/GUIA-DEL-PANEL.md`](docs/GUIA-DEL-PANEL.md) | Uso diario del panel (incluye **cómo añadir el tercer menú**). |
| [`docs/PENDIENTES.md`](docs/PENDIENTES.md) | Datos comerciales y configuraciones pendientes de confirmar. |
| [`docs/ARQUITECTURA-Y-SEGURIDAD.md`](docs/ARQUITECTURA-Y-SEGURIDAD.md) | Arquitectura técnica, API, modelo de datos y medidas de seguridad. |
| [`docs/INFORME-DE-PRUEBAS.md`](docs/INFORME-DE-PRUEBAS.md) | Pruebas ejecutadas y resultados. |
| [`docs/PROMPT-MAESTRO-CHATGPT.md`](docs/PROMPT-MAESTRO-CHATGPT.md) | **Prompt maestro** para generar la colección de ilustraciones en ChatGPT y cómo integrarla. |
| [`ASSETS-PENDIENTES.md`](ASSETS-PENDIENTES.md) | Resumen de recursos visuales pendientes. |
| [`CREDITOS-IMAGENES.md`](CREDITOS-IMAGENES.md) | Origen y licencia de las imágenes incluidas. |

---

## Puesta en marcha rápida (resumen)

1. El código vive en GitHub (`marcosbabiano/Men-Navide-oGastroBarTorero`). Vincula el repositorio en Netlify con **Add new project → Import an existing project** (la configuración se lee de `netlify.toml`); cada `git push` a la rama vinculada publica automáticamente.
2. En Netlify activa **Identity**, pon el registro en **Invite only** e invítate.
3. Abre el correo de invitación, crea tu contraseña y asígnate el rol **`admin`** en Netlify (o usa la variable `ADMIN_EMAILS`).
4. Entra en `https://TU-SITIO/admin`, revisa el contenido y pulsa **Publicar**.

Los detalles (y la alternativa con Netlify CLI) están en [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md).

---

## Desarrollo local

Requisitos: Node.js 20.12+ (recomendado 22).

```bash
npm install
```

```bash
npm run build
```

```bash
npm run local
```

Abre `http://localhost:8888` (web) y `http://localhost:8888/admin` (panel).

`npm run local` arranca un **servidor de desarrollo que imita a Netlify**: usa el cliente real de Netlify Blobs contra un almacenamiento local en `.local-data/`, ejecuta los mismos manejadores de API que las funciones, inyecta el SEO como la Edge Function y emula Netlify Identity con dos usuarios de prueba (solo existen en local, nunca se despliegan):

| Usuario | Contraseña | Rol |
| --- | --- | --- |
| `admin@torero.local` | `torero-local-2026` | admin |
| `editor@torero.local` | `torero-local-2026` | sin rol (para probar el acceso denegado) |

Con `npm run dev` (Vite) puedes trabajar en el diseño de la landing con recarga en caliente; la landing usa el contenido inicial si la API no responde. El panel requiere `npm run local`.

### Scripts

| Script | Acción |
| --- | --- |
| `npm run build` | Comprobación de tipos + compilación de producción en `dist/`. |
| `npm run typecheck` | TypeScript estricto. |
| `npm run lint` | ESLint (TypeScript, hooks de React, accesibilidad jsx-a11y). |
| `npm test` | Pruebas unitarias y de integración de la API (Vitest + Blobs local). |
| `npm run test:e2e` | Pruebas de extremo a extremo con Playwright (landing, accesibilidad, panel). |
| `npm run check` | typecheck + lint + test + build. |
| `npm run images` | Regenera las variantes AVIF/WebP de las fotografías incluidas. |

---

## Estructura

```
├── index.html, admin.html        Entradas de la landing y del panel
├── netlify.toml                  Build, funciones, edge function y redirecciones
├── netlify/
│   ├── functions/                api-public (lectura), api-admin (privado), seo (sitemap/robots)
│   └── edge-functions/landing.ts SEO + contenido publicado inyectados en «/»
├── server/                       Lógica de la API (auth, repositorio Blobs, imágenes)
├── shared/                       Esquema validado (Zod), contenido inicial, comparativa, SEO
├── src/
│   ├── landing/                  Web pública (React + GSAP)
│   ├── admin/                    Panel /admin
│   └── styles/                   Fuentes, tokens de diseño
├── public/                       Fuentes, imágenes optimizadas, favicon, cabeceras (_headers)
├── scripts/                      Servidor local y preparación de imágenes
├── tests/                        unit/ (Vitest) y e2e/ (Playwright)
└── docs/                         Documentación
```

## Tecnologías

React 19 · TypeScript · Vite · GSAP 3 (ScrollTrigger + SplitText) · Konva (Estudio) · jsPDF · Netlify Functions (v2) · Netlify Edge Functions · Netlify Blobs · Netlify Identity (`@netlify/identity`) · Zod · dnd-kit · Vitest · Playwright · axe-core.

Sin analítica, sin cookies de seguimiento y sin servicios de terceros en la web pública (fuentes autoalojadas; Google Maps se abre como enlace, sin incrustar), por lo que **no necesita banner de cookies**.
