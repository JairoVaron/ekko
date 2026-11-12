# Ekko — Plataforma de Comunicación Social en Tiempo Real

**Ekko** es una plataforma web de comunicación social que permite a los usuarios conectarse e interactuar mediante conversaciones en tiempo real, gestionar contactos y personalizar sus perfiles.

La aplicación integra herramientas de comunicación instantánea, notificaciones, protección contra bots, almacenamiento de imágenes en la nube y tecnología PWA para ofrecer una experiencia adaptable a diferentes dispositivos.

## Aplicación desplegada

**Acceso:** [https://ekko-75f5.onrender.com](https://ekko-75f5.onrender.com)

- **Hosting:** Render.
- **Base de datos:** PostgreSQL en Supabase.
- **Almacenamiento de imágenes:** Cloudinary.
- **Protección contra bots:** Cloudflare Turnstile.
- **Repositorio:** GitHub.

## Funcionalidades principales

### Usuarios y perfiles
- Registro e inicio de sesión.
- Verificación de correo electrónico.
- Recuperación de contraseña.
- Edición del perfil (nombre, fotografía y biografía).
- Carga, almacenamiento y gestión de fotografías mediante Cloudinary.
- Eliminación de cuentas.
- Configuración de cuenta y privacidad.

### Contactos y relaciones sociales
- Búsqueda de usuarios.
- Envío, aceptación y rechazo de solicitudes de contacto.
- Gestión de contactos.
- Bloqueo y desbloqueo de usuarios.
- Actualización de contactos y solicitudes en tiempo real.

### Mensajería y comunicación
- Conversaciones privadas en tiempo real.
- Envío y recepción de mensajes mediante WebSocket.
- Estados de mensajes enviados, entregados y leídos.
- Indicadores de escritura.
- Historial de conversaciones.
- Actualización dinámica de conversaciones y mensajes recientes.
- Notificaciones de actividad.

### Seguridad y protección
- Autenticación y autorización mediante Spring Security.
- Protección de formularios mediante Cloudflare Turnstile.
- Validación de datos.
- Control de acceso a conversaciones.
- Gestión de usuarios bloqueados.

### Aplicación web progresiva (PWA)
- Instalación en dispositivos compatibles.
- Experiencia adaptable a dispositivos móviles y escritorio.
- Soporte para funcionamiento sin conexión.
- Página de respaldo offline.
- Service Worker y almacenamiento en caché de recursos.

## Tecnologías utilizadas

| Área | Tecnologías |
|---|---|
| Lenguaje | Java 21 |
| Framework backend | Spring Boot 4.0.8 |
| Arquitectura | Spring MVC |
| Seguridad | Spring Security |
| Validación | Jakarta Bean Validation |
| Persistencia | Spring Data JPA, Hibernate |
| Comunicación en tiempo real | WebSocket y STOMP |
| Correo electrónico | Spring Boot Mail, JavaMailSender |
| Frontend | HTML5, CSS3 y JavaScript |
| Motor de plantillas | Thymeleaf |
| Diseño e interfaz | Bootstrap 5 y Bootstrap Icons |
| Base de datos | PostgreSQL |
| Almacenamiento de imágenes | Cloudinary |
| Protección contra bots | Cloudflare Turnstile |
| Gestión de dependencias | Maven |
| Servidor de despliegue | Render |
| Infraestructura de base de datos | Supabase |
| Control de versiones | Git y GitHub |

## Servicios e integraciones externas

### Cloudinary
Se utiliza para almacenar y gestionar las fotografías de perfil de los usuarios, evitando depender del almacenamiento local del servidor para los archivos multimedia.

La integración se realiza desde el backend mediante la biblioteca oficial de Cloudinary para Java.

### Cloudflare Turnstile
Se utiliza como mecanismo de protección frente a bots y solicitudes automatizadas en los formularios de la aplicación.

La validación se realiza mediante las claves de configuración correspondientes y la verificación del token en el backend.

### Supabase
Proporciona la infraestructura de PostgreSQL utilizada para almacenar la información de usuarios, contactos, solicitudes, conversaciones y mensajes.

### Render
Aloja la aplicación Spring Boot y permite automatizar los despliegues mediante la integración con el repositorio de GitHub.

## Arquitectura

Ekko utiliza una arquitectura MVC organizada en capas, separando las responsabilidades de presentación, lógica de negocio y acceso a datos.

- **Controller:** recibe y gestiona las solicitudes HTTP.
- **Service:** contiene la lógica de negocio de la aplicación.
- **Repository:** administra el acceso y las operaciones sobre la base de datos.
- **Entity:** representa las entidades persistentes.
- **DTO:** transporta y valida información entre los componentes.
- **Config:** contiene las configuraciones de los servicios y componentes de la aplicación.
- **Security:** gestiona la autenticación, autorización y protección de recursos.
- **WebSocket:** administra la comunicación bidireccional en tiempo real.
- **Templates:** contiene las vistas desarrolladas con Thymeleaf.

La comunicación instantánea utiliza WebSocket con STOMP, mientras que PostgreSQL se encarga de la persistencia de los datos.

Las imágenes se gestionan mediante Cloudinary y la protección contra bots se integra mediante Cloudflare Turnstile.

## Estructura del proyecto

```text
plataforma-comunicacion/
│
├── src/
│   └── main/
│       ├── java/
│       │   └── com/plataforma/comunicacion/
│       │       ├── config/
│       │       ├── controller/
│       │       ├── dto/
│       │       ├── entity/
│       │       ├── repository/
│       │       ├── security/
│       │       └── service/
│       │
│       └── resources/
│           ├── static/
│           │   ├── css/
│           │   ├── js/
│           │   ├── images/
│           │   └── icons/
│           │
│           ├── templates/
│           ├── application.yaml
│           ├── application-local.yaml
│           └── application-prod.yaml
│
├── .gitignore
├── mvnw
├── mvnw.cmd
└── pom.xml
```

## Ejecución local

### Requisitos

- Java Development Kit (JDK) 21.
- Git.
- PostgreSQL o una instancia de Supabase.
- Maven (opcional, el proyecto incluye Maven Wrapper).
- Cuenta de Cloudinary para la gestión de imágenes.
- Credenciales de Cloudflare Turnstile.
- Configuración SMTP para el envío de correos electrónicos.

### 1. Clonar el repositorio

```bash
git clone URL_DEL_REPOSITORIO
```

### 2. Acceder al proyecto

```bash
cd plataforma-comunicacion
```

### 3. Configurar las variables de entorno

Configurar las credenciales y los servicios externos necesarios.

**Base de datos:**

```properties
DB_URL=
DB_USERNAME=
DB_PASSWORD=
```

**Cloudinary:**

```properties
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

**Cloudflare Turnstile:**

```properties
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
TURNSTILE_HOSTNAME=
```

También deben configurarse las variables SMTP correspondientes para habilitar la verificación de correo electrónico y la recuperación de contraseña.

Las credenciales deben mantenerse fuera del repositorio y nunca publicarse en archivos versionados.

### 4. Ejecutar la aplicación

En Windows:

```powershell
.\mvnw.cmd spring-boot:run
```

En Linux o macOS:

```bash
./mvnw spring-boot:run
```

### 5. Acceder a la aplicación

Abrir el navegador en:

```text
http://localhost:8080
```

## Despliegue

La aplicación se encuentra desplegada en **Render**, utilizando **Supabase** como servicio de base de datos PostgreSQL.

El proceso de despliegue está integrado con GitHub, de manera que las actualizaciones enviadas a la rama principal del repositorio pueden activar automáticamente una nueva implementación.

Las credenciales de los servicios externos, como Cloudinary, Cloudflare Turnstile, SMTP y PostgreSQL, se administran mediante variables de entorno configuradas en Render.

## Autor

Proyecto académico desarrollado como parte de un trabajo universitario.

**Ekko — Cada mensaje es una onda. Que llegue lejos.**