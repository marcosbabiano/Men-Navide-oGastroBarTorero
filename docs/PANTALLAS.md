# Pantallas digitales y control remoto

Sistema de cartelería para las televisiones del local: un **reproductor** (`/pantalla`) que se abre en Chrome en un portátil (o mini PC) conectado a la TV por HDMI, y un **Gestor de Pantallas** en el panel (`/admin/pantallas`) para preparar escenas, programarlas por horarios y controlar cada televisión desde el móvil.

Todo usa la misma infraestructura de la web: Netlify Functions, Netlify Blobs (store `torero-content`), Netlify Identity y la biblioteca de imágenes de siempre. No hay otra base de datos ni otro gestor de imágenes.

---

## 1. Puesta en marcha rápida (portátil + HDMI + Chrome)

1. Conecta el portátil a la televisión con un cable HDMI. En Windows pulsa `Win + P` → **Solo segunda pantalla** (o **Duplicar**); en macOS, Ajustes del Sistema → Pantallas.
2. Abre **Google Chrome** y entra en `https://TU-WEB/pantalla`.
3. Pulsa **Iniciar reproductor** (activa la pantalla completa). Si no pulsas nada, el aviso se cierra solo y la reproducción sigue igualmente.
4. Para controlarla desde el móvil, vincúlala (punto 2).

Atajos en el reproductor: **F** = pantalla completa. Al mover el ratón aparecen unos controles discretos (pantalla completa, vincular/estado); el cursor se oculta solo a los pocos segundos.

### Pantalla extendida
Si el portátil usa la TV como **segunda pantalla extendida**, arrastra la ventana de Chrome a la TV antes de pulsar «Iniciar reproductor» (o usa el lanzador, que abre Chrome en modo quiosco en la pantalla principal: en ese caso pon la TV como pantalla principal o usa «Solo segunda pantalla»).

## 2. Vincular una televisión

1. En la TV: `/pantalla` → **Vincular esta pantalla** (o abre directamente `/pantalla?vincular=1`). Aparece un código de 6 caracteres que caduca a los 10 minutos (se renueva solo).
2. En el móvil u ordenador: `/admin/pantallas` → **Televisiones** → escribe el código y un nombre («TV barra») → **Vincular televisión**.
3. En unos segundos la TV queda vinculada y aparece **Conectada** en el Panel de control.

Cada televisión recibe un **token propio** que se guarda en ese navegador. En el servidor solo se guarda su huella (SHA-256). **Revocar acceso** invalida el token al instante: la TV vuelve a la programación general y deja de recibir órdenes. El código de vinculación nunca da acceso al panel.

Una pantalla **sin vincular** también funciona: reproduce la programación general (horarios que no están asignados a una televisión concreta), pero no se puede controlar a distancia ni aparece en el panel.

## 3. Control remoto (desde el móvil)

En **Panel de control**:

- Elige **Todas** o una o varias televisiones.
- **Activar Fiesta** (con el estilo elegido), **Activar Navidad**, **Activar Ambiente**, **Volver a automática**, **Pausar**, **Reanudar**, **Siguiente escena**, **Reiniciar reproductor**.
- **Duración del cambio manual**: hasta que lo cambies, 30 min, 1 h, 2 h o 4 h. Al acabar, la TV vuelve sola a la programación automática.
- En cada televisión ves: conexión real (último latido), última comunicación, modo, programación activa y horario, escena actual y siguiente (informadas por la propia TV), próximo cambio de horario, resolución detectada, calidad, FPS y **estado de las órdenes**: *Pendiente de confirmación* hasta que la TV informa de que la ha aplicado; entonces *Confirmado por la TV*.
- **Vista previa**: muestra en el móvil la escena que la TV dice estar reproduciendo.
- Desde el editor de una escena publicada: **Mostrar ahora en todas las TV**.

### Cómo se comunican (y coste en Netlify)
- La TV consulta sus órdenes cada **10 s** (configurable). Esa respuesta está **cacheada en la CDN de Netlify** y se purga en cuanto cambias algo, así que la mayoría de consultas **no ejecutan funciones**.
- La TV envía un **latido** cada **60 s** (configurable) con su estado, y otro justo después de aplicar una orden. Cada latido sí es una ejecución de función: ≈ 1.440 al día por televisión con 60 s. Ajusta «Latido de estado» en **Configuración** si tu plan de Netlify es limitado.
- Una TV se muestra **Sin conexión** si no envía latidos durante 2,5 intervalos (150 s con el valor por defecto).
- Retardo típico de una orden: el intervalo de consulta (≈ 10 s) + la purga de caché (segundos). La confirmación llega con el latido inmediato posterior.

## 4. Escenas

