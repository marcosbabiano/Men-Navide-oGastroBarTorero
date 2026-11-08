# Prompt maestro para ChatGPT — Colección artística «GastroBar Torero · Navidad 2026»

Este documento tiene dos partes:

- **Parte 1:** análisis interno para el equipo.
- **Parte 2:** el prompt listo para copiar y pegar en ChatGPT.

## Parte 1 · Análisis de la landing actual

### A. Diagnóstico visual

| Recurso actual | Problema |
| --- | --- |
| Fotografías de stock (Unsplash) en portada, menús, «La Navidad», celebración y «Sobre nosotros» | Son genéricas y no exclusivas. Tienen luces y temperaturas de color incoherentes entre sí: el brindis es de día y al aire libre, la mesa larga tiene mantel blanco y luz de ventana, y los langostinos aparecen sobre un plato azul. Además, muestran platos que no son los que sirve el bar. |
| Recortes cuadrados (detalles de «La Navidad» y «Celebración», miniaturas de los menús) | Rompen el ritmo vertical y editorial de la página. *Ya se han cambiado a formato 4:5 en el código.* |
| Árbol, bolas y luces de stock | Resultan típicos y algo infantiles frente a la dirección «lujo navideño contemporáneo». |
| Filetes y estrellas | Son vectores correctos pero sencillos. Hay ranuras preparadas para sustituirlos por ornamentos ilustrados. |

### B. Dirección artística

- **Estilo:** ilustración editorial de grabado fino (aguafuerte o grabado a buril), con trazo de pluma muy fino, tramas de líneas paralelas y cruzadas, y detalles en **pan de oro champán** con un ligero brillo metálico. Composiciones abstractas sofisticadas: nunca dibujos infantiles ni estilo de dibujos animados.
- **Paleta:**
  - Carbón `#1D1517`
  - Burdeos profundo `#5A2533`
  - Oro champán `#C9A96E`
  - Marfil `#F4ECE0`
  - Se admite verde abeto muy oscuro, solo como acento.
- **Iluminación:** cálida, como de vela, desde un lado. Sombras profundas en las piezas oscuras. En las piezas marfil, luz difusa de papel.
- **Materia:** papel de algodón con textura, terciopelo burdeos, latón y oro cepillado.
- **Coherencia:** la misma mano y el mismo grosor de línea en todas las piezas. El oro siempre como acento, nunca como relleno plano.
- **Prohibido:** fotografías, fotorrealismo, platos concretos «reales», texto o tipografía dentro de la imagen, logotipos, marcas de agua, personas con rostro reconocible y Papá Noel, renos o muñecos.

### C. Inventario mínimo (12 piezas)

| # | Pieza | Ubicación en la web | Formato | Transparencia | Campo del panel `/admin` |
| --- | --- | --- | --- | --- | --- |
| 1 | Bodegón de portada | Fondo del hero | 3:2 · 2400×1600 · JPG | No. El 45 % izquierdo debe quedar oscuro y vacío | Textos → Portada → Imagen de portada |
| 2 | Acento de portada | Flota a la derecha del titular | 1:1 · 2000×2000 · PNG | **Sí** | Campaña → Ornamentos → Acento de la portada |
| 3 | Separador editorial | Sustituye a los filetes dorados | 6:1 · 2400×400 · PNG | **Sí** | Campaña → Ornamentos → Separador editorial |
| 4 | Rama botánica | Esquina de «La Navidad» y del pie | 1:1 · 2000×2000 · PNG | **Sí** | Campaña → Ornamentos → Rama botánica |
| 5 | «La Navidad se comparte» · principal | Imagen vertical grande | 4:5 · 2000×2500 · JPG | No | Textos → La Navidad → Imagen 1 |
| 6 | «La Navidad se comparte» · detalle | Imagen superpuesta | 4:5 · 1600×2000 · JPG | No | Textos → La Navidad → Imagen 2 |
| 7 | Menú I (Esencia) | Columna fija del menú | 4:5 · 2000×2500 · JPG | No | Menús → Menú Esencia → Imagen principal |
| 8 | Menú II (Distinción) | Columna fija del menú | 4:5 · 2000×2500 · JPG | No | Menús → Menú Distinción → Imagen principal |
| 9 | Celebración · fondo | Imagen a pantalla completa | 16:9 · 2560×1440 · JPG | No. El tercio inferior debe quedar oscuro | Textos → Celebración → Imagen de fondo |
| 10 | Sobre nosotros | Imagen junto al texto | 4:5 · 2000×2500 · JPG | No | Textos → Sobre nosotros → Imagen |
| 12 | Menú III (Selección Gourmet) | Columna fija del menú | 4:5 · 2000×2500 · JPG | No | Menús → Menú Selección Gourmet → Imagen principal |
| 11 | Textura de papel marfil | Fondos del Estudio Creativo y bloques | 1:1 · 2048×2048 · JPG, repetible | No | Imágenes → carpeta «Texturas» |

