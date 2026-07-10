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

| Código | Acción en el Frontend |
| :--- | :--- |
| `AUTH_FAILED` | Mostrar "Credenciales incorrectas". |
| `FORBIDDEN` | El token expiró o la sesión fue revocada. Redirigir al `/login`. |
| `TOO_MANY_REQUESTS` | Mostrar alerta de bloqueo temporal por seguridad. |
| `Validation failed` | Mostrar errores específicos por campo usando el array `errors`. |

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
