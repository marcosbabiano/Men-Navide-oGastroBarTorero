# Despliegue en Netlify

Este proyecto usa **Netlify Functions**, una **Edge Function**, **Netlify Blobs** y **Netlify Identity**. No hay que contratar ni configurar ninguna base de datos externa: Blobs viene incluido en Netlify y se activa solo.

> Los nombres de los menús de Netlify cambian con el tiempo. Si alguna opción no aparece con el mismo nombre, búscala en la documentación oficial: <https://docs.netlify.com>.

---

## Opción A (recomendada): desde Git

1. Sube el proyecto a un repositorio de GitHub, GitLab o Bitbucket (por ejemplo, el repositorio actual).
2. En Netlify: **Add new project → Import an existing project** y elige el repositorio.
3. Netlify detecta `netlify.toml`. Comprueba que aparece:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
4. Pulsa **Deploy**. Cada `git push` a la rama principal publicará una nueva versión del **código**. El **contenido** editado en el panel no se toca con los despliegues.

## Opción B: con Netlify CLI (sin Git)

Desde una copia local del repositorio:

```bash
npm install
```

```bash
npx netlify-cli login
```

```bash
npx netlify-cli deploy --build --prod
```

La primera vez el CLI pregunta si quieres crear un proyecto nuevo: acepta. El CLI compila, empaqueta funciones y edge function y lo sube todo.

> No uses «Netlify Drop» (arrastrar una carpeta): solo sube archivos estáticos y el panel no funcionaría.

---

## Activar Netlify Identity y crear el primer administrador

> **Administrador previsto:** `gestion@marcosbabiano.com`. Por seguridad la contraseña **no se guarda en el código** (el repositorio es público): se elige al aceptar la invitación de Identity (paso 5). Recomendado: usar una contraseña nueva y no compartida por chat.


Se hace **una sola vez**, después del primer despliegue.

1. **Activar Identity**: en el proyecto, **Project configuration → Identity → Enable Identity**.
2. **Solo por invitación**: en Identity → **Registration preferences** elige **Invite only**. Así nadie puede registrarse por su cuenta.
3. (Recomendado) Deja desactivados los proveedores externos (Google, GitHub…) salvo que los necesites.
4. **Invitar**: pestaña **Identity → Invite users** → escribe tu correo.
5. **Aceptar la invitación**: abre el correo y pulsa el enlace. Llegarás a la web y se te redirigirá automáticamente a `/admin`, donde verás **«Activa tu cuenta»**. Crea una contraseña (mínimo 10 caracteres).
6. **Dar permisos de administrador** (elige una de las dos):
   - **Rol (recomendado)**: en Netlify, **Identity → (tu usuario) → Edit settings / Roles** y añade el rol `admin`. Guarda. Cierra sesión en `/admin` y vuelve a entrar.
   - **Variable de arranque**: en **Project configuration → Environment variables** crea `ADMIN_EMAILS` con tu correo (varios separados por comas), con alcance *Functions*. **Haz un nuevo despliegue** (las variables se aplican al desplegar). Útil si aún no ves la opción de roles. Cuando el rol esté asignado puedes borrarla.
7. Entra en `https://TU-SITIO/admin`. Si ves «Sin permisos de administración», el paso 6 aún no se ha aplicado.

Para añadir más personas: repite los pasos 4–6 con su correo. Para quitar el acceso: elimina el usuario en Identity (o el rol `admin`).

**Recuperar contraseña**: en `/admin` pulsa «¿Has olvidado tu contraseña?». El correo de recuperación también se redirige al panel.

> El servidor comprueba el rol en **cada** petición de administración validando la sesión con la API de Identity. El navegador no decide nada: aunque alguien manipule la web, sin rol `admin` las funciones responden 401/403.

---

## Comprobar que Netlify Blobs funciona

1. Abre `https://TU-SITIO/api/health`. Debe responder algo como:
   ```json
   { "ok": true, "storage": "netlify-blobs", "published": false, "publishedAt": null }
   ```
   `published: false` es normal antes de la primera publicación.
2. Entra en `/admin`, pulsa **Publicar** (el contenido inicial ya está cargado).
3. Vuelve a `/api/health`: ahora `published: true`.
4. En Netlify, la sección **Blobs** del proyecto mostrará los almacenes `torero-content` (contenido, borrador, historial) y `torero-media` (imágenes subidas).
5. Prueba de persistencia: cambia un precio, publica y haz un nuevo despliegue (Deploys → Trigger deploy). El precio cambiado sigue en la web.

---

## Comprobaciones tras el primer despliegue

- [ ] `/` carga la intro y la portada; la segunda visita no repite la intro.
- [ ] Cualquier botón «Reservar» abre Qamarero en una pestaña nueva.
- [ ] `/admin` exige iniciar sesión; un usuario sin rol ve «Sin permisos».
- [ ] Cambia un texto, **Guardar** → **Vista previa** (muestra el borrador) → **Publicar** → la web lo muestra al recargar.
- [ ] Al compartir el enlace por WhatsApp aparece la imagen y el título (puede tardar en refrescarse la caché de WhatsApp).
- [ ] `/robots.txt` y `/sitemap.xml` muestran tu dominio.
- [ ] `/reservar`: completar una elección de prueba → referencia → «Continuar a Qamarero». En `/admin` → Reservas aparece «Pendiente de confirmación». Procesa manualmente un correo real de Qamarero (Reservas → Correo) y revisa la interpretación.
- [ ] `/pantalla` reproduce la programación; en `/admin/pantallas` → Televisiones se vincula una TV con su código y el Panel de control la muestra **Conectada**; «Activar Fiesta» se ve en la TV y pasa a «Confirmado por la TV» (ver `docs/PANTALLAS.md`).

## Dominio propio

En **Domain management** añade el dominio. No hay que cambiar nada en el código: robots, sitemap, Open Graph y URL canónica usan el dominio con el que se visita la web.

## Variables de entorno

| Variable | Obligatoria | Uso |
| --- | --- | --- |
| `ADMIN_EMAILS` | No | Correos con acceso de administrador aunque no tengan el rol (arranque). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Para leer Gmail | Credenciales OAuth de la aplicación (ver `docs/RESERVAS.md`). |
| `INBOUND_EMAIL_SECRET` | Para webhook de correo | Secreto del webhook de correo entrante. |

No hay contraseñas ni claves en el repositorio. Netlify inyecta automáticamente las credenciales de Blobs e Identity en las funciones.

## Caché y publicación instantánea

La portada y `/api/content` se sirven desde la CDN de Netlify con la etiqueta `torero-content`. Al publicar, la función purga esa etiqueta, de modo que el cambio se ve en segundos. Si la purga fallase, la caché caduca sola a los 5 minutos como máximo.

## Pendiente de verificar en la cuenta real

Estas piezas están construidas y probadas localmente (ver `docs/INFORME-DE-PRUEBAS.md`), pero dependen de servicios que solo existen en Netlify:

- Activación de Identity, envío de correos de invitación y asignación de roles.
- Ejecución de la Edge Function `landing` y su lectura de Blobs (empaquetada correctamente con Netlify CLI; si fallase, la web sigue funcionando y carga el contenido desde `/api/content`).
- Purga de caché por etiqueta al publicar.
- Límites de peticiones (`rateLimit`) configurados en las funciones, según el plan contratado.
- Purga por etiqueta de las respuestas de las pantallas (`torero-signage`, `torero-screen-<id>`) y consumo de ejecuciones del latido de las televisiones (ver `docs/PANTALLAS.md`).
