# 🚀 Guía de Integración: Infrastructure Engine API

Este documento establece los mandatos técnicos obligatorios para cualquier interacción entre la plataforma Node.js y el Motor de Infraestructura. El sistema es estricto por diseño; cualquier desviación resultará en un error de `INVALID_PAYLOAD` o `CMD_NOT_FOUND`.

## 1. Reglas de Comunicación

- **Endpoint Único**: Todas las peticiones deben ir a `POST /execute`.
- **Autenticación**: El token **DEBE** viajar en el cuerpo (body) del JSON.
- **Formato de Petición**:
  ```json
  {
    "token": "STRING",
    "command": "DOMINIO:accion",
    "payload": { ... }
  }
  ```

## 2. Convención de Comandos (DOMAIN:action)

- **Formato**: `DOMINIO` (MAYÚSCULAS) + `:` + `accion` (minúsculas y guiones).
- **Validación**: Antes de implementar un comando, ejecutar `SYSTEM:list-commands` para verificar la existencia y los parámetros requeridos.
- **Prohibido**: No usar mayúsculas en la acción ni guiones bajos (ej. `GET_USERS` $
ightarrow$ ❌, `USER:get-users` $
ightarrow$ ✅).

## 3. Integridad de Datos y Esquemas

- **Tipado Estricto**: Si la infraestructura pide un `integer`, se debe enviar un número. No se deben enviar números como strings.
- **Traducción de IDs**: Debido a que la App usa UUIDs y la Infra usa Integers, se debe utilizar siempre la función `ensureClientId()` antes de enviar cualquier `tenantId` o `clienteId`.
- **Enums Obligatorios**: Los campos de tipo Enum deben coincidir exactamente.

## 4. Protocolo de Debugging

Ante un error `status: "error"`, analizar en este orden:

1. **`code`**: Categoría del error (ej. `INVALID_PAYLOAD`).
2. **`message`**: Descripción general.
3. **`details`**: Punto exacto del fallo.

---

## 5. Endpoints de Gestión de Identidad y Acceso (API Gateway)

Además de la ejecución de comandos, el Gateway expone endpoints directos para la gestión de cuentas y perfiles:

### 🔐 Autenticación y Registro

- `POST /register`: Registro de nueva cuenta de negocio.
  - **Payload**: `{ "username": "...", "password": "...", "nombreCliente": "..." }`
- `POST /login`: Inicio de sesión para obtener el Bearer Token.
  - **Payload**: `{ "username": "...", "password": "..." }`
- `GET /me`: Obtiene el perfil detallado del usuario autenticado (requiere Bearer Token).

### ⚙️ Comandos de Sistema (USER & SYSTEM)

Los siguientes comandos están disponibles a través de `POST /execute` para la administración avanzada:

- `system.client.register`: Registra un nuevo cliente en la infraestructura.
- `system.client.update_plan`: Cambia el plan de suscripción del cliente.
- `system.users.create`: Crea un nuevo usuario empleado.
- `system.users.list`: Lista todos los empleados y sus permisos.
- `system.events.list`: Recupera eventos del sistema.
- `system.audit.get_logs`: Recupera la traza de auditoría.

---

_Este documento es la autoridad final sobre la comunicación con la Infraestructura. Cualquier cambio en la implementación debe ser validado contra esta guía._
