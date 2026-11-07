# Guía del panel `/admin`

El panel funciona en ordenador, iPad y móvil. Todo lo que cambies se guarda primero como **borrador** y solo llega a la web cuando pulsas **Publicar**.

## El flujo de trabajo

1. **Edita** en cualquier sección. Arriba verás «Cambios sin guardar».
2. **Guardar** (o `Ctrl/Cmd + S`): guarda el borrador en el servidor.
3. **Vista previa**: abre en otra pestaña la web tal como quedará (con el banner «Vista previa del borrador»). Puedes marcar «Incluir menús en borrador».
4. **Publicar**: confirma y la web pública se actualiza en segundos, sin desplegar nada.
5. Abre la web y comprueba el resultado.

Si otra persona guarda mientras tú editas, verás un aviso de conflicto: recarga para trabajar sobre la última versión.

## Secciones

| Sección | Qué puedes hacer |
| --- | --- |
| **Inicio** | Menús publicados, en borrador y ocultos; información pendiente; estado de la página; última publicación; accesos rápidos. |
| **Menús** | Crear, editar, duplicar, ocultar/mostrar, eliminar y **reordenar arrastrando** (o con las flechas ↑↓). |
| **Textos** | Portada, intro, navegación, todas las secciones, comparativa, celebración, pasos de reserva, **preguntas frecuentes** y pie. |
| **Local** | Enlace de reservas y aviso para indicar el menú, datos de contacto, dirección, redes, **horario semanal y especiales de Navidad**. |
| **Imágenes** | Subir (se optimizan solas), cambiar texto alternativo y carpeta, eliminar las que no estén en uso. |
| **Campaña** | Nombre y año, activar/desactivar la campaña, intro, mensaje destacado, **colores** (con comprobación de contraste), logotipo, favicon, SEO e imagen para compartir. |
| **Publicar** | Pasos guiados, lo que bloquea la publicación, lo pendiente e **historial** para restaurar versiones anteriores. |

## Reglas para el contenido de los menús

- **Entrantes** (tipo «Entrantes para compartir») se muestran siempre como platos al centro de la mesa, nunca como alternativas.
- **Principal** (tipo «Plato a elegir») se muestra como opciones: cada comensal elige uno.
- Marca **«Pendiente de confirmar»** en una sección (p. ej. postre o bebida aún no decididos) y no aparecerá en la web ni en la comparativa.
- Marca **«Cantidad pendiente de confirmar»** en un plato (p. ej. el canelón) y su cantidad no se mostrará.
- **«Precio confirmado»** es un control interno: el precio se muestra igualmente, pero el panel te recordará confirmarlo.
- Las **notas internas** nunca se publican.
- La **comparativa** se genera sola con lo publicado. No hay que mantenerla aparte.

## Cómo añadir el tercer menú

1. **Menús → + Nuevo menú** (o «+ Nuevo menú» en Inicio). Se crea en **Borrador** con las secciones Entrantes, Principal, Postre (pendiente) y Bebida (pendiente) vacías: no se inventa ningún plato ni precio.
2. Escribe el **nombre comercial**, subtítulo, descripción y **precio**.
3. Elige la **identidad visual** (Marfil, Noche, Burdeos o Verde abeto) y la **imagen principal**.
4. En **Platos**, añade los entrantes y los principales. Cuando confirmes postre y bebida, desactiva «Pendiente de confirmar» y añade los platos.
5. Revisa «Antes de publicar»: los avisos en rojo impiden publicar (p. ej. falta el precio).
6. Cambia el estado a **Publicado**, pulsa **Vista previa** y, si todo está bien, **Publicar**.
7. La web se adapta sola: aparece el menú III, se añade al selector móvil y a la comparativa (que pasa a tres columnas).

Para partir de uno existente usa **Duplicar**: la copia se crea en borrador.

## Horarios

- Activa **«Horario confirmado: mostrar en la web»** solo cuando el horario esté verificado. Mientras tanto se muestra el mensaje alternativo («Consulta nuestro horario de Navidad llamándonos…»).
- Los días con el mismo horario consecutivos se agrupan automáticamente (p. ej. «Viernes – Domingo · 12:00–02:30»).
- **Horarios especiales**: añade Nochebuena, Navidad, Nochevieja, etc. con su fecha, tramos o «Cerrado». Solo se muestran los de hoy en adelante.

## Imágenes

- Formatos: JPG, PNG, WebP o AVIF (y HEIC si tu navegador puede leerlo). Se redimensionan a un máximo de 2000 px y se comprimen en tu navegador antes de subir (normalmente 150–600 KB).
- Escribe siempre el **texto alternativo** (descripción breve de la imagen).
- Las imágenes se guardan en Netlify Blobs y **no se pierden con nuevos despliegues**.
- No se puede eliminar una imagen que esté en uso (en el borrador o en la web publicada).
- Las fotografías incluidas son **ilustrativas** (Unsplash) y la web lo indica. Sustitúyelas por fotografías reales cuando las tengas (ver `ASSETS-PENDIENTES.md`).

## Textos con datos automáticos

En los textos puedes escribir estos marcadores y se sustituyen solos:

| Marcador | Resultado |
| --- | --- |
| `{telefono}` | Teléfono del establecimiento |
| `{direccion}` | Dirección completa |
| `{año}` | Año de la campaña |
| `{precioDesde}` | Precio del menú publicado más económico |
| `{nombre}` | Nombre del establecimiento |

## Historial

Cada publicación guarda la versión anterior (las 30 últimas). En **Publicar → Historial** pulsa «Restaurar en el borrador»: el borrador se sustituye por esa versión y la web **no cambia** hasta que vuelvas a publicar.
