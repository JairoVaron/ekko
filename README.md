# Ekko — Plataforma de Comunicación Social en Tiempo Real

**Ekko** es una plataforma web de comunicación social que permite a los usuarios conectarse mediante conversaciones en tiempo real, gestionar contactos y personalizar sus perfiles.

Cuenta con una interfaz adaptable, notificaciones y soporte PWA para instalarse en dispositivos compatibles.

## Aplicación desplegada

**Acceso:** https://ekko-75f5.onrender.com

- **Hosting:** Render.
- **Base de datos:** PostgreSQL en Supabase.
- **Repositorio:** GitHub.

## Funcionalidades principales

- Registro e inicio de sesión.
- Verificación de correo electrónico.
- Recuperación de contraseña.
- Mensajería en tiempo real.
- Estados de mensajes enviados, entregados y leídos.
- Búsqueda y gestión de contactos.
- Solicitudes de contacto.
- Bloqueo y desbloqueo de usuarios.
- Historial de conversaciones.
- Personalización del perfil (fotografía, nombre y biografía).
- Notificaciones de actividad.
- Configuración de cuenta y privacidad.
- PWA instalable.
- Página de respaldo para funcionamiento sin conexión.

## Tecnologías utilizadas

| Área | Tecnologías |
|---|---|
| Lenguaje | Java 21 |
| Backend | Spring Boot 4.0.8 |
| Arquitectura | Spring MVC |
| Seguridad | Spring Security |
| Persistencia | Spring Data JPA, Hibernate |
| Tiempo real | WebSocket y STOMP |
| Correo electrónico | JavaMailSender |
| Frontend | HTML5, CSS3 y JavaScript |
| Plantillas | Thymeleaf |
| Diseño | Bootstrap 5 y Bootstrap Icons |
| Base de datos | PostgreSQL |
| Gestión de dependencias | Maven |
| Despliegue | Render |
| Infraestructura | Supabase |
| Control de versiones | Git y GitHub |

## Arquitectura

Ekko utiliza una arquitectura MVC organizada en capas:

- **Controller:** recibe y gestiona las solicitudes.
- **Service:** contiene la lógica de negocio.
- **Repository:** administra el acceso a los datos.
- **Entity:** representa las entidades de la base de datos.
- **DTO:** transporta información entre componentes.
- **Security:** gestiona autenticación y autorización.
- **WebSocket:** permite la comunicación en tiempo real.
- **Templates:** contiene las vistas desarrolladas con Thymeleaf.

La comunicación en tiempo real utiliza WebSocket con STOMP, mientras que PostgreSQL almacena la información de la aplicación.

## Ejecución local

**Requisitos:**
- Java 21 o compatible.
- Git.
- PostgreSQL o una instancia de Supabase.
- Maven (opcional, se incluye Maven Wrapper).

**Pasos:**

1. Clonar el repositorio:

```bash
git clone URL_DEL_REPOSITORIO
```

2. Acceder al proyecto:

```bash
cd plataforma-comunicacion
```

3. Configurar las variables de entorno necesarias:

```properties
DB_URL=
DB_USERNAME=
DB_PASSWORD=
```

También deben configurarse las credenciales SMTP para habilitar la verificación de correo y la recuperación de contraseña.

4. Ejecutar la aplicación en Windows:

```powershell
.\mvnw.cmd spring-boot:run
```

5. Abrir en el navegador:

```text
http://localhost:8080
```

## Despliegue

La aplicación está desplegada en Render y utiliza Supabase como servicio de base de datos PostgreSQL.

El despliegue se gestiona mediante GitHub, conectado al servicio de Render. Las credenciales y configuraciones sensibles se administran mediante variables de entorno.

## Autor

Proyecto académico desarrollado como parte de un trabajo universitario.

**Ekko — Cada mensaje es una onda. Que llegue lejos.**