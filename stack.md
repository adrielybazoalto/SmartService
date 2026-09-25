Aquí tienes el desglose completo del stack tecnológico que van a utilizar en el proyecto:

---

### 1. Frontend (Interfaz de Usuario)

* **Next.js (App Router):** Framework principal full-stack para el manejo de rutas, renderizado del lado del servidor (SSR) y del cliente.


* **React:** Librería empleada para el diseño e implementación de la interfaz de usuario mediante componentes reutilizables.


* **TypeScript:** Lenguaje principal de desarrollo que agrega tipado estático a JavaScript para prevenir errores.


* **Tailwind CSS:** Framework utilitario para la estilización y desarrollo de interfaces modernas y adaptables (responsive).



---

### 2. Backend y Lógica de Negocio

* **Next.js Server Actions / Capa de Servicios:** Lógica de negocio organizada por dominios dentro de la estructura del proyecto (ej. `src/backend`), ejecutada directamente en el servidor.


* **Node.js y npm:** Entorno de ejecución de JavaScript y gestor de paquetes utilizado para levantar el proyecto e instalar dependencias.



---

### 3. Base de Datos y Backend as a Service (BaaS)

* **PostgreSQL:** Motor de base de datos relacional para el almacenamiento estructurado y seguro de la información del taller (clientes, motocicletas, inventario, ventas, órdenes, etc.).


* **Supabase:** Plataforma en la nube basada en PostgreSQL utilizada para alojar y administrar la base de datos, gestionar la autenticación de usuarios y facilitar las conexiones desde la aplicación.



---

### 4. Servicios Externos e Integraciones

* **Stripe:** Pasarela de pagos externa para el procesamiento seguro de transacciones mediante API y webhooks.


* **OpenAI API:** Servicio externo de inteligencia artificial integrado para dar soporte al Asistente IA del sistema.



---

### 5. Herramientas de Desarrollo y Despliegue

* **Vercel:** Plataforma en la nube para el despliegue continuo (CI/CD) y hosting de la aplicación web.


* **Git y GitHub:** Sistema de control de versiones y repositorio colaborativo en la nube.


* **Visual Studio Code:** Entorno de desarrollo integrado (IDE) para la edición, depuración y formateo del código.