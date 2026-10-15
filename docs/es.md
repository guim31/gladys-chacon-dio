# Chacon DiO

Controle desde Gladys los dispositivos wifi **DiO** de Chacon, los que instala
con la aplicación **DiO One**: persianas enrollables, enchufes, interruptores de
luz y el timbre con vídeo. Los cambios llegan en tiempo real, vengan de Gladys,
de la aplicación DiO, de un interruptor de pared o de un mando.

> **Desarrollada sin el hardware: sus comentarios son bienvenidos.** Esta
> integración se escribió a partir del protocolo de la nube DiO tal como está
> documentado públicamente, y se probó con respuestas grabadas, no con
> dispositivos reales. Si algo no funciona como se describe aquí, indíquelo en
> el [foro de Gladys](https://community.gladysassistant.com) o en las
> [issues](https://github.com/guim31/gladys-chacon-dio/issues).

Integración comunitaria, **sin relación con Chacon**. DiO y Chacon son marcas de
sus respectivos propietarios.

## Requisitos

- Gladys Assistant 5.1.0 o posterior.
- Una cuenta **DiO One** (la aplicación de los dispositivos wifi DiO), con sus
  dispositivos ya instalados y nombrados en la aplicación. Gladys usa esos
  nombres.
- Una conexión a Internet: la integración pasa por la nube de Chacon, como la
  aplicación. Sin Internet, Gladys no puede leer ni controlar sus dispositivos
  DiO.

Los dispositivos DiO antiguos de **433 MHz** (mandos, enchufes y módulos sin
wifi controlados por la central DiO 1.0) no pasan por esta nube: no están
incluidos.

## Configuración

1. Instale la integración desde el catálogo de Gladys.
2. En **Configuración**, introduzca el **correo electrónico** y la
   **contraseña** de su cuenta DiO One y guarde.
3. El estado de la conexión aparece arriba de la pantalla: «Conectado» cuando la
   nube DiO ha aceptado la cuenta.
4. Abra la pestaña **Descubrimiento**: allí aparecen sus dispositivos DiO.
   Añada los que quiera ver en Gladys y colóquelos en sus habitaciones.

Los demás ajustes:

- **Lectura de respaldo**: los cambios llegan en tiempo real, pero por
  seguridad todos los dispositivos añadidos se leen de nuevo con este intervalo
  (cada 5 minutos por defecto). Una sola petición lee todos los dispositivos.
- **Idioma de los nombres de funciones**: «Posición», «Movimiento»,
  «Enchufe»… en el idioma elegido (francés por defecto). Se aplica a los
  dispositivos añadidos después del cambio: Gladys fija los nombres al añadir
  un dispositivo.

El botón **Listar los dispositivos de la cuenta DiO** muestra todo lo que
contiene su cuenta, incluidos los dispositivos que la integración aún no
admite, con su modelo y su tipo.

## Los dispositivos

Cada dispositivo DiO se convierte en un dispositivo de Gladys, con el nombre que
le dio en la aplicación DiO One.

| Dispositivo DiO                                   | En Gladys                                                                                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persiana enrollable (módulo REV-SHUTTER, CERSwd…) | **Posición** de 0 % (cerrada) a 100 % (abierta), y **Movimiento**: botones Abrir / Detener / Cerrar, que también muestran si la persiana sube o baja |
| Interruptor de luz (REV-LIGHT)                    | **Luz** encendida / apagada                                                                                                                          |
| Enchufe inteligente                               | **Enchufe** encendido / apagado                                                                                                                      |
| Timbre con vídeo                                  | **Timbrazo**: «Sonando» unos segundos en cada timbrazo, y después la hora del último                                                                 |

Cada dispositivo lleva además una etiqueta **nube**, que pasa a **inaccesible**
cuando la nube DiO ve el dispositivo sin conexión (wifi caído, diferencial
saltado, enchufe desconectado) o cuando la propia nube no responde.

Los reguladores, bombillas y cámaras aún no son compatibles: su protocolo no
está documentado. Aparecen en el informe del botón **Listar los dispositivos de
la cuenta DiO**; envíenos su línea para que se añadan.

## Widget

El widget **Persianas DiO** del panel muestra de un vistazo todas sus persianas
DiO añadidas a Gladys: abierta, cerrada, al 45 %, subiendo, bajando, sin
conexión. Tres botones accionan todas las persianas a la vez: **Abrir todas**,
**Detener todas**, **Cerrar todas**. Es el equivalente de los grupos de la
aplicación DiO.

Para añadirlo: edite su panel, añada un widget y elija **Persianas DiO**. No
tiene ningún ajuste.

## Activador y acción de escena

**Activador «Dispositivo DiO sin conexión o de vuelta»**: se activa cuando la
nube DiO pierde un dispositivo o lo recupera. Puede limitarlo a un dispositivo
y a un sentido («Se desconecta» o «Vuelve a conectarse»). Las variables
`device_name` (nombre del dispositivo) y `state` (`offline` u `online`) están
disponibles en las acciones siguientes, por ejemplo en un mensaje.

**Acción «Mover todas las persianas DiO»**: abre, cierra, detiene o lleva a una
posición (de 0 a 100 %) todas las persianas DiO añadidas a Gladys, de una vez.
Devuelve dos valores: `commanded` (persianas accionadas) y `failed` (persianas
con error). Si no se ha podido accionar ninguna persiana, la acción falla y la
escena lo anota en su historial.

Para una sola persiana, un enchufe o una luz, use las acciones habituales de
Gladys («Establecer valor del dispositivo», «Encender las luces», «Encender los
interruptores»…).

## Ejemplos de escenas

- **Por la noche, se cierra todo**: activador «Cada atardecer», acción «Mover
  todas las persianas DiO» con la orden **Cerrar**.
- **El congelador se ha quedado sin corriente**: activador «Dispositivo DiO sin
  conexión o de vuelta» en el enchufe del congelador, cambio «Se desconecta», y
  después un mensaje: «El enchufe {{device_name}} ya no responde: ¿corte de
  luz?».
- **Llaman a la verja**: activador «Cambio de estado del dispositivo» en el
  Timbrazo del timbre, «Si suena el timbre», y después «Encender las luces» de
  la entrada y «Enviar mensaje».
- **El árbol de Navidad**: «Cada atardecer», «Encender los interruptores» en el
  enchufe del árbol; a las 23 h, «Apagar los interruptores».

## La nube DiO: tráfico y condiciones

La integración usa el mismo servicio que la aplicación DiO One. Chacon no
publica ni documentación ni cuotas para este servicio: por eso la integración
es sobria.

- **Una conexión**: se abre una sola sesión, que se guarda en la carpeta `/data`
  de la integración y se reutiliza en los reinicios. La contraseña solo se
  envía cuando hay que volver a abrir la sesión.
- **Una petición por lectura de respaldo** para todos los dispositivos (cada
  5 minutos por defecto), una petición por orden, y una pequeña petición de
  control cuando la conexión lleva 4 minutos en silencio.
- **Reconexión progresiva**: tras un corte, nuevo intento a los 10 s, después
  30 s, 1 min, 2 min, 5 min, y como mucho cada 10 minutos.
- **Contraseña rechazada**: la integración se detiene ahí y espera a que guarde
  la configuración. No reintenta en bucle, lo que podría bloquear su cuenta.

Su correo y su contraseña solo sirven para abrir la sesión con la nube de
Chacon; nunca aparecen en los registros.

## Solución de problemas

- **«DiO rechaza el correo o la contraseña»**: compruébelos iniciando sesión en
  la aplicación DiO One, corríjalos en la configuración y guarde. Guardar,
  incluso sin cambiar nada, vuelve a lanzar la conexión.
- **«Nube DiO inaccesible»**: su Gladys no tiene Internet, o el servicio de
  Chacon tiene una avería. La integración vuelve a intentarlo sola.
- **Falta un dispositivo en Descubrimiento**: pulse **Listar los dispositivos de
  la cuenta DiO**. Si aparece con «aún no compatible», todavía no se gestiona;
  si no aparece, no está en esta cuenta (un dispositivo compartido por otra
  cuenta solo aparece en la cuenta que lo instaló).
- **Un dispositivo sigue «inaccesible»**: la nube DiO lo ve sin conexión.
  Compruébelo en la aplicación DiO One: si allí también está sin conexión, se
  trata de su wifi o de su alimentación.
- **Una persiana no llega a la posición correcta**: la posición viene de la
  calibración del módulo. Vuelva a calibrarlo en la aplicación DiO One.
- Para más detalle, ponga el nivel de los registros en debug (variable
  `LOG_LEVEL=debug`): cada lectura y cada mensaje recibido quedan descritos.

## Límites

- Todo pasa por la nube de Chacon: sin Internet, o si Chacon cambia su
  servicio, la integración deja de funcionar. No se conoce ningún control local
  de los dispositivos wifi DiO.
- Solo persianas, interruptores de luz, enchufes y el timbre. Ni regulador, ni
  bombilla, ni cámara, ni programación (las programaciones hechas en la
  aplicación DiO siguen funcionando).
- Los nombres de los dispositivos se toman al añadirlos a Gladys: cambiar el
  nombre de un dispositivo en la aplicación DiO no lo cambia en Gladys.
- El timbre no da ni imagen ni vídeo en Gladys, solo el timbrazo.
- Una puerta de garaje o una verja conectada a un módulo de persiana se ve como
  una persiana: no automatice su apertura sin pensar en lo que provocaría un
  error.
