# Reservas de Navidad: elección de menús, Qamarero, correo, WhatsApp y cocina

**Qamarero sigue siendo el sistema oficial de reservas.** Esta aplicación gestiona lo gastronómico (qué menú y qué platos toma cada comensal), lo relaciona con las reservas de Qamarero, y prepara la cocina y los informes. No es una segunda agenda.

Tres principios que se ven en todo el panel:

1. **Una selección gastronómica no equivale a una reserva confirmada.**
2. **Una modificación en nuestra web no equivale a una modificación aceptada por Qamarero.**
3. **Una confirmación antigua por email no garantiza que la reserva siga vigente.**

| Qué | Dónde |
| --- | --- |
| Formulario público | `https://TU-WEB/reservar` (todos los botones «Reservar» de la web llevan aquí) |
| Panel | `https://TU-WEB/admin/reservas` (o *Reservas* en el menú del panel) |
| Enlaces privados | `/reservar/modificar/<token>` y `/reservar/completar/<token>` |

---

## 1. Flujo del cliente

1. **Datos**: titular, teléfono, correo, comida o cena, adultos y niños (calcula el total). No pide fecha, hora ni zona: eso se elige después en Qamarero. Se indica claramente que todavía no se reserva mesa.
2. **Menú de los adultos**: todos los adultos comparten el mismo menú (regla obligatoria, validada también en el servidor). Los menús, precios y platos salen del gestor de menús; solo aparecen los publicados (el Selección Gourmet aparecerá cuando lo publiques con precio).
3. **Niños**: cada niño elige **carta habitual** («Carta habitual — elección en el restaurante», sin platos ni precio) o cualquier menú navideño permitido. Sin descuentos supuestos. Se puede enviar solo con niños.
4. **Platos**: una ficha por comensal (nombre opcional: «Adulto 1», «Niño 2»…). Solo se eligen los grupos «a elegir» del menú (Esencia y Distinción: principal; Gourmet: primero y segundo); los entrantes compartidos no se eligen. Herramientas para grupos: aplicar un plato a todos los adultos, copiar del comensal anterior, contador de completados, fichas plegables y lista de pendientes.
5. **Notas**: alergias e intolerancias del grupo y de cada comensal, necesidades del servicio y observaciones. Aviso: las necesidades especiales las revisa y confirma el restaurante.
6. **Revisión**: todo el resumen e **importe orientativo** de los menús con precio publicado (no incluye la carta). No deja continuar si falta algo y dice qué falta.
7. **Guardar** (validación en servidor, referencia corta `TOR-XXXXX`, estado «Pendiente de confirmación») → pantalla «Ya tenemos la elección de vuestros menús…» → **CONTINUAR A QAMARERO**.

**Referencia cruzada:** Qamarero no documenta públicamente parámetros para precargar datos en su página de reservas, así que no se añaden parámetros inventados. La pantalla final muestra la referencia con un botón «Copiar» y pide pegarla en el campo de observaciones/comentarios de Qamarero si existe. Si aparece en el correo de confirmación, la vinculación es exacta.

Privacidad: casilla de consentimiento con texto editable, campo trampa contra robots y límite de peticiones. El borrador del formulario se guarda solo en el navegador del cliente hasta que lo envía.

## 2. Correos de Qamarero (sincronización)

En Qamarero se pueden configurar **varias direcciones** para recibir los avisos de reservas online: añade un **buzón dedicado** de GastroBar Torero. Después elige **una** de estas opciones en *Reservas → Correo*:

