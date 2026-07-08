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
- **Validación**: Antes de implementar un comando, es obligatorio ejecutar `SYSTEM:list-commands` para verificar la existencia y los parámetros requeridos.
- **Prohibido**: No usar mayúsculas en la acción ni guiones bajos (ej. `GET_USERS` $
ightarrow$ ❌, `USER:get-users` $
ightarrow$ ✅).

## 3. Integridad de Datos y Esquemas

- **Tipado Estricto**: Si la infraestructura pide un `integer`, se debe enviar un número. No se deben enviar números como strings (ej. `"1"` $
ightarrow$ ❌, `1` $
ightarrow$ ✅).
- **Traducción de IDs**: Debido a que la App usa UUIDs y la Infra usa Integers, se debe utilizar siempre la función `ensureClientId()` antes de enviar cualquier `tenantId` o `clienteId`.
- **Enums Obligatorios**: Los campos de tipo Enum deben coincidir exactamente.
  - Ejemplo `SYSTEM:log-event` $
ightarrow$ `source` debe ser: `"FRONTEND"`, `"BACKEND"` o `"CLIENT_APP"`.

## 4. Protocolo de Debugging

Ante un error `status: "error"`, analizar en este orden:

1. **`code`**: Categoría del error (ej. `INVALID_PAYLOAD`).
2. **`message`**: Descripción general.
3. **`details`**: Punto exacto del fallo (ej. "data/clienteId must be integer").

---

_Este documento es la autoridad final sobre la comunicación con la Infraestructura. Cualquier cambio en la implementación debe ser validado contra esta guía._
