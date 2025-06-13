# Demo de Secure Payment Confirmation (SPC)

Implementación de prueba de la especificación W3C Secure Payment Confirmation usando WebAuthn.

## Requisitos

- Node.js 18+
- Navegador compatible: Chrome 95+, Edge 95+
- Dispositivo con autenticación biométrica

## Instalación

```bash
npm install
```

## Ejecución

```bash
npm start
```

El servidor se ejecutará en **ambos protocolos**:
- **HTTP**: http://localhost:3000 (para funcionalidades generales)
- **HTTPS**: https://localhost:3443 (requerido para SPC)

⚠️ **Para SPC**: Acepta el certificado auto-firmado en el navegador cuando uses HTTPS.

## Estructura del proyecto

```
├── server/
│   └── index.js          # Servidor Express dual HTTP/HTTPS
├── public/
│   ├── css/
│   │   └── styles.css    # Estilos modernos
│   ├── js/
│   │   ├── utils.js      # Utilidades compartidas (WebAuthn)
│   │   ├── auth.js       # Autenticación y passkeys
│   │   └── payment.js    # Pagos con SPC
│   └── *.html           # Páginas web
├── data/
│   ├── users.json       # Usuarios persistentes
│   └── challenges.json  # Challenges temporales
├── certs/
│   ├── cert.pem         # Certificado SSL (auto-generado)
│   └── key.pem          # Clave privada SSL (auto-generado)
└── package.json
```

## Flujo de uso

### Opción 1: HTTP (funcionalidades básicas)
1. **Registro**: http://localhost:3000/register.html
2. **Login**: http://localhost:3000/login.html
3. **Passkeys**: http://localhost:3000/passkey.html
4. **Pagos**: http://localhost:3000/payment.html *(SPC no funcionará)*

### Opción 2: HTTPS (completo con SPC)
1. **Registro**: https://localhost:3443/register.html
2. **Login**: https://localhost:3443/login.html
3. **Passkeys**: https://localhost:3443/passkey.html
4. **Pagos SPC**: https://localhost:3443/payment.html *(SPC funcional)*

## Configuración del dominio

El proyecto está configurado con `rpID: "demo.savagesoftware.dev"` para funcionar con túneles HTTPS. 

Si necesitas cambiar el dominio:
1. Modifica `rpID` en `server/index.js`
2. Regenera certificados: `npm run generate-certs`
3. Reinicia el servidor

## Habilitar SPC (Experimental)

Para probar SPC completamente, necesitas habilitar banderas experimentales:

### Chrome/Edge:
1. Ve a `chrome://flags/` (o `edge://flags/`)
2. Busca "Secure Payment Confirmation"
3. Habilita la bandera
4. Reinicia el navegador

### Verificación:
- La aplicación verificará automáticamente si PaymentRequest y WebAuthn están disponibles
- Si SPC no está habilitado, verás un mensaje informativo
- Si estás en HTTP, verás un botón para cambiar a HTTPS

## Scripts útiles

```bash
npm start              # Inicia servidores HTTP y HTTPS
npm run setup          # Genera certificados SSL + limpia datos
npm run generate-certs # Solo genera certificados SSL
npm run clean-data     # Solo limpia datos de usuarios
```

## Características

- ✅ Registro y login de usuarios
- ✅ Registro de passkeys con WebAuthn
- ✅ Autenticación con passkeys (incluye autofill)
- ✅ Simulación de pago con SPC
- ✅ Interfaz moderna y responsive
- ✅ **Base de datos persistente** (JSON)
- ✅ **Código modularizado** (utils.js compartido)
- ✅ **Servidor dual HTTP/HTTPS** (flexibilidad de desarrollo)
- ✅ **Redirección automática** (HTTP → HTTPS para SPC)

## Notas

- ✅ **Los datos son persistentes** (se guardan en archivos JSON en `/data/`)
- ⚠️ **No se realizan pagos reales**, es solo una simulación
- ⚠️ **SPC está en estado experimental** - No completamente implementado en navegadores
- 🔧 **Requisitos para SPC**: Chrome 95+ o Edge 95+ con banderas experimentales
- 🌐 **HTTP disponible**: Para desarrollo general en puerto 3000
- 🔐 **HTTPS para SPC**: Puerto 3443 con certificados auto-firmados
- 🔄 **Redirección inteligente**: La app te guía a HTTPS cuando necesites SPC
- 🗂️ **Datos limpios**: Para reiniciar con datos limpios, elimina la carpeta `/data/`