### Opción 1 · Gmail con OAuth (recomendada si el buzón es de Gmail/Google Workspace)
- Permiso mínimo: **solo lectura** (`gmail.readonly`). No se usa ninguna contraseña.
- Una **función programada** de Netlify revisa el buzón **cada 10 minutos** (no es tiempo real) con la búsqueda configurable `from:(qamarero) newer_than:30d`. También hay un botón «Sincronizar ahora».
- Configuración (una vez):
  1. En [Google Cloud Console](https://console.cloud.google.com/): crea un proyecto → *APIs y servicios* → habilita **Gmail API**.
  2. *Pantalla de consentimiento OAuth*: tipo «Interno» si es Google Workspace (o «Externo» en modo de prueba añadiendo el buzón como usuario de prueba). Ámbito: `https://www.googleapis.com/auth/gmail.readonly`.
  3. *Credenciales* → *ID de cliente OAuth* → «Aplicación web». URI de redirección autorizada: `https://TU-WEB/api/reservas/gmail/callback`.
  4. En Netlify → *Project configuration → Environment variables*: `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` (alcance *Functions*). **Nuevo despliegue.**
  5. En `/admin` → *Reservas → Correo* → **Conectar Gmail** y autoriza con el buzón dedicado.
- El token de actualización se guarda en Netlify Blobs (store `torero-reservas`), nunca en el código ni en el navegador. «Desconectar» lo borra.

### Opción 2 · Webhook de correo entrante
Para servicios como Postmark Inbound, que reenvían cada correo a una URL:
- URL: `https://TU-WEB/api/reservas/inbound`
- Variable de entorno `INBOUND_EMAIL_SECRET` (valor largo y aleatorio). Autenticación: Basic Auth con ese valor como contraseña (p. ej. `https://torero:SECRETO@TU-WEB/api/reservas/inbound`) o cabecera `X-Torero-Inbound-Token`.
- Formato admitido: JSON de Postmark (`MessageID`, `From`, `Subject`, `Date`, `TextBody`, `HtmlBody`) o genérico (`messageId`, `from`, `subject`, `date`, `text`, `html`).

### Opción de respaldo · Procesar manualmente
*Reservas → Correo → Procesar un correo manualmente*: pega el texto o HTML de un correo (por ejemplo reenviado). Sirve también para **probar el intérprete con correos reales** antes de la campaña.

### Cómo se interpreta un correo
- **Determinista**, sin IA y sin enviar datos a terceros: busca etiquetas habituales («Localizador», «Nombre», «Teléfono», «Email», «Fecha», «Hora», «Personas/Comensales», «Zona/Sala», «Menú», «Observaciones», «Estado») en HTML o texto, en formato «Etiqueta: valor», tablas o etiqueta y valor en líneas separadas, con patrones de respaldo («para 6 personas», «24 de diciembre», «a las 14:00»…). Tipo de aviso por el asunto/texto: nueva, modificada, cancelada.
- **No inventa**: lo que no encuentra queda pendiente. El registro de correos muestra, para cada uno, los campos reconocidos y los que faltan (auditoría).
- **Idempotente**: cada correo tiene una clave estable (Message-ID o huella del contenido) que se registra antes de procesarlo; si llega dos veces, no se duplica nada.
- Solo se procesan remitentes autorizados (configurable).
- ⚠️ **El formato real de los correos de Qamarero no se ha podido comprobar** (no había correos reales disponibles). Las pruebas usan ejemplos. Antes de la campaña, procesa manualmente 2–3 correos reales y revisa la interpretación; si algún dato no se reconoce, se ajustan las etiquetas.

## 3. Vinculación correo ↔ elección de menús
Por prioridad:
1. **Referencia** `TOR-XXXXX` en el correo → vinculación exacta (salvo contradicción evidente: teléfono y nombre distintos).
2. **Localizador de Qamarero** ya vinculado antes → se actualiza ese registro (modificaciones y cancelaciones).
3. **Coincidencia de datos**: teléfono normalizado (50), correo (30), nombre (15), comensales (10), servicio (5) y cercanía temporal (5). Solo es automática si supera la puntuación mínima (70 por defecto), es única (25 puntos sobre la siguiente) y **sin contradicciones** (comensales o servicio distintos). Si no, el registro queda **«Pendiente de revisar coincidencia»** y la ficha muestra las candidatas con qué coincide y qué no; tú eliges «Es esta». Nunca se mezclan elecciones de clientes distintos.

Si los comensales de Qamarero no coinciden con los del formulario se crea una **incidencia**; nada se corrige solo.

## 4. Estados
- **Gastronómico**: Pendiente · Completo · Modificado · Requiere revisión · Cancelado.
- **Qamarero**: Pendiente de confirmación · Confirmación recibida por email · Vinculada manualmente · Modificación notificada · Cancelación notificada · Cancelada manualmente · Pendiente de comprobar · Incidencia.
- **Verificación** (para cocina): *Verificada* solo si alguien la comprobó con Qamarero en los últimos N días (configurable, 3 por defecto); si no, «Confirmación por email sin revisión reciente». La ficha muestra última notificación, origen de los datos y última comprobación manual.

### Cambios y cancelaciones sin correo
Qamarero puede cambiar o cancelar sin avisar. *Reservas → Revisar con Qamarero* lista lo que conviene comprobar con botones «Sigue vigente», «Cancelada» y «Corregir datos». También permite **importar un CSV** (exportación o copia de Qamarero; no se ha encontrado documentación de una exportación oficial, por eso las columnas se asignan a mano): propone los cambios fila a fila (fecha, hora, zona, personas, cancelación, reservas nuevas y reservas que faltan en la exportación) y solo aplica los que marques. Nunca toca los platos.

## 5. WhatsApp y enlaces privados
- Ficha → **Enviar enlace de modificación por WhatsApp** (o **Solicitar elección de menús** si la reserva llegó por correo sin formulario). Permite corregir el número (normalizado a +34 si es español), genera un enlace privado, prepara el mensaje (plantilla editable en Configuración, sin alergias ni datos personales) y abre `wa.me`. **No se envía nada automáticamente**: tú pulsas enviar en WhatsApp.
- **Un solo uso**: el cliente puede cambiar todo lo gastronómico (comensales, menú común, menús de niños, carta/menú, platos, nombres, notas y alergias) y lo guarda una vez. Abrir el enlace no lo consume; guardar sí, de forma **atómica** (dos envíos simultáneos: solo uno pasa).
- Token aleatorio de 256 bits; en el servidor solo se guarda su huella. Caducidad configurable (7 días por defecto), revocable, ligado a una reserva. Generar uno nuevo revoca los anteriores.
- **Plazo límite** configurable (hora de Madrid); el panel puede autorizar excepcionalmente un enlace fuera de plazo.
- Enlace usado → «Solicitar una nueva modificación» (motivo opcional) → aparece en *Reservas → Solicitudes* con botón para generar enlace y abrir WhatsApp.
- **Cambio de comensales**: se guarda la nueva elección, pero la reserva oficial no cambia: aparece «Cambio de comensales pendiente de confirmar en Qamarero» (solicitados ≠ confirmados) en ficha, día, cocina e informes, hasta que confirmes «Ya está actualizado en Qamarero», corrijas la cantidad o lo marques como rechazado.

## 6. Panel
*Resumen* (recibidas por email, vinculadas, preselecciones sin reserva, verificadas, con incidencias, canceladas, solicitudes, platos pendientes, alergias, comensales, menús y última sincronización) · *Reservas* (búsqueda, filtros, orden y paginación) · *Ficha* (datos, elecciones por comensal, alertas, vinculación, enlaces, historial, imprimir/PDF, cancelar, eliminar) · *Por día* (comidas y cenas por hora, agrupables por zona, con resumen) · *Cocina e informes* · *Revisar con Qamarero* · *Correo* · *Solicitudes* · *Configuración*.

Todo cambio importante queda en el **historial** de la reserva con fecha, autor, origen (formulario, correo, enlace, restaurante, importación) y datos anteriores/nuevos.

## 7. Cocina e informes
- Cantidades calculadas con las elecciones reales: menús, platos a elegir (principal, primero, segundo…), entrantes compartidos, postres, bebida, niños con carta, alergias y observaciones.
- **Entrantes compartidos**: si el menú indica «N por persona» se calcula; si configuras «1 ración cada N comensales» también; si no, se indica cuántos comensales corresponden y la producción queda **pendiente de definir** (no se inventan gramos ni raciones).
- Las canceladas no cuentan. Por defecto entran las reservas vinculadas no canceladas aunque no estén verificadas (marcadas); se puede limitar a verificadas. Las preselecciones sin reserva confirmada no se incluyen.
- **Informes A4** (ventana de impresión propia y **PDF**): A · Resumen del servicio, B · Producción de cocina, C · Desglose por reserva, D · Cambios pendientes. Por fecha o intervalo y comida, cena o ambos. Las reservas no se cortan entre páginas cuando cabe. **CSV** (Excel en español) de reservas, comensales y producción.
- Tras imprimir o descargar, si una reserva cambia aparece **«Hay modificaciones posteriores a la última impresión»** con el detalle.

## 8. Seguridad y privacidad
- Datos en un store separado de Netlify Blobs (`torero-reservas`), persistente entre despliegues. Escrituras con control de concurrencia (compare-and-set) para no perder cambios simultáneos.
- Panel: Netlify Identity con rol `admin` + protección CSRF en cada petición. El cliente solo accede a su propia reserva mediante su token.
- Las URLs de WhatsApp solo contienen el token, ninguna otra información personal. La página `/reservar` no envía *referrer* (el token no se filtra a otras webs).
- Los informes de cocina solo incluyen lo necesario para preparar y servir.
- Conservación configurable (90 días tras la fecha por defecto) con botón de eliminación de datos caducados, y eliminación individual desde la ficha.
- Ninguna clave en el repositorio: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `INBOUND_EMAIL_SECRET` van en variables de entorno de Netlify.

## 9. Variables de entorno nuevas (Netlify)
| Variable | Obligatoria | Uso |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Para Gmail | Credenciales OAuth de la aplicación (no del buzón). |
| `INBOUND_EMAIL_SECRET` | Para webhook | Secreto compartido con el servicio de correo entrante. |

## 10. Limitaciones conocidas
- Sin correos reales de Qamarero no se ha podido verificar su formato exacto (ver apartado 2).
- Qamarero no ofrece (según su documentación pública) parámetros para precargar la referencia ni una exportación CSV documentada.
- La sincronización con Gmail es periódica (10 min), no instantánea; las funciones programadas de Netlify solo se ejecutan en el despliegue publicado.
- Excel: se exporta CSV compatible (no `.xlsx` nativo).
