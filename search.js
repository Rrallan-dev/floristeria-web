// ============================================================
// SEARCH.JS — Buscador del catálogo público
// El Bunker de las Flores
// ============================================================
// Este script se carga en la portada con "defer", lo que
// significa que se ejecuta DESPUÉS de que todo el HTML fue
// parseado. Por eso es seguro buscar elementos del DOM
// directamente al inicio, sin esperar ningún evento.
//
// Características del buscador:
//   - Búsqueda difusa (fuzzy): tolera errores de tipeo,
//     tildes faltantes y coincidencias parciales
//   - Busca en nombre, descripción y tags simultáneamente
//   - Ordena por relevancia (nombre > descripción > tags)
//   - Filtro por sección (Ofertas / Novedades)
//   - Combina texto libre + filtro de sección a la vez
//   - Sin librerías externas — Node.js puro
// ============================================================


// ════════════════════════════════════════════════════════════
// REFERENCIAS AL DOM
// ════════════════════════════════════════════════════════════
// Buscamos los elementos que vamos a necesitar UNA sola vez
// al inicio y los guardamos en variables. Es más eficiente
// que llamar a getElementById/querySelector en cada tecleo.
// ════════════════════════════════════════════════════════════
const inputBuscador  = document.getElementById('buscador');
const gridCatalogo   = document.getElementById('grid-catalogo');

// Si el input o la grilla no existen en la página (por ejemplo,
// en la página de un producto individual), salimos silenciosamente.
// Esto evita errores de JS en páginas que no tienen buscador.
if (!inputBuscador || !gridCatalogo) {
    // "throw" detiene la ejecución del resto del script
    throw new Error('[search.js] Elementos del buscador no encontrados. Se omite inicialización.');
}

// Todas las tarjetas del catálogo, convertidas a Array para
// poder usar .filter(), .forEach(), .sort(), etc.
// querySelectorAll devuelve un NodeList (no un Array real).
// Array.from() lo convierte.
const todasLasCards = Array.from(gridCatalogo.querySelectorAll('.card'));


// ════════════════════════════════════════════════════════════
// ESTADO DEL BUSCADOR
// ════════════════════════════════════════════════════════════
// Guardamos el estado actual del filtro en estas dos variables.
// Cuando el usuario escribe o toca un botón, actualizamos el
// estado y llamamos a aplicarFiltros() para redibujar.
// ════════════════════════════════════════════════════════════
let terminoBusqueda  = '';   // Texto que el usuario escribió
let filtroSeccion    = null; // 'oferta' | 'nuevo' | null (= sin filtro)


// ════════════════════════════════════════════════════════════
// FUNCIÓN: normalizar(str)
// ════════════════════════════════════════════════════════════
// Convierte un string a minúsculas y elimina tildes y
// caracteres especiales del español.
//
// ¿Por qué es necesario?
//   Sin esto, buscar "rosas" no encontraría "Rósas" ni "ROSAS".
//   Con normalización, todos se convierten a "rosas" antes
//   de comparar, haciendo la búsqueda insensible a mayúsculas
//   y tildes.
//
// normalize('NFD') descompone cada carácter acentuado en dos:
//   'á' → 'a' + acento (dos caracteres separados)
// replace(/[\u0300-\u036f]/g, '') elimina todos los acentos
// (el rango Unicode \u0300-\u036f son los "modificadores").
//
// Ejemplo:
//   normalizar('Rósas Rójás') → 'rosas rojas'
//   normalizar('MAÑANA')      → 'manana'
// ════════════════════════════════════════════════════════════
function normalizar(str) {
    if (!str) return '';
    return String(str)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}