| Tipo | Qué muestra |
| --- | --- |
| **Menús de Navidad** | Los menús **publicados** del gestor de menús (nada inventado). Por cada menú: portada (nombre, precio, «incluye bebida y postre» solo si existen esos grupos, QR de reservas) y páginas de platos legibles a distancia. El Menú Selección Gourmet solo aparece cuando esté publicado. Los cambios publicados en la web llegan a las TV sin redesplegar. |
| **Evento** | Un evento con imagen del artista, fondo, fecha, hora, descripción y texto destacado. Estilos: gastronómico, celebración o fiesta nocturna. |
| **Próximos eventos** | Agenda de los eventos publicados en periodo de promoción (se salta si no hay). |
| **Fotografías y ambiente** | Fotos de la biblioteca con Ken Burns, paneo o máscara; respeta el punto focal. |
| **Logotipo premium** | Logotipo de Campaña (sin deformar; si no hay, el nombre con la tipografía de la marca) con luz ambiental WebGL: cálido, Navidad o noche. |
| **Modo fiesta** | Focos y haces volumétricos en tiempo real (WebGL), niebla, partículas y resplandor tras el logotipo. |
| **Mensaje personalizado** | Texto con animación (revelado, letra a letra o fundido), estilos elegante, navideño, nocturno o claro, logotipo y fondo opcionales. |
| **Reservas** | Titular y **código QR** generado localmente con el enlace de reservas configurado en Local. |

Cada escena tiene nombre, estado (**borrador / publicada**: las de borrador nunca llegan a las TV), duración (en menús y fotos, por paso), transición, y se puede **duplicar** y **eliminar** (si está en programaciones, se quita de ellas). El editor muestra una **vista previa 16:9 animada** con el mismo código que la TV.

### Modo fiesta
Estilos predefinidos: **Gold Night**, **Red Velvet**, **Club Night**, **Midnight**, **Torero Classic**. Personalizable: colores (1–4) y fondo, velocidad, intensidad, número de focos (2–12), movimiento de los haces, partículas, niebla, tamaño y posición vertical del logotipo y texto opcional. La calidad gráfica se elige por televisión.

Seguridad visual: los cambios de color y brillo son lentos (menos de 0,5 Hz) y suaves; **no hay estroboscopios ni destellos** (pautas de fotosensibilidad WCAG 2.3.1). **No reproduce sonido.**

### Transiciones
Fundido cinematográfico, revelado con máscara, barrido, aparición por capas, profundidad/parallax, escala suave, desplazamiento editorial y transición de luz. «Automática» elige según el tipo de escena. La siguiente escena se monta oculta y sus imágenes se decodifican **antes** de mostrarse: no hay pantallazos en blanco.

## 5. Eventos
**Escenas → Eventos**: nombre, descripción, fecha, hora, imagen del artista, imagen de fondo, texto destacado, estado, periodo de promoción (desde/hasta; sin «hasta» se anuncia hasta el día del evento), orden y estilo visual. «Crear escena de este evento» genera su escena. Los eventos aparecen en las programaciones que incluyan una escena «Evento» o «Próximos eventos».

## 6. Programaciones y horarios
- **Programaciones**: listas de escenas con orden (arrastrar), duración y transición por elemento, ocultar sin borrar, repetir en bucle, duplicar y eliminar. Iniciales: *Programa Navidad*, *Programa Habitual* y *Programa Fiesta*.
- **Horarios**: días de la semana, hora de inicio y fin (si el fin es anterior al inicio, el tramo **cruza la medianoche**), fechas opcionales (campañas, eventos), **prioridad** (gana la mayor) y televisiones concretas (vacío = todas). Zona horaria **Europe/Madrid** con el cambio de horario de verano/invierno incluido.
- Orden de decisión en cada TV: **cambio manual activo** → **programación fija** de esa TV → **horario** de mayor prioridad → **programación por defecto** (Configuración).
- Los horarios iniciales (mediodía: menús; tarde y noche: ambiente) son una propuesta; ajústalos al horario real del local.

## 7. Calidad gráfica y rendimiento
Perfiles: **Automático**, **Alto**, **Equilibrado**, **Bajo consumo** (general en Configuración o por TV en Televisiones).

- El texto y las imágenes se dibujan sobre un lienzo lógico de 1920×1080 escalado a la pantalla (nítido en 1080p y 4K, siempre 16:9, sin barras de desplazamiento).
- Los efectos de luz (WebGL) se renderizan a resolución limitada (Alto ≤ 2560×1440 a 60 FPS; Equilibrado ≤ 1080p a 45 FPS; Bajo consumo ≤ 720p a 30 FPS y menos partículas/focos) y se escalan: la luz es suave y no pierde calidad visible.
- **Automático** elige según el equipo (núcleos y memoria) y **baja un escalón** si mide menos de ~35 FPS.
- Las animaciones se pausan con la pestaña oculta; al salir una escena se cancelan bucles, temporizadores y escuchas y se libera el contexto WebGL. Se recupera de la pérdida de contexto de la GPU.
- No se promete un número de FPS: depende del portátil y de su GPU. En un portátil modesto usa **Equilibrado** o **Bajo consumo**.