Las galerías de los menús y las imágenes 2 y 3 de «Celebración» son opcionales: con estas 12 piezas la web queda completa. Si se quiere más riqueza, pueden reutilizarse las piezas 2, 4 y 6.

### D y E

Los prompts individuales (D) y la integración en el panel (E) están dentro del prompt de la Parte 2.

---

## Parte 2 · Prompt para copiar en ChatGPT

> Copia desde aquí hasta el final del documento.

```
Actúa como ilustrador editorial y director de arte de una marca gastronómica de lujo.
Necesito que GENERES IMÁGENES FINALES (no descripciones) para la campaña de Navidad 2026
de «GastroBar Torero», un gastrobar de Fuenlabrada de los Montes (Badajoz, España).
Genera las piezas UNA A UNA, en el orden indicado, respetando exactamente formato,
proporción y transparencia. Tras cada imagen, espera mi «OK» o mis correcciones antes de
pasar a la siguiente.

DIRECCIÓN ARTÍSTICA COMÚN (aplícala a TODAS las piezas para que parezcan una colección):
- Estilo: ilustración editorial de grabado fino (aguafuerte/buril), trazo de pluma muy
  fino, tramas de líneas paralelas y cruzadas, detalles en pan de oro champán con brillo
  metálico sutil. Lujo navideño contemporáneo, sobrio y elegante.
- Paleta estricta: carbón #1D1517, burdeos profundo #5A2533, oro champán #C9A96E,
  marfil #F4ECE0. Verde abeto muy oscuro solo como acento mínimo.
- Luz: cálida, de vela, lateral; sombras profundas en piezas oscuras; luz difusa de papel
  en piezas marfil.
- Materias: papel de algodón texturizado, terciopelo burdeos, latón y oro cepillado.
- Mismo grosor de línea y misma "mano" en todas las piezas. El oro es acento, no relleno.
- PROHIBIDO: fotografía o fotorrealismo, estilo infantil o de dibujos animados, texto,
  letras, números, logotipos, marcas de agua, firmas, personas con rostro reconocible,
  Papá Noel, renos, muñecos de nieve, nieve caricaturesca, colores saturados, degradados
  llamativos.
- No representes platos concretos de forma literal: sugiere la gastronomía con vajilla,
  copas, cubertería, ramas, frutos y composiciones abstractas.

PIEZAS:

1) BODEGÓN DE PORTADA — 3:2, 2400×1600 px, JPG, sin transparencia.
   Bodegón nocturno visto ligeramente desde arriba: mesa con mantel de terciopelo burdeos,
   dos copas de cristal finamente grabadas (una con vino tinto, otra con cava), plato de
   porcelana marfil con filo dorado, cubiertos de latón, una rama de abeto y una vela
   encendida. Fondo carbón casi negro con destellos dorados desenfocados. Todo el
   contenido en el 55 % DERECHO; el 45 % IZQUIERDO oscuro, limpio y vacío (allí irá el
   titular). Contraste alto, atmósfera íntima.

2) ACENTO DE PORTADA — 1:1, 2000×2000 px, PNG con FONDO TRANSPARENTE real.
   Ornamento en grabado dorado: una copa coupe alta de champán con burbujas en tramado,
   entrelazada con una rama de abeto y bayas, envuelta por una cinta fina. Solo líneas oro
   champán con algún acento marfil; sin sombras proyectadas; bordes limpios; centrado con
   un 8 % de margen. Debe leerse bien sobre fondo oscuro.

3) SEPARADOR EDITORIAL — 6:1, 2400×400 px, PNG con FONDO TRANSPARENTE.
   Ornamento horizontal simétrico: filete fino dorado que nace de una estrella de ocho
   puntas central, con pequeñas ramas de laurel y bayas a ambos lados que se afinan hacia
   los extremos. Solo oro champán, trazo fino de grabado, márgenes laterales de 5 %.

4) RAMA BOTÁNICA — 1:1, 2000×2000 px, PNG con FONDO TRANSPARENTE.
   Rama de abeto y acebo grabada, que entra desde la esquina SUPERIOR DERECHA y cae en
   diagonal hacia el centro, con dos bolas de cristal burdeos con reflejos dorados
   colgando de cintas finas. Líneas oro y burdeos sobre transparencia, sin fondo.

5) LA NAVIDAD SE COMPARTE (principal) — 4:5, 2000×2500 px, JPG.
   Composición vertical sobre papel marfil texturizado: manos estilizadas, sin rostros,
   brindando con copas sobre una mesa vista en picado, con platos para compartir en el
   centro sugeridos con formas abstractas. Trazo de grabado en carbón y burdeos; acentos
   oro en los bordes de las copas. Amplio espacio negativo marfil arriba.

6) LA NAVIDAD SE COMPARTE (detalle) — 4:5, 1600×2000 px, JPG.
   Primer plano editorial de un plato de porcelana con filo dorado, una servilleta de
   lino burdeos anudada con una ramita de abeto y una estrella dorada. Fondo marfil, luz
   difusa.

7) MENÚ I · ESENCIA — 4:5, 2000×2500 px, JPG.
   Composición cálida y clásica sobre fondo burdeos profundo: mesa para compartir vista
   desde arriba con tablas, cuencos y copas en grabado marfil y dorado, una rama de abeto
   cruzando la parte inferior. Sensación acogedora y tradicional. Deja libre el tercio
   inferior izquierdo (allí irá un numeral «I»).

8) MENÚ II · DISTINCIÓN — 4:5, 2000×2500 px, JPG.
   Variante más sofisticada sobre fondo carbón: composición asimétrica con una copa de
   vino tinto, cubertería de latón cruzada, un plato con cúpula (cloche) dorada y destellos
   de oro. Más contraste, más oro que la pieza 7, mismo estilo de grabado. Tercio inferior
   izquierdo despejado.

9) CELEBRACIÓN · FONDO — 16:9, 2560×1440 px, JPG.
   Mesa larga de celebración en perspectiva profunda dentro de un comedor íntimo, sillas,
   copas alineadas y guirnalda de abeto con pequeñas luces doradas, todo en grabado sobre
   carbón con luces cálidas. El TERCIO INFERIOR muy oscuro y despejado (allí irá un
   titular en marfil).

10) SOBRE NOSOTROS — 4:5, 2000×2500 px, JPG.
    Barra de un gastrobar de pueblo con encanto: botellas, grifos de cerveza, bombillas de
    filamento y madera, interpretada en grabado cálido con luces doradas sobre carbón. Sin
    rótulos ni texto legible.

11) TEXTURA DE PAPEL — 1:1, 2048×2048 px, JPG, REPETIBLE SIN COSTURAS.
    Papel de algodón marfil #F4ECE0 con fibra muy sutil y alguna partícula dorada mínima.
    Sin ilustración, sin viñeteado, iluminación uniforme para poder repetirse en mosaico.

12) MENÚ III · SELECCIÓN GOURMET — 4:5, 2000×2500 px, JPG.
    La pieza más rica de la colección, mismo estilo de grabado: sobre fondo burdeos noche,
    composición asimétrica con una alcachofa grabada, una copa de vino, una cloche dorada
    entreabierta y una rama de laurel en pan de oro; destellos dorados sutiles. Tercio
    inferior izquierdo despejado (allí irá el numeral «III»).

ENTREGA: cada imagen con el tamaño exacto indicado. Las piezas 2, 3 y 4 deben exportarse
en PNG con canal alfa real (sin fondo blanco ni cuadriculado dibujado). Nombra los
archivos así: 01-portada.jpg, 02-acento-portada.png, 03-separador.png,
04-rama-botanica.png, 05-navidad-principal.jpg, 06-navidad-detalle.jpg,
07-menu-esencia.jpg, 08-menu-distincion.jpg, 09-celebracion-fondo.jpg,
10-sobre-nosotros.jpg, 11-textura-papel.jpg, 12-menu-gourmet.jpg.
```