// ════════════════════════════════════════════════════════════
// FUNCIÓN: calcularRelevancia(card, termino)
// ════════════════════════════════════════════════════════════
// Dado una tarjeta y un término de búsqueda, devuelve un
// número que indica qué tan relevante es esa tarjeta.
//
// Sistema de puntuación:
//   100 — El nombre comienza exactamente con el término
//    80 — El nombre contiene el término
//    60 — La descripción contiene el término
//    40 — Los tags contienen el término
//    20 — Búsqueda difusa: el término está "distribuido" en el nombre
//     0 — Sin coincidencia → la tarjeta se oculta
//
// La puntuación más alta gana en el ordenamiento final.
// Esto hace que "rosas rojas" aparezca antes que un producto
// cuya descripción menciona "rosas" de pasada.
//
// Los datos de cada tarjeta se leen de los atributos data-*
// que build.js escribió en el HTML:
//   data-nombre="Ramo de rosas rojas"
//   data-tags="romántico regalos"
//
// ¿Por qué no buscar en el texto visible del HTML?
//   Los atributos data-* tienen el texto limpio (sin HTML tags,
//   sin precios, sin badges). Es más confiable y rápido.
// ════════════════════════════════════════════════════════════
function calcularRelevancia(card, termino) {
    if (!termino) return 100; // Sin término → todas son igualmente relevantes

    const t = normalizar(termino);

    // Leer datos de la tarjeta desde los atributos data-*
    const nombre = normalizar(card.dataset.nombre || '');
    const tags   = normalizar(card.dataset.tags   || '');

    // La descripción está en el párrafo .card-desc dentro de la tarjeta.
    // Si no existe ese párrafo, usamos string vacío.
    const descEl = card.querySelector('.card-desc');
    const desc   = normalizar(descEl ? descEl.textContent : '');

    // ── Coincidencias exactas y parciales ──
    if (nombre.startsWith(t))   return 100; // "rosas" busca "Rosas rojas" → 100
    if (nombre.includes(t))     return 80;  // "roja" busca "Ramo rojo" → 80
    if (desc.includes(t))       return 60;  // término en descripción → 60
    if (tags.includes(t))       return 40;  // término en tags → 40

    // ── Búsqueda difusa — tolerancia a errores de tipeo ──────────────
    // Si hasta acá no hubo match, probamos la búsqueda difusa.
    // El algoritmo verifica si todos los caracteres del término aparecen
    // en el nombre EN ORDEN, aunque no sean contiguos.
    //
    // Ejemplo:
    //   término: "rmo"  → busca r...m...o en orden → encuentra "ramo"
    //   término: "rsas" → busca r...s...a...s → encuentra "rosas"
    //   término: "tulpan" → busca t...u...l...p...a...n → encuentra "tulipán"
    //
    // No es perfecto (puede dar falsos positivos en términos muy cortos),
    // por eso solo se activa si el término tiene 3+ caracteres.
    if (t.length >= 3 && fuzzyMatch(t, nombre)) return 20;

    return 0; // Sin coincidencia de ningún tipo
}


// ════════════════════════════════════════════════════════════
// FUNCIÓN: fuzzyMatch(termino, texto)
// ════════════════════════════════════════════════════════════
// Verifica si todos los caracteres de "termino" aparecen en
// "texto" en orden, aunque no sean contiguos.
//
// Es el mismo algoritmo que usan editores como VS Code para
// el buscador de archivos (Ctrl+P): escribís "cmpnt" y
// encuentra "component.js".
//
// Retorna true/false.
//
// Ejemplo:
//   fuzzyMatch('rmo', 'ramo')    → true  (r_mo → r·a·m·o, encuentra r..m..o)
//   fuzzyMatch('tulpan', 'tulipan') → true
//   fuzzyMatch('xyz', 'rosas')   → false
// ════════════════════════════════════════════════════════════
function fuzzyMatch(termino, texto) {
    let indiceBusqueda = 0; // Posición actual en el término que estamos buscando

    for (let i = 0; i < texto.length; i++) {
        if (texto[i] === termino[indiceBusqueda]) {
            indiceBusqueda++;
            // Si ya encontramos todos los caracteres del término → match!
            if (indiceBusqueda === termino.length) return true;
        }
    }
    return false; // No encontramos todos los caracteres en orden
}


