# Webauthn SPC Demo - Guía de Despliegue en Vercel

Esta guía explica cómo desplegar la aplicación Webauthn SPC Demo en Vercel.

## Requisitos Previos

- Cuenta en [Vercel](https://vercel.com)
- Cuenta en [Supabase](https://supabase.com)
- (Opcional) Instancia de Redis o servicio compatible (si no se usa Vercel KV)

## Configuración de Variables de Entorno

Las siguientes variables de entorno deben configurarse en el panel de Vercel:

### Configuración Básica

| Variable | Descripción | Valor de Ejemplo | Requerido |
|----------|-------------|-------------------|-----------|
| `NODE_ENV` | Entorno de ejecución | `production` | Sí |
| `SESSION_SECRET` | Secreto para firmar cookies de sesión | Cadena aleatoria segura | Sí |

### Configuración de Supabase

| Variable | Descripción | Dónde encontrarlo | Requerido |
|----------|-------------|-------------------|-----------|
| `SUPABASE_URL` | URL de tu proyecto Supabase | Dashboard de Supabase > Project Settings > API > Project URL | Sí |
| `SUPABASE_ANON_KEY` | Clave anónima de Supabase | Dashboard de Supabase > Project Settings > API > Project API keys > anon public | Sí |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de rol de servicio (para operaciones del lado del servidor) | Dashboard de Supabase > Project Settings > API > Project API keys > service_role secret | Recomendado para producción |

### Configuración de Redis (Opcional)

| Variable | Descripción | Dónde encontrarlo | Requerido |
|----------|-------------|-------------------|-----------|
| `REDIS_URL` | URL de conexión a Redis | Proporcionado por tu proveedor de Redis | No (se usa Vercel KV por defecto) |
| `REDIS_PASSWORD` | Contraseña para Redis | Proporcionado por tu proveedor de Redis | Depende de la configuración de Redis |

## Configuración en Vercel

1. Ve al [panel de control de Vercel](https://vercel.com/dashboard)
2. Selecciona tu proyecto o importa el repositorio
3. Ve a la pestaña "Settings" > "Environment Variables"
4. Agrega cada una de las variables de entorno mencionadas anteriormente
5. Si estás usando un repositorio, puedes habilitar la opción "Automatically expose System Environment Variables"

## Configuración de Dominio Personalizado

1. En el panel de Vercel, ve a la pestaña "Domains"
2. Sigue las instrucciones para configurar tu dominio personalizado
3. Asegúrate de que el DNS esté correctamente configurado en tu proveedor de dominio

## Configuración de Supabase

1. Crea un nuevo proyecto en [Supabase](https://supabase.com)
2. Ejecuta el siguiente script SQL en el editor SQL para crear las tablas necesarias:

```sql
-- Tabla de usuarios
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de credenciales
CREATE TABLE credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL,
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[],
  friendly_name TEXT,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(credential_id)
);

-- Tabla de sesiones
CREATE TABLE sessions (
  sid VARCHAR PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

-- Tabla de desafíos
CREATE TABLE challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Tabla de pagos
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  challenge_id UUID REFERENCES challenges(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para mejorar el rendimiento
CREATE INDEX idx_credentials_user_id ON credentials(user_id);
CREATE INDEX idx_sessions_expire ON sessions(expire);
CREATE INDEX idx_challenges_challenge ON challenges(challenge);
CREATE INDEX idx_payments_user_id ON payments(user_id);
```

## Configuración de Políticas de Seguridad en Supabase

Asegúrate de configurar las políticas de seguridad en Supabase para proteger tus datos. Aquí tienes un ejemplo de políticas recomendadas:

```sql
-- Habilitar RLS (Row Level Security) en todas las tablas
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Políticas para la tabla de usuarios
CREATE POLICY "Los usuarios pueden ver su propio perfil" 
ON users FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Los usuarios pueden actualizar su propio perfil" 
ON users FOR UPDATE 
USING (auth.uid() = id);

-- Políticas para la tabla de credenciales
CREATE POLICY "Los usuarios pueden ver sus propias credenciales" 
ON credentials FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Los usuarios pueden insertar sus propias credenciales" 
ON credentials FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Los usuarios pueden actualizar sus propias credenciales" 
ON credentials FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Los usuarios pueden eliminar sus propias credenciales" 
ON credentials FOR DELETE 
USING (auth.uid() = user_id);

-- Políticas para la tabla de sesiones (manejada por la aplicación)
CREATE POLICY "El servicio puede administrar todas las sesiones" 
ON sessions FOR ALL 
USING (true) WITH CHECK (true);

-- Políticas para la tabla de desafíos
CREATE POLICY "El servicio puede administrar todos los desafíos" 
ON challenges FOR ALL 
USING (true) WITH CHECK (true);

-- Políticas para la tabla de pagos
CREATE POLICY "Los usuarios pueden ver sus propios pagos" 
ON payments FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Los usuarios pueden crear sus propios pagos" 
ON payments FOR INSERT 
WITH CHECK (auth.uid() = user_id);
```

## Despliegue

1. Conecta tu repositorio de GitHub/GitLab o sube tu código a Vercel
2. Asegúrate de que todas las variables de entorno estén configuradas
3. Realiza el despliegue
4. Verifica que la aplicación esté funcionando correctamente

## Solución de Problemas

### Sesiones no persisten
- Verifica que `SESSION_SECRET` esté configurado correctamente
- Asegúrate de que las cookies se estén configurando con el dominio correcto
- Verifica que el almacenamiento de sesión (Vercel KV o Redis) esté funcionando

### Errores de conexión a Supabase
- Verifica que `SUPABASE_URL` y `SUPABASE_ANON_KEY` sean correctos
- Asegúrate de que las políticas de seguridad en Supabase permitan las operaciones necesarias

### Errores en producción pero no en desarrollo
- Verifica que todas las variables de entorno estén configuradas en Vercel
- Revisa los logs de la aplicación en el panel de Vercel
- Asegúrate de que `NODE_ENV` esté configurado como `production`

## Monitoreo

1. **Logs de la Aplicación**: Revisa los logs en el panel de Vercel
2. **Métricas de Rendimiento**: Usa las herramientas de monitoreo de Vercel
3. **Alertas**: Configura alertas para errores y problemas de rendimiento

## Mantenimiento

- Mantén actualizadas las dependencias
- Realiza copias de seguridad periódicas de la base de datos de Supabase
- Monitorea el uso de recursos y escala según sea necesario