## 8. Funcionamiento continuo (días sin tocar)
- Guarda en el navegador la última configuración y contenido válidos: **si se cae internet sigue reproduciendo** y aparece un aviso discreto solo al mover el ratón. Se reconecta solo.
- Si una escena falla, se salta (nunca queda la pantalla en negro); si no hay ninguna escena disponible, muestra el logotipo.
- **Recarga preventiva** cada 12 h (configurable), solo si el servidor responde.
- **Wake Lock**: Chrome mantiene la pantalla encendida mientras el reproductor está visible (si el navegador lo permite).

## 9. Que arranque solo y no se apague

> La web no puede controlar el arranque del sistema ni la energía del equipo: esto se configura una vez en el portátil.

**Lanzadores incluidos** (edita dentro la dirección de tu web):
- Windows: `scripts/pantalla/iniciar-pantalla-windows.bat`
- macOS: `scripts/pantalla/iniciar-pantalla-mac.command`

Abren Chrome en **modo quiosco** (pantalla completa sin barras; salir con `Alt+F4` / `Cmd+Q`) con un perfil propio, tras esperar 15 s a que haya red.

### Windows 10/11
1. **Arranque automático**: `Win + R` → `shell:startup` → pega un acceso directo al `.bat`.
2. **Sin suspensión**: Configuración → Sistema → Energía → Pantalla y suspensión → **Nunca** (con corriente). Conecta siempre el cargador.
3. **Inicio de sesión automático** (opcional, solo en un equipo dedicado): `netplwiz` → desmarca «Los usuarios deben escribir su nombre…».
4. **Actualizaciones**: Windows Update → horas activas que cubran el horario del local.
5. Si cierras la tapa del portátil: Panel de control → Opciones de energía → «Elegir el comportamiento del cierre de la tapa» → **No hacer nada**.

### macOS
1. **Arranque automático**: Ajustes del Sistema → General → Ítems de inicio → «+» → el `.command`.
2. **Sin reposo**: Ajustes del Sistema → Pantallas/Batería → «Evitar el reposo automático con el adaptador de corriente» y apagar pantalla: **Nunca**. El lanzador usa además `caffeinate`.
3. Inicio de sesión automático: Ajustes del Sistema → Usuarios y grupos (opcional, equipo dedicado).

### En la televisión
- Desactiva el **apagado automático / ahorro de energía** del televisor y, si lo tiene, activa que se encienda al detectar señal HDMI (HDMI-CEC).
- Usa el modo de imagen «Estándar» o «Cine» y desactiva el sobrescaneo («Ajustar a pantalla» / «Just Scan») para ver los bordes.

## 10. Varias televisiones
- **Divisor HDMI (splitter)**: un portátil → varias TV. Todas muestran **exactamente lo mismo** (una sola pantalla vinculada). Barato y sencillo; usa un divisor que admita la resolución (4K@60 si las TV son 4K) y cables de calidad para tiradas largas.
- **Un reproductor por TV** (portátil, mini PC o stick con Chrome): cada TV con **contenido y control independientes** (vincula cada una con su nombre). Necesario si quieres, por ejemplo, la barra en modo fiesta y el comedor con los menús.
- Pantalla extendida del mismo portátil: puede mostrar /pantalla en una TV mientras usas el portátil, pero es menos fiable para funcionar días seguidos.

## 11. Seguridad
- El **panel** exige Netlify Identity con rol `admin` (y protección CSRF) en cada petición, igual que el resto del panel.
- Las **televisiones** solo tienen un token de dispositivo: sirve para leer sus propias órdenes y enviar su estado. **No da acceso** al API de administración (probado). Se revoca al instante.
- El **reproductor público** solo recibe escenas y eventos **publicados**; los borradores y las notas internas nunca salen.
- Códigos de vinculación: 6 caracteres, caducan en 10 minutos, de un solo uso, sin acceso al panel; el token se entrega una vez y solo a quien tiene el secreto de esa solicitud. Límite de peticiones en las funciones de vinculación.
- `/pantalla?escena=<id>` permite probar una escena **publicada** concreta en un navegador (no afecta a ninguna televisión).

## 12. Limitaciones conocidas
- Las pruebas automáticas se han hecho en Chromium (incluido WebGL por software). **No se ha probado en televisiones físicas**: haz una prueba en el local antes de la campaña (resolución de la TV, sobrescaneo, temperatura del portátil tras horas de fiesta).
- La memoria del navegador que informa la TV solo está disponible en Chrome (aproximada).
- Si la purga de caché de Netlify fallase, las órdenes llegan igualmente en un máximo de 5 minutos (caducidad de la caché).
- Las fotografías incluidas son ilustrativas (Unsplash): sustitúyelas por fotos reales del local.
