# Consorcio frontend

Next.js. `npm install`, `npm run dev` (puerto 3001). Las rutas `/api/*` se reenvían a `BACKEND_URL` (por defecto `http://127.0.0.1:3000`).

## Autorización

`/auth/permisos` devuelve los permisos vigentes. `lib/permissions.ts` evalúa sección, acción y contexto (propiedad, edificio y administración). El shell verifica la navegación y los componentes verifican cada acción; el backend vuelve a autorizar la solicitud. No se infieren privilegios por el nombre visible del rol.

Los permisos se consultan al navegar, al recuperar el foco y después de una denegación 403 o de un cambio de asignaciones. Si no pueden verificarse, se ocultan los datos y las acciones hasta actualizar la sesión. Cuando la respuesta trae los mismos permisos que ya había, el shell conserva el mismo array: las pantallas no vuelven a pedir sus listados. Solo recargan si los permisos cambiaron. El perfil (`/auth/profile`) se pide una sola vez al entrar o al reintentar; navegar solo vuelve a consultar `/auth/permisos`.

Reservas e incidencias toman el autor de la sesión. Las altas de residentes seleccionan una propiedad de origen elegible. La disponibilidad usa `/reservaciones/disponibilidad`, sin autor ni descripción de terceros. El Administrativo edita/cancela reservas dentro de sus edificios y desvincula usuarios de su administración; la baja global de una cuenta requiere `USUARIOS.DESHABILITAR` global.

Los roles se asignan y revocan desde el modal «Roles» de cada usuario; no hay pantalla para editar roles ni su matriz de permisos (la API ya no lo permite). La delegación comprueba permisos propios y, para los roles iniciales de propiedad, los límites documentados en `TP-BACKEND/docs/autorizacion.md`. Expensas solo existe como sección de permisos: el backend todavía no implementa ese módulo.

## Alta de usuarios por edificio y propiedad

Al elegir un rol de ámbito `PROPIEDAD` en «Nuevo usuario», se selecciona primero
el `Edificio` y después una `Propiedad` de ese edificio. Se muestran los nombres
de los edificios que tienen propiedades asignables para el rol y los permisos
actuales. La propiedad permanece deshabilitada hasta elegir un edificio.

Cambiar de edificio o de rol limpia la selección anterior. Antes de guardar se
comprueba que la propiedad pertenezca al edificio seleccionado y siga siendo
asignable. El backend recibe el `rolId` y la `propiedadId` habituales; el edificio
se usa para organizar la selección. Los roles globales y de administración
mantienen sus respectivos destinos.

La carga de opciones informa los errores y permite reintentar conservando los
datos personales ingresados. Las ocho pruebas del formulario cubren la cascada,
los cambios de selección, el ámbito del Administrativo, el contrato de alta,
selecciones inválidas, errores de carga y la edición de usuarios existentes.
Se ejecutan con `npm run test:usuarios` o dentro de `npm test`.

Para probarlo, abrir Usuarios → Nuevo usuario, elegir Propietario o Residente,
seleccionar un edificio y comprobar que solo aparezcan sus unidades. Después
elegir una propiedad y cambiar de edificio: la propiedad debe quedar vacía.

## Filtros de reservas e incidencias

Reservas ofrece `Desde` y `Hasta` sobre el día de la reserva en Buenos Aires.
Ambos extremos son inclusivos y pueden usarse por separado. Permite consultar
fechas pasadas. Un rango invertido informa el error y pide corregirlo.

Incidencias ofrece un selector `Estado` (Reportado, En revisión, Finalizado o
Cancelado), también en «Mis incidencias».

En el backoffice, reservas e incidencias ofrecen además un selector `Usuario`
con los autores de los registros visibles en el ámbito actual. Cada autor
aparece una sola vez y se filtra por su ID; los nombres iguales se distinguen con
ese identificador. No se consulta el catálogo de usuarios ni se requiere permiso
para gestionarlos. «Mis reservas» y «Mis incidencias» no lo muestran, porque
solo incluyen registros propios.