// ════════════════════════════════════════════════════════════
// FUNCIÓN: aplicarFiltros()
// ════════════════════════════════════════════════════════════
// Función central. Se llama cada vez que el usuario escribe
// o cambia el filtro de sección. Hace tres cosas:
//
//   1. Calcula la relevancia de cada tarjeta
//   2. Filtra las que tienen relevancia 0 (sin match)
//   3. Ordena las visibles por relevancia (mayor primero)
//   4. Reordena el DOM y muestra/oculta tarjetas
//   5. Muestra un mensaje si no hay resultados
// ════════════════════════════════════════════════════════════
function aplicarFiltros() {
    const termino = terminoBusqueda.trim();

    // Calcular relevancia para cada tarjeta y guardarla junto a la card
    const resultados = todasLasCards.map(card => ({
        card,
        relevancia: calcularRelevancia(card, termino)
    }));

    // Filtrar por sección si hay un filtro activo.
    // Las tarjetas con badge de "oferta" tienen un span.card-badge.oferta dentro.
    // Usamos querySelector para verificar si ese badge existe.
    const filtrados = resultados.filter(({ card, relevancia }) => {
        if (relevancia === 0) return false; // Sin coincidencia de texto → ocultar siempre

        if (filtroSeccion === 'oferta') {
            return card.querySelector('.card-badge.oferta') !== null;
        }
        if (filtroSeccion === 'nuevo') {
            return card.querySelector('.card-badge.nuevo') !== null;
        }

        return true; // Sin filtro de sección → mostrar todas las que tuvieron match
    });

    // Ordenar por relevancia descendente (mayor puntaje primero)
    filtrados.sort((a, b) => b.relevancia - a.relevancia);

    // ── Actualizar visibilidad de cada tarjeta ──
    // Primero ocultar todas
    todasLasCards.forEach(card => {
        card.style.display = 'none';
    });

    // Luego mostrar y reordenar solo las que pasaron el filtro
    filtrados.forEach(({ card }) => {
        card.style.display = ''; // Restablecer display (usa el del CSS)
        gridCatalogo.appendChild(card); // Mover al final → queda en orden de relevancia
    });

    // ── Mensaje de sin resultados ──
    actualizarMensajeVacio(filtrados.length, termino);
}


// ════════════════════════════════════════════════════════════
// FUNCIÓN: actualizarMensajeVacio(cantResultados, termino)
// ════════════════════════════════════════════════════════════
// Muestra u oculta el mensaje "sin resultados" según si la
// búsqueda devolvió algo o no.
//
// El mensaje se crea dinámicamente la primera vez y se
// reutiliza en las siguientes (no se crea un elemento nuevo
// en cada tecleo).
// ════════════════════════════════════════════════════════════
function actualizarMensajeVacio(cantResultados, termino) {
    // Buscar o crear el elemento de mensaje vacío
    let mensajeEl = gridCatalogo.querySelector('.sin-resultados');

    if (cantResultados === 0) {
        if (!mensajeEl) {
            // Crear el elemento la primera vez
            mensajeEl = document.createElement('p');
            mensajeEl.className = 'sin-resultados empty-section';
            gridCatalogo.appendChild(mensajeEl);
        }
        // El mensaje cambia según si hay término de búsqueda o filtro activo
        if (termino) {
            mensajeEl.textContent = `No encontramos productos para "${termino}". Probá con otras palabras.`;
        } else {
            mensajeEl.textContent = 'No hay productos en esta sección por el momento.';
        }
        mensajeEl.style.display = '';
    } else {
        // Hay resultados → ocultar el mensaje si existe
        if (mensajeEl) mensajeEl.style.display = 'none';
    }
}


// ════════════════════════════════════════════════════════════
// FUNCIÓN: crearBotonesFiltro()
// ════════════════════════════════════════════════════════════
// Inserta los botones de filtro por sección (Ofertas / Novedades)
// justo encima de la grilla del catálogo.
//
// ¿Por qué se crean desde JS y no están en el HTML?
//   Si JS no carga (browser muy viejo, error de red), los botones
//   simplemente no aparecen — el catálogo se ve igual de bien
//   pero sin la funcionalidad de filtro. Esto se llama
//   "progressive enhancement" (mejora progresiva).
// ════════════════════════════════════════════════════════════
function crearBotonesFiltro() {
    const wrap = document.createElement('div');
    wrap.className = 'filtros-wrap';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Filtrar por sección');

    // Definición de los botones: valor interno + texto visible
    const botones = [
        { valor: null,     texto: 'Todos' },
        { valor: 'oferta', texto: '🏷️ Ofertas' },
        { valor: 'nuevo',  texto: '✨ Novedades' },
    ];

    botones.forEach(({ valor, texto }) => {
        const btn = document.createElement('button');
        btn.textContent = texto;
        btn.className   = 'filtro-btn';
        btn.dataset.filtro = valor ?? 'todos'; // Para identificarlo después

        // El botón "Todos" empieza activo
        if (valor === null) btn.classList.add('activo');

        btn.addEventListener('click', () => {
            // Actualizar estado
            filtroSeccion = valor;

            // Actualizar estilos: quitar "activo" de todos y ponérselo al clickeado
            wrap.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('activo'));
            btn.classList.add('activo');

            // Reaplicar filtros con la nueva sección
            aplicarFiltros();
        });

        wrap.appendChild(btn);
    });

    // Insertar el grupo de botones antes de la grilla
    gridCatalogo.parentNode.insertBefore(wrap, gridCatalogo);
}


