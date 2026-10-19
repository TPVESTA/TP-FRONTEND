# Consorcio frontend

Next.js. `npm install`, `npm run dev` (puerto 3001). Las rutas `/api/*` se reenvían a `BACKEND_URL` (por defecto `http://127.0.0.1:3000`).

## Autorización

`/auth/permisos` devuelve los permisos vigentes. `lib/permissions.ts` evalúa sección, acción y contexto (propiedad, edificio y administración). El shell verifica la navegación y los componentes verifican cada acción; el backend vuelve a autorizar la solicitud. No se infieren privilegios por el nombre visible del rol.

Los permisos se consultan al navegar, al recuperar el foco y después de una denegación 403 o cambios de asignaciones/matrices. Si no pueden verificarse, se ocultan los datos y las acciones hasta actualizar la sesión.

Reservas e incidencias toman el autor de la sesión. Las altas de residentes seleccionan una propiedad de origen elegible. La disponibilidad usa `/reservaciones/disponibilidad`, sin autor ni descripción de terceros. El Administrativo edita/cancela reservas dentro de sus edificios y desvincula usuarios de su administración; la baja global de una cuenta requiere `USUARIOS.DESHABILITAR` global.

La pantalla de Roles permite consultar y, con edición global, reemplazar la matriz. La delegación comprueba permisos propios y, para los roles iniciales de propiedad, los límites documentados en `TP-BACKEND/AUTORIZACION.md`. Expensas solo aparece en la configuración de permisos: el backend todavía no implementa ese módulo.

## Errores

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
npm run lint
npm run build
```

Las pruebas cubren aislamiento de contextos, permisos personalizados y revocados, operaciones propias y administrativas, delegación, contratos de payloads y errores de la API.