---

## Integración (cómo se usarán)

Todo se hace con el **gestor de imágenes que ya existe en `/admin`**. No hay que tocar código.

1. **Imágenes → Subir imagen.** Sube cada archivo con su texto alternativo y en su carpeta:
   - «Portada» para la 1.
   - «Ornamentos» para la 2, la 3 y la 4.
   - «Ilustraciones» para la 5 a la 10.
   - «Texturas» para la 11.

   Las piezas en PNG conservan la transparencia: el panel las optimiza en WebP con canal alfa.
2. Asigna cada pieza en el campo indicado en la tabla del inventario. Las ranuras de **Ornamentos** (Campaña → Ornamentos de marca) se activan solas al asignarles imagen y se animan por separado:
   - El acento de portada flota.
   - La rama se balancea.
   - El separador aparece al hacer scroll.
3. En **Menús → (menú) → Galería**, quita las fotografías de stock o sustitúyelas por las piezas 2, 4 o 6.
4. Pulsa **Guardar → Vista previa → Publicar**. Las fotografías de stock dejan de usarse; puedes conservarlas en la biblioteca o ignorarlas.
5. En el **Estudio Creativo**, las nuevas piezas aparecen en «+ Fotografía o ilustración» y en «Fondo → Imagen de fondo». Así los diseños para redes comparten la misma colección.
6. Cuando todo use ilustraciones propias, cambia el texto «Imágenes ilustrativas» en **Textos → Sección de menús**. Por ejemplo, «Ilustraciones: GastroBar Torero», o déjalo vacío.