// ════════════════════════════════════════════════════════════
// ESTILOS DINÁMICOS — Inyectados desde JS
// ════════════════════════════════════════════════════════════
// Los estilos del buscador y los botones de filtro se inyectan
// desde JS porque pertenecen a elementos que JS crea.
// Si search.js no carga, estos estilos tampoco cargan — y
// como los elementos no existen, no hay nada que estilizar.
// ════════════════════════════════════════════════════════════
function inyectarEstilos() {
    const style = document.createElement('style');
    style.textContent = `
        /* ── Input buscador ── */
        .buscador-wrap {
            margin-bottom: 1.25rem;
        }

        #buscador {
            width: 100%;
            padding: 0.75rem 1rem 0.75rem 2.75rem;
            font-size: 1rem;
            border: 1.5px solid var(--borde);
            border-radius: 999px;
            background: white url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%236b6b6b' stroke-width='2'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.35-4.35'/%3E%3C/svg%3E") no-repeat 1rem center;
            background-size: 18px;
            transition: border-color 0.2s, box-shadow 0.2s;
            color: var(--texto);
            font-family: var(--fuente-cuerpo);
            box-sizing: border-box;
        }

        #buscador:focus {
            outline: none;
            border-color: var(--verde);
            box-shadow: 0 0 0 3px rgba(74, 124, 89, 0.15);
        }

        #buscador::placeholder {
            color: var(--texto-suave);
        }

        /* ── Botones de filtro por sección ── */
        .filtros-wrap {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
            margin-bottom: 1.25rem;
        }

        .filtro-btn {
            padding: 0.4rem 1rem;
            border: 1.5px solid var(--borde);
            border-radius: 999px;
            background: white;
            color: var(--texto-suave);
            font-size: 0.875rem;
            font-family: var(--fuente-cuerpo);
            cursor: pointer;
            transition: all 0.2s;
            font-weight: 500;
        }

        .filtro-btn:hover {
            border-color: var(--verde);
            color: var(--verde);
        }

        .filtro-btn.activo {
            background: var(--verde);
            border-color: var(--verde);
            color: white;
        }

        /* ── Mensaje sin resultados ── */
        .sin-resultados {
            grid-column: 1 / -1;
        }
    `;
    document.head.appendChild(style);
}


// ════════════════════════════════════════════════════════════
// EVENTO: Escuchar el input del buscador
// ════════════════════════════════════════════════════════════
// El evento "input" se dispara en cada tecleo (a diferencia
// de "change" que solo se dispara al salir del campo).
// Esto hace que la búsqueda sea en tiempo real.
//
// No usamos debounce (retraso artificial) porque el catálogo
// es pequeño y el filtrado es instantáneo. Si el catálogo
// creciera a cientos de productos, se podría agregar.
// ════════════════════════════════════════════════════════════
inputBuscador.addEventListener('input', (e) => {
    terminoBusqueda = e.target.value;
    aplicarFiltros();
});

// Limpiar búsqueda al presionar Escape — mejora de UX
inputBuscador.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        inputBuscador.value = '';
        terminoBusqueda     = '';
        aplicarFiltros();
        inputBuscador.blur(); // Quitar foco del input
    }
});


// ════════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ════════════════════════════════════════════════════════════
// Orden importa:
//   1. Inyectar estilos primero (antes de crear elementos)
//   2. Crear botones de filtro
//   3. Aplicar filtros inicial (muestra todas las tarjetas)
// ════════════════════════════════════════════════════════════
inyectarEstilos();
crearBotonesFiltro();
aplicarFiltros(); // Ejecutar una vez al inicio para el estado inicial correcto