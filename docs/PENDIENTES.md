# Información y configuraciones pendientes

Nada de lo siguiente se ha inventado. Todo se puede completar desde `/admin` sin tocar código. El panel muestra estos puntos en **Inicio → Información pendiente**.

## Menús

| Dato | Estado actual en la web | Dónde se completa |
| --- | --- | --- |
| Precio del Menú Esencia (36 €) | Se muestra «36 € por persona». Marcado como **pendiente de confirmación** en el panel. | Menús → Menú Esencia → Precio → «Precio confirmado» |
| Precio del Menú Distinción (45 €) | Se muestra «45 € por persona». Pendiente de confirmación. | Menús → Menú Distinción → Precio |
| Canelón de foie y trufa: ¿por persona o ración? | Se muestra sin cantidad. | Menú Esencia → Entrantes → Canelón → Cantidad y desactivar «Cantidad pendiente» |
| Sabores de las croquetas | Solo «Una de cada especialidad · 3 por persona». | Menú Esencia → Entrantes → Croquetas → Descripción |
| Salsa del bacalao | Solo «Bacalao en salsa». | Menú Esencia → Principal |
| Tipos/límites de la bebida del Menú Esencia | Solo «Bebida incluida». | Menú Esencia → Bebida |
| Postre concreto del Menú Distinción | Se muestra «Para terminar · Postre» (incluido, sin especificar). | Menú Distinción → Para terminar → Postre |
| Bebida del Menú Distinción | «Bebida incluida» (sin cantidades ni condiciones). | Menú Distinción → Bebida |
| **Precio del Menú Selección Gourmet** | El menú está creado y completo, **en borrador**: no aparece en la web. No se puede marcar como publicado sin precio. | Menús → Menú Selección Gourmet → Precio y estado «Publicado» → Publicar |
| Imagen del Menú Selección Gourmet | Sin imagen: la web usa un fondo decorativo de la marca. | Menús → Menú Selección Gourmet → Imagen principal (ver pieza 12 del prompt maestro) |
| Condiciones adicionales (IVA, mínimos, cancelación…) | No se muestra ninguna. | Menús → (menú) → Condiciones adicionales |

## Establecimiento

| Dato | Estado | Dónde |
| --- | --- | --- |
| Dirección «C. Glorieta del Tejar, 32, 06660 Fuenlabrada de los Montes, Badajoz» | Se muestra; **pendiente de verificar**. No se incluye en los datos estructurados de Google hasta marcarla como verificada. | Local → Dirección → «Dirección verificada» |
| Teléfono +34 617 55 04 11 | Se muestra; pendiente de verificar (igual que la dirección). | Local → «Teléfono verificado» |
| Horario (vie–dom 12:00–02:30, de directorios externos) | **No se muestra**. En su lugar: «Consulta nuestro horario de Navidad llamándonos al…». | Local → Horario → «Horario confirmado» |
| Horarios especiales de Navidad | Ninguno. | Local → Horarios especiales |
| Redes sociales | Ocultas (ninguna confirmada). | Local → Redes sociales |
| Correo electrónico | Vacío (no se muestra). | Local → Datos del establecimiento |
| Enlace exacto de Google Maps | Se usa una búsqueda con la dirección. | Local → Enlace de Google Maps |
| Texto legal (titular, NIF…) | Vacío. La LSSI-CE exige identificar al titular de la web. | Textos → Sobre nosotros y pie → Texto legal |

## Reservas

- Enlace: `https://booking.qamarero.com/new-reservation/bar-torero` (editable en **Local → Reservas**).
- **No se ha comprobado** que Qamarero permita indicar o preseleccionar un menú, ni se añaden parámetros a la URL. Por eso la web muestra un aviso editable: «Cuando hagas tu reserva, recuerda indicarnos qué menú habéis elegido…». Ajusta el texto cuando sepáis cómo preferís recibir esa información (campo de observaciones, llamada, etc.).

## Imágenes

Todas las fotografías actuales son **ilustrativas** (Unsplash) y la web lo indica («Imágenes ilustrativas»; nota en el pie). Ver `ASSETS-PENDIENTES.md` para la lista de fotografías reales recomendadas.

## Netlify (verificación en la cuenta real)

Ver el apartado «Pendiente de verificar en la cuenta real» de `docs/DESPLIEGUE.md`: activación de Identity e invitaciones, roles, Edge Function en producción, purga de caché y límites de peticiones.
