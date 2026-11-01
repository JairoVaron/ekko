# Ekko — Plataforma de Comunicación Social en Tiempo Real

**Ekko** es una plataforma web de comunicación social desarrollada con Java y Spring Boot, diseñada para permitir que los usuarios se comuniquen mediante conversaciones en tiempo real, administren sus contactos y personalicen su perfil.

La aplicación cuenta con una interfaz web adaptable, mecanismos de comunicación mediante WebSocket y funcionalidades PWA para facilitar su instalación y uso desde diferentes dispositivos.

## Aplicación desplegada

**Acceso a Ekko:** https://ekko-75f5.onrender.com

La aplicación se encuentra desplegada en **Render**, con PostgreSQL administrado mediante **Supabase**.

## Funcionalidades principales

- **Registro e inicio de sesión:** creación de cuentas y autenticación de usuarios.
- **Verificación de correo electrónico:** validación de cuentas mediante correo electrónico.
- **Recuperación de contraseña:** recuperación de acceso mediante correo electrónico.
- **Mensajería en tiempo real:** envío y recepción de mensajes sin necesidad de recargar la página.
- **Estado de mensajes:** seguimiento de mensajes entregados y leídos.
- **Gestión de contactos:** búsqueda de usuarios, solicitudes de contacto y administración de contactos.
- **Bloqueo de usuarios:** herramientas para gestionar la privacidad de las interacciones.
- **Conversaciones:** consulta y administración del historial de conversaciones.
- **Perfil de usuario:** personalización del nombre visible, fotografía y biografía.
- **Configuración y privacidad:** opciones relacionadas con la cuenta y la privacidad.
- **Notificaciones:** avisos de actividad y nuevos mensajes.
- **PWA:** posibilidad de instalar Ekko como aplicación en dispositivos compatibles.
- **Experiencia sin conexión:** página de respaldo cuando no hay conexión a Internet, mediante Service Worker y recursos almacenados en caché.

## Tecnologías utilizadas

### Backend
- Java 21
- Spring Boot
- Spring MVC
- Spring Security
- Spring Data JPA
- Maven
- WebSocket
- STOMP
- JavaMailSender

### Frontend
- HTML5
- CSS3
- JavaScript
- Thymeleaf
- Bootstrap 5
- Bootstrap Icons

### Base de datos
- PostgreSQL
- Supabase

### Despliegue e infraestructura
- Render — alojamiento y despliegue de la aplicación.
- GitHub — repositorio y control de versiones.
- Supabase — servicio de base de datos PostgreSQL.
- PWA y Service Workers — instalación y experiencia sin conexión.

## Arquitectura general

Ekko utiliza una arquitectura basada en Spring Boot:

- **Controladores:** gestionan las solicitudes HTTP y las interacciones con las vistas.
- **Servicios:** contienen la lógica de negocio.
- **Repositorios:** permiten acceder y administrar los datos mediante JPA.
- **Entidades:** representan la información almacenada en PostgreSQL.
- **Vistas:** utilizan Thymeleaf para generar las páginas web.
- **WebSocket/STOMP:** permiten la comunicación bidireccional y la actualización de mensajes en tiempo real.

## Despliegue y funcionamiento

La aplicación está publicada en Render y utiliza una base de datos PostgreSQL alojada en Supabase.

Para utilizarla, no es necesario instalar Java, Maven ni configurar una base de datos local.

1. Acceder a la aplicación: https://ekko-75f5.onrender.com
2. Crear una cuenta o iniciar sesión.
3. Verificar el correo electrónico cuando corresponda.
4. Comenzar a utilizar las funcionalidades de comunicación de Ekko.

El despliegue se gestiona mediante el repositorio de GitHub conectado a Render.

## Configuración del entorno

Para ejecutar una instancia propia del proyecto se requiere:

- Java 21.
- Maven.
- Una base de datos PostgreSQL.
- Las variables de entorno necesarias para la conexión a la base de datos y la configuración del correo electrónico.

La configuración de producción utiliza variables de entorno para evitar almacenar credenciales directamente en el código fuente.

Entre las variables de conexión a la base de datos se encuentran:

- `DB_URL`
- `DB_USERNAME`
- `DB_PASSWORD`

También se deben configurar los parámetros SMTP correspondientes para habilitar el envío de correos electrónicos.

## Seguridad

El proyecto incorpora Spring Security para gestionar la autenticación y proteger las funcionalidades de la aplicación.

Además, contempla mecanismos de verificación de correo electrónico, recuperación de contraseña y administración de la privacidad de los usuarios.

## Autor

Proyecto académico desarrollado como parte de un trabajo universitario.

**Ekko — Cada mensaje es una onda. Que llegue lejos.**