# 🌐 Guía de Implementación para Frontend: Business Logic Engine (Versión PROD)

Esta guía detalla la implementación de seguridad de grado industrial para la integración con el Gateway.

---

## 🔒 Seguridad de Sesión (Zero Trust)

A diferencia de implementaciones básicas, este sistema **no utiliza localStorage** para guardar tokens, eliminando la vulnerabilidad a ataques XSS.

### 🛠️ Cómo funciona la Autenticación

1. **Login**: El frontend envía las credenciales a `POST /login`.
2. **Respuesta**: El servidor **no devuelve el token en el JSON**. En su lugar, envía una cookie `HttpOnly` llamada `session_token`.
3. **Persistencia**: El navegador guarda la cookie automáticamente. JavaScript **no puede leerla ni modificarla**.
4. **Peticiones**: En cada llamada a la API, el navegador adjunta la cookie automáticamente.

**⚠️ Importante para el Frontend**:

- NO intentes guardar el token en localStorage.
- Al configurar tu cliente HTTP (como Axios), debes activar la opción `withCredentials: true` para que el navegador envíe las cookies al servidor.

---

## 🚀 1. Flujo de Onboarding

### Paso A: Registro de Empresa

- **Acción**: `POST /register`
- **Payload**: `{ "username": "...", "password": "...", "nombreCliente": "..." }`

### Paso B: Inicio de Sesión

- **Acción**: `POST /login`
- **Payload**: `{ "username": "...", "password": "..." }`
- **Resultado**: Si es exitoso, el servidor establece la cookie de sesión. El frontend solo debe redirigir al Dashboard.

---

## 🛠️ 2. Ejecución de Comandos de Negocio

El sistema utiliza el patrón de comando único para máxima flexibilidad.

### Ejecución Maestro

- **Acción**: `POST /execute`
- **Header**: `Content-Type: application/json` (No necesitas enviar el token, viaja en la cookie).
- **Payload**:
  ```json
  {
    "cmd": "stock.add",
    "params": { "code": "...", "name": "...", "price": 10.5, "quantity": 5 }
  }
  ```

### Descubrimiento de Funcionalidades

Consulta `GET /commands` para obtener la lista de comandos disponibles y sus parámetros requeridos.

---

## 🛡️ 3. Manejo de Errores y UX

El servidor devuelve un objeto de error estandarizado. El frontend debe priorizar la visualización del campo `user_message`, ya que contiene la instrucción exacta para el usuario final en español.

| Código                  | Mensaje Sugerido / Acción                                              |
| :---------------------- | :--------------------------------------------------------------------- |
| `AUTH_FAILED`           | Mostrar `user_message` ("Usuario o contraseña incorrectos").           |
| `UNAUTHORIZED`          | Mostrar `user_message` y redirigir al `/login`.                        |
| `FORBIDDEN`             | Mostrar `user_message` ("Sin permisos").                               |
| `VALIDATION_ERROR`      | Mostrar `user_message` y resaltar campos basados en el array `errors`. |
| `MISSING_PARAMS`        | Mostrar `user_message` ("Faltan datos obligatorios").                  |
| `PLAN_REQUIRED`         | Mostrar `user_message` y sugerir actualización de plan.                |
| `TOO_MANY_REQUESTS`     | Mostrar `user_message` y sugerir esperar unos segundos.                |
| `INTERNAL_SERVER_ERROR` | Mostrar `user_message` y sugerir reintentar más tarde.                 |

**Ejemplo de respuesta de error:**

```json
{
  "success": false,
  "message": "Invalid request parameters",
  "user_message": "Los datos ingresados no son válidos. Por favor, revisa los campos marcados en rojo.",
  "error": {
    "source": "VALIDATION",
    "code": "VALIDATION_ERROR",
    "details": [ ... ]
  }
}
```

---

## 🔄 4. Ciclo de Vida de la Sesión

1. **Inicio App**: Llamar a `GET /me`.
   - **Si responde 200**: El usuario está autenticado. Cargar perfil.
   - **Si responde 401/403**: Redirigir al `/login`.
2. **Operaciones**: Ejecutar comandos vía `/execute`.
3. **Cierre de Sesión**: El frontend debe llamar a un endpoint de logout (o simplemente redirigir al login y dejar que la cookie expire/sea borrada por el servidor).

---

## 🚦 Checklist de Producción para Frontend

- [ ] ¿Tengo `withCredentials: true` configurado en mi cliente API?
- [ ] ¿He eliminado cualquier lógica de `localStorage.getItem('token')`?
- [ ] ¿Manejo la redirección al Login cuando recibo un `401` o `403`?
- [ ] ¿Utilizo `/commands` para validar que los datos enviados al `/execute` son correctos?
