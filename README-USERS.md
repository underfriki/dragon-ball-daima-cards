# Dragon Ball Daima Cards — versión con usuarios

Esta rama prepara la web para:

- registro/inicio de sesión con Supabase Auth;
- colección privada para editar: cada usuario solo puede escribir sus propios datos;
- perfiles visibles entre usuarios autenticados;
- comparación "ellos tienen y tú no" / "tú tienes y ellos no";
- detección de repetidas potenciales para intercambio;
- migración automática del progreso existente desde `localStorage` (`db-daima-checklist-imagenes-v2`) cuando el usuario inicia sesión por primera vez.

## Pendiente para activar

1. Crear/conectar un proyecto de Supabase.
2. Ejecutar `supabase/schema.sql`.
3. Rellenar `supabase-config.js` con la URL pública del proyecto y la anon key.
4. Copiar estos cambios a `main` para publicar con GitHub Pages.
