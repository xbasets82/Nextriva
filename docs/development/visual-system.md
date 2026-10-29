# Sistema visual de Nextriva

La Issue #170 armoniza la interfaz existente sin cambiar contratos, permisos ni reglas de negocio. Los recursos originales de marca se conservan en `apps/web/public/`.

## Superficies y color

`apps/web/src/index.css` centraliza los colores de texto, bordes, campos, superficies y foco. La paleta clara utiliza azul marino para el texto, azul corporativo para foco/detalles, superficies blancas y neutros azulados. Los colores semánticos de estado y prioridad conservan sus componentes y significados.

La clase `app-canvas` aplica un degradado radial CSS tenue sobre un fondo claro. No incorpora imágenes ni animaciones. `--canvas-background` y `--canvas-glow` tienen equivalentes oscuros; el proyecto conserva sus tokens `.dark`, sin añadir un selector de tema.

## Acciones

La clase compartida `action-primary` identifica acciones principales con superficie blanca, texto marino, borde corporativo y peso seminegrita. Incluye hover, active, foco y disabled; los controles conservan sus indicadores de carga. Su transición respeta `prefers-reduced-motion`.

Las reglas de `action-primary` quedan fuera de las capas de Tailwind para que su superficie, borde y texto prevalezcan sobre utilidades heredadas de controles de icono. La validación visual comprueba los colores calculados de una acción real.

Las acciones secundarias mantienen su borde neutro y menor énfasis. Las destructivas conservan el color semántico. No se cambia `--primary`, utilizado también por gráficos y otros elementos ajenos a los botones.

Inventario de acciones principales armonizadas:

| Pantalla                 | Acción                   |
| ------------------------ | ------------------------ |
| Login                    | Iniciar sesión           |
| Usuarios                 | Crear usuario            |
| Formulario de usuario    | Guardar usuario          |
| Promociones              | Crear promoción          |
| Formulario de promoción  | Guardar promoción        |
| Estado de promoción      | Confirmar cambio         |
| Incidencias              | Crear incidencia         |
| Selección de promoción   | Continuar                |
| Formulario de incidencia | Guardar/crear incidencia |

Los fondos de overlays y tooltips no forman parte de este inventario: mantienen el contraste necesario para su función.

## Distribución

El shell privado utiliza `--content-width: 90rem` como límite y márgenes adaptables. Evita estirar indefinidamente el contenido en monitores grandes. Los listados pasan a dos columnas a partir de 1280 px; el orden de lectura del DOM se conserva. Los formularios cortos mantienen anchos contenidos (usuarios 42rem, promociones 48rem); detalle/formulario de incidencia conserva su límite de 64rem.

Home distribuye el resumen y las incidencias prioritarias en dos paneles desde 1280 px y conserva lectura vertical en tamaños menores. No se modifica su ordenación ni el origen de sus datos.

## Cabecera e identidad

La cabecera utiliza una superficie blanca natural para integrar el fondo del wordmark original sin filtros ni cambios de sus colores. La navegación utiliza columnas laterales equilibradas para mantener el centro respecto a la pantalla. En móvil ocupa una segunda fila. El wordmark conserva su proporción original, con un ancho de 160 px en móvil/tablet, 224 px en portátil y 256 px en escritorio.

`AccountIdentity` recibe el usuario que ya ha recuperado `SessionGate`: no solicita datos ni decide permisos. Muestra nombre y rol en escritorio y avatar con iniciales en tamaños compactos. Un disclosure nativo revela nombre, rol y correo; se abre con teclado y Escape lo cierra devolviendo el foco al control. Las acciones existentes de contraseña y logout se conservan en la misma zona de cuenta. Al desaparecer la sesión, desaparece también la identidad.

## Reglas para ampliaciones

- Reutilizar tokens y variantes antes de introducir valores locales.
- Mantener nombres accesibles, foco visible y controles táctiles existentes.
- Conservar iconos y colores semánticos de estados/prioridades.
- Validar datos largos, zoom y estados vacíos/carga/error.
- No cambiar layouts ni estilos de la landing sin comprobarla visualmente.
- Las comprobaciones automáticas no sustituyen la inspección de capturas con datos sintéticos.