Los filtros se combinan con la búsqueda de texto, se conservan al actualizar
el listado y pueden quitarse con `Limpiar filtros`. Se muestra cuántos
registros coinciden sobre el total disponible. Se aplican en el frontend sobre
los listados completos que ya devuelve el backend con su autorización; no
amplían el alcance de los datos ni modifican registros. Seleccionar un
resultado conserva la consulta de detalle por ID.

## Errores

En los listados del gestor de recursos, «Ver» y «Ver / editar» consultan
`GET /api/<recurso>/<id>` al seleccionar el registro, también al volver a
abrirlo. El modal muestra la carga antes de presentar el formulario, que se
completa con la respuesta actualizada. La fecha, las relaciones y el estado
recibidos determinan los valores y las acciones disponibles.

Si la consulta falla, el modal informa el error y permite reintentar. Cerrar
el modal o salir de la pantalla cancela la consulta; las respuestas anteriores
no reemplazan el detalle de una apertura posterior. Crear un registro nuevo
abre un formulario vacío.

- 401 autenticado: elimina la sesión y vuelve al ingreso con el mensaje correspondiente.
- 403: conserva la sesión, actualiza permisos y explica la denegación.
- 400/409: conserva el formulario y muestra validaciones o conflictos.
- 404: informa que el registro ya no está disponible o está fuera del ámbito.
- 429: solicita esperar antes de reintentar.
- Conexión, timeout y 5xx: muestran un mensaje recuperable; no exponen detalles internos ni reenvían escrituras automáticamente. Si no se pudo confirmar una escritura, actualizar el listado antes de repetirla.

Los errores de referencias no impiden consultar el listado principal. Las consultas tienen timeout y cancelación al desmontar; los formularios evitan envíos duplicados mientras se procesa una operación.

## Verificación

```sh
npm test
npm run test:detalle
npm run lint
npm run build
```

Las pruebas cubren aislamiento de contextos, permisos personalizados y revocados, operaciones propias y administrativas, delegación, contratos de payloads y errores de la API.

Las pruebas de detalle (`tests/resource-manager.test.mjs`) renderizan el
componente real con React Testing Library y jsdom. Cubren el GET por ID, la
espera de la respuesta, el guardado de datos actualizados, errores 403/404/500 y
reintentos, cancelación y respuestas tardías, solo lectura, altas, respuestas
inválidas, cambios de estado de reservas y que después de guardar solo se
recargue el listado. Se ejecutan dentro de `npm test` o mediante
`npm run test:detalle`. En PowerShell con scripts deshabilitados, usar `npm.cmd`
en lugar de `npm`.

La misma suite incluye las pruebas de filtros: límites del día local, rango
inclusivo y abierto, rango invertido, combinación con texto y detalle, estado de
incidencias, selección por usuario y homónimos, ausencia del filtro de usuario
en el ámbito personal, relaciones serializadas y conservación del filtro
después de actualizar. `tests/backoffice-shell.test.mjs` prueba la verificación
de permisos del shell al navegar y al recuperar el foco.

Para probar los filtros manualmente, ingresar a Reservas, elegir `Desde` y
`Hasta` y comprobar que se incluyan las reservas de ambos días. Combinar el
rango con `Buscar` y usar `Limpiar filtros` para recuperar el listado. En
Incidencias, elegir un `Estado` o un `Usuario` y verificar que solo aparezcan
esos reportes. Si no hay coincidencias, limpiar los filtros o elegir otro criterio.

Para verificarlo manualmente, abrir un listado, modificar el mismo registro
desde otra sesión y luego seleccionar «Ver / editar» en la primera. El modal
debe mostrar los cambios recientes. En la pestaña Network del navegador se
puede comprobar la nueva solicitud GET por ID antes de guardar.
