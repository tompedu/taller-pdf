# Instalación en un alojamiento compartido (IONOS)

## Qué es
Una web para editar, firmar (a mano o con certificado digital mediante
AutoFirma), unir,
separar, comprimir, reparar, censurar y proteger con contraseña archivos PDF. Todo el trabajo se hace en el navegador de quien
la usa: los documentos NO se suben al servidor ni se guardan en ningún sitio.

## Qué necesita
- NO necesita base de datos.
- NO necesita PHP ni ningún programa en el servidor.
- Vale cualquier alojamiento que sirva archivos (el Hosting compartido
  de IONOS es suficiente). Solo hace falta un certificado SSL (HTTPS),
  que IONOS incluye.

## Contenido de la carpeta
  index.html        La aplicación
  assets/           Estilos y código de la aplicación
  vendor/           Librerías (pdf-lib, pdf.js, SortableJS, autoscript de AutoFirma) y sus licencias
  fonts/            Tipografías (alojadas aquí; no se usa Google Fonts)
  favicon.svg       Icono de la pestaña
  .htaccess         Ajustes de seguridad, HTTPS y caché (archivo oculto)
  robots.txt        Evita que aparezca en buscadores (bórralo si la quieres pública)

## Instalación en IONOS (unos 10 minutos)
1. Descarga o clona este repositorio.

2. Sube TODO el contenido de la carpeta `public/` al servidor:
   - Opción A, Webspace Explorer: en el panel de IONOS entra en
     Hosting > Webspace > Abrir. Crea una carpeta (por ejemplo "pdf")
     y sube dentro todos los archivos y carpetas.
   - Opción B, SFTP con FileZilla: los datos de acceso están en
     Hosting > SFTP & SSH. Activa "Mostrar archivos ocultos" en FileZilla
     para que se suba también el archivo .htaccess.

3. En el panel de IONOS, ve a Dominios y SSL y crea un subdominio, por
   ejemplo:  pdf.tu-dominio.es
   y haz que apunte a la carpeta del paso 2 ("Destino: Webspace" > carpeta "pdf").

4. Comprueba que el subdominio tiene certificado SSL activo (en IONOS
   aparece con un candado). Si no, actívalo desde Dominios y SSL.

5. Abre https://pdf.tu-dominio.es y prueba a abrir un PDF.

## Comprobación rápida
- Firma un PDF de prueba con AutoFirma y compruébalo en VALIDe.
- Debe verse la pantalla "Edita tus PDF sin complicaciones".
- Al abrir un PDF deben aparecer las miniaturas de las páginas.
- Si la página sale en blanco o sin estilos, revisa que se hayan subido
  las carpetas assets, vendor y fonts completas.

## Opcional: que solo la use el personal
IONOS permite proteger una carpeta con usuario y contraseña
(Hosting > Webspace > selecciona la carpeta > Protección por contraseña,
o con un archivo .htpasswd). Así solo entra quien tenga la clave.

## Actualizar a una versión nueva
Sustituye los archivos por los de la versión nueva. Los navegadores
cargan la página nueva automáticamente.

## Firma con certificado digital (AutoFirma)
Usa los certificados instalados en el ordenador (Windows, Chrome, Edge,
Firefox), el DNIe o una tarjeta, a través de AutoFirma.
- Cada ordenador necesita AutoFirma instalada. Es gratuita:
  https://firmaelectronica.gob.es  > Descargas > AutoFirma.
- Al pulsar "Descargar firmado", el navegador preguntará si quiere abrir
  AutoFirma: marca "Permitir siempre" y pulsa "Abrir". Chrome y Edge
  pueden preguntar también si el sitio puede acceder a "aplicaciones de
  este dispositivo" o a "la red local": pulsa "Permitir" (es como la web
  habla con AutoFirma en el propio PC).
- En AutoFirma eliges el certificado y escribes su PIN si lo pide.
- El resultado es una firma PAdES (ETSI.CAdES.detached), la que usan las
  sedes electrónicas. El sello visible lo dibuja AutoFirma con el nombre
  real del certificado y la hora exacta de la firma.
- Solo funciona con la web publicada en vuestro servidor con HTTPS.
- Firmar debe ser el último paso: cualquier cambio posterior invalida la
  firma. No se puede combinar con la contraseña de apertura.
- Se puede comprobar la firma en VALIDe (https://valide.redsara.es),
  AutoFirma o Adobe Acrobat Reader.

## Comprimir, quitar contraseña, reparar y PDF a imágenes
- Comprimir: reduce las fotos y los escaneos que lleva el PDF (tres
  niveles). El texto y los dibujos no se tocan. Si el PDF solo tiene
  texto, apenas bajará de tamaño.
- Quitar contraseña: abre el PDF con su contraseña y descarga una copia
  sin ella. Solo funciona si conoces la contraseña.
- Reparar: reconstruye la estructura de PDF dañados. Si el daño es grave,
  las páginas se guardan como imagen (se ven igual, pero el texto no se
  puede seleccionar). Un archivo cortado o muy roto puede no recuperarse.
- PDF a imágenes: una imagen JPG por página (en .zip si hay varias).
- Escanear documento: desde el móvil abre la cámara, detecta los bordes
  del documento, lo endereza y lo deja en color o en blanco y negro.
  Funciona mejor con el papel sobre una superficie oscura y buena luz.
  Si no acierta con los bordes, se arrastran las esquinas a mano.

## Privacidad (RGPD)
- Los PDF se procesan en el ordenador de cada persona; el servidor nunca
  los recibe.
- La web no usa cookies, ni analítica, ni recursos de otras empresas
  (las fuentes y librerías están en vuestro propio servidor).
- Como cualquier web, IONOS guarda registros técnicos de acceso
  (IP, fecha, página visitada) según su configuración.
- Las contraseñas que se ponen a los PDF no se guardan en ningún sitio.
  Si se olvidan, el PDF protegido no se puede abrir.
