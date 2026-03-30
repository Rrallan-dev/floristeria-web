// ============================================================
// SEARCH.JS — Buscador y filtros del catálogo público
// El Bunker de las Flores
// ============================================================
//
// Cambios respecto a la versión anterior:
//
//   [NUEVO] Modal de filtros — reemplaza los botones de sección.
//           Un único botón "Filtrar" abre un popup centrado con:
//             · Sección: Ofertas / Novedades
//             · Tags: todos los de TAGS_DISPONIBLES
//           Los filtros son acumulables (Ofertas + romántico).
//           Se aplican al instante al tocarlos.
//           Botón "Limpiar" resetea todos los filtros activos.
//
//   [CAMBIO] filtroSeccion (string | null) →
//            filtrosActivos (Set) que puede contener:
//              'oferta', 'nuevo', y cualquier tag value.
//
//   [NOTA] TAGS_DISPONIBLES se importa desde tags.js.
//          Si la web pública no usa módulos ES, copiar el array
//          directamente acá y eliminar el import.
// ============================================================


// ════════════════════════════════════════════════════════════
// TAGS — lista centralizada
// ════════════════════════════════════════════════════════════
// En producción estos datos vienen de tags.js (mismo array
// que usa la PWA). Se duplican acá para no requerir módulos
// ES en la web estática — search.js se carga con <script defer>
// sin type="module".
// Si en el futuro se migra a módulos, reemplazar este bloque
// con: import { TAGS_DISPONIBLES } from './tags.js';
const TAGS_DISPONIBLES = [
    { value: 'romántico',          label: 'Romántico',          emoji: '' },
    { value: 'regalo',             label: 'Regalo',             emoji: '' },
    { value: 'ramo',               label: 'Ramo',               emoji: '' },
    { value: 'planta de interior', label: 'Planta de interior', emoji: '' },
    { value: 'planta de exterior', label: 'Planta de exterior', emoji: '' },
];


// ════════════════════════════════════════════════════════════
// REFERENCIAS AL DOM
// ════════════════════════════════════════════════════════════
const inputBuscador = document.getElementById('buscador');
const gridCatalogo  = document.getElementById('grid-catalogo');

if (!inputBuscador || !gridCatalogo) {
    throw new Error('[search.js] Elementos del buscador no encontrados. Se omite inicialización.');
}

const todasLasCards = Array.from(gridCatalogo.querySelectorAll('.card'));


// ════════════════════════════════════════════════════════════
// ESTADO
// ════════════════════════════════════════════════════════════

/** Texto que el usuario escribió en el buscador. */
let terminoBusqueda = '';

/**
 * Set de filtros activos. Puede contener cualquier combinación de:
 *   'oferta'              → productos con badge oferta
 *   'nuevo'               → productos con badge nuevo
 *   'romántico'           → productos con ese tag
 *   'regalo'              → productos con ese tag
 *   ... (cualquier value de TAGS_DISPONIBLES)
 *
 * Tarjeta pasa el filtro si tiene AL MENOS UNO de los valores activos.
 * Si el Set está vacío → no hay filtro de categoría activo.
 */
let filtrosActivos = new Set();


// ════════════════════════════════════════════════════════════
// UTILIDADES DE TEXTO
// ════════════════════════════════════════════════════════════

/**
 * Convierte a minúsculas y elimina tildes para comparación
 * insensible a mayúsculas y acentos.
 * @param {string} str
 * @returns {string}
 */
function normalizar(str) {
    if (!str) return '';
    return String(str)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}


// ════════════════════════════════════════════════════════════
// LÓGICA DE FILTRADO Y RELEVANCIA
// ════════════════════════════════════════════════════════════

/**
 * Verifica si todos los caracteres del término aparecen en el
 * texto en orden (tolerancia a errores de tipeo).
 * Solo se activa con términos de 3+ caracteres.
 *
 * @param {string} termino
 * @param {string} texto
 * @returns {boolean}
 */
function fuzzyMatch(termino, texto) {
    let idx = 0;
    for (let i = 0; i < texto.length; i++) {
        if (texto[i] === termino[idx]) {
            if (++idx === termino.length) return true;
        }
    }
    return false;
}

/**
 * Calcula la relevancia de una tarjeta para un término de búsqueda.
 * Sistema de puntos:
 *   100 — Nombre empieza con el término
 *    80 — Nombre contiene el término
 *    60 — Descripción contiene el término
 *    40 — Tags contienen el término
 *    20 — Match difuso en el nombre
 *     0 — Sin coincidencia → se oculta
 *
 * @param {HTMLElement} card
 * @param {string} termino
 * @returns {number}
 */
function calcularRelevancia(card, termino) {
    if (!termino) return 100;

    const t      = normalizar(termino);
    const nombre = normalizar(card.dataset.nombre || '');
    const tags   = normalizar(card.dataset.tags   || '');
    const descEl = card.querySelector('.card-desc');
    const desc   = normalizar(descEl ? descEl.textContent : '');

    if (nombre.startsWith(t))              return 100;
    if (nombre.includes(t))                return 80;
    if (desc.includes(t))                  return 60;
    if (tags.includes(t))                  return 40;
    if (t.length >= 3 && fuzzyMatch(t, nombre)) return 20;

    return 0;
}

/**
 * Verifica si una tarjeta pasa los filtros de categoría activos.
 * Lógica OR: la tarjeta pasa si coincide con AL MENOS UN filtro.
 *
 * @param {HTMLElement} card
 * @returns {boolean}
 */
function pasaFiltroCategoria(card) {
    if (filtrosActivos.size === 0) return true;

    // Verificar filtros de sección (oferta / nuevo)
    if (filtrosActivos.has('oferta') && card.querySelector('.card-badge.oferta')) return true;
    if (filtrosActivos.has('nuevo')  && card.querySelector('.card-badge.nuevo'))  return true;

    // Verificar filtros de tag
    // data-tags contiene los tags separados por espacio (sin normalizar)
    const tagsProducto = (card.dataset.tags || '').split('|').filter(Boolean);
    for (const tagActivo of filtrosActivos) {
        if (tagActivo === 'oferta' || tagActivo === 'nuevo') continue;
        if (tagsProducto.some(t => normalizar(t) === normalizar(tagActivo))) return true;
    }

    return false;
}

/**
 * Aplica búsqueda + filtros de categoría, ordena por relevancia
 * y actualiza la visibilidad del DOM.
 */
function aplicarFiltros() {
    const termino = terminoBusqueda.trim();

    const resultados = todasLasCards
        .map(card => ({ card, relevancia: calcularRelevancia(card, termino) }))
        .filter(({ card, relevancia }) => relevancia > 0 && pasaFiltroCategoria(card));

    resultados.sort((a, b) => b.relevancia - a.relevancia);

    // Ocultar todas
    todasLasCards.forEach(card => { card.style.display = 'none'; });

    // Mostrar y reordenar las que pasan
    resultados.forEach(({ card }) => {
        card.style.display = '';
        gridCatalogo.appendChild(card);
    });

    actualizarMensajeVacio(resultados.length, termino);
    actualizarBadgeFiltros();
}

// ════════════════════════════════════════════════════════════
// SCROLL HORIZONTAL — Flechas de navegación (desktop)
//                     + Hint de deslizamiento (mobile)
// ════════════════════════════════════════════════════════════

/**
 * Para cada sección con scroll horizontal:
 *   - Desktop: inyecta botones prev/next y actualiza su estado
 *   - Mobile:  inyecta un toast "deslizá" que desaparece solo
 *              (solo la primera vez, usando sessionStorage)
 */
function inicializarScrollSecciones() {
    const wraps = document.querySelectorAll('.scroll-horizontal-wrap');

    wraps.forEach((wrap, idx) => {
        const track = wrap.querySelector('.scroll-horizontal');
        if (!track) return;

        // ── Flechas (desktop) ────────────────────────────────
        const btnPrev = document.createElement('button');
        const btnNext = document.createElement('button');

        btnPrev.className  = 'scroll-nav-btn scroll-nav-btn--prev';
        btnNext.className  = 'scroll-nav-btn scroll-nav-btn--next';
        btnPrev.innerHTML  = '‹';
        btnNext.innerHTML  = '›';
        btnPrev.setAttribute('aria-label', 'Ver anteriores');
        btnNext.setAttribute('aria-label', 'Ver siguientes');

        wrap.appendChild(btnPrev);
        wrap.appendChild(btnNext);

        // Cuánto desplazar: ancho de una tarjeta + gap
        function getScrollAmount() {
            const card = track.querySelector('.card');
            if (!card) return 240;
            const style = getComputedStyle(track);
            const gap   = parseFloat(style.gap) || 24;
            return card.offsetWidth + gap;
        }

        btnPrev.addEventListener('click', () => {
            track.scrollBy({ left: -getScrollAmount(), behavior: 'smooth' });
        });

        btnNext.addEventListener('click', () => {
            track.scrollBy({ left: getScrollAmount(), behavior: 'smooth' });
        });

        // Actualizar estado disabled de los botones
        function actualizarBotones() {
            const max = track.scrollWidth - track.clientWidth;
            btnPrev.disabled = track.scrollLeft <= 2;
            btnNext.disabled = track.scrollLeft >= max - 2;
        }

        track.addEventListener('scroll', actualizarBotones, { passive: true });
        // Llamar una vez al cargar para el estado inicial
        actualizarBotones();
        // Volver a verificar cuando las imágenes carguen y cambien el tamaño
        window.addEventListener('load', actualizarBotones);

        // ── Hint de deslizamiento (mobile, solo 1 vez por sesión) ──
        const hintKey = `scrollHintMostrado_${idx}`;
        const yaVisto = sessionStorage.getItem(hintKey);

        // Detectar si el contenido realmente requiere scroll
        // (puede que haya pocos productos y no haya overflow)
        const necesitaScroll = track.scrollWidth > track.clientWidth + 10;

        if (!yaVisto && necesitaScroll) {
            const hint = document.createElement('span');
            hint.className   = 'scroll-hint';
            hint.textContent = 'Deslizá para ver más';
            wrap.appendChild(hint);

            sessionStorage.setItem(hintKey, '1');

            // Remover el elemento del DOM al terminar la animación
            hint.addEventListener('animationend', () => hint.remove());
        }
    });
}

// Esperar a que el DOM esté listo
// (search.js ya se carga con defer, así que el DOM está disponible)
inicializarScrollSecciones();

/**
 * Muestra u oculta el mensaje "sin resultados".
 */
function actualizarMensajeVacio(cant, termino) {
    let el = gridCatalogo.querySelector('.sin-resultados');

    if (cant === 0) {
        if (!el) {
            el = document.createElement('p');
            el.className = 'sin-resultados empty-section';
            gridCatalogo.appendChild(el);
        }
        el.textContent = termino
            ? `No encontramos productos para "${termino}". Probá con otras palabras.`
            : 'No hay productos con los filtros seleccionados.';
        el.style.display = '';
    } else {
        if (el) el.style.display = 'none';
    }
}


// ════════════════════════════════════════════════════════════
// MODAL DE FILTROS
// ════════════════════════════════════════════════════════════

/**
 * Crea e inyecta el botón "Filtrar" y el modal de filtros
 * justo antes de la grilla del catálogo.
 *
 * Estructura del modal:
 *   .filtros-modal-overlay  ← fondo semitransparente, click cierra
 *     .filtros-modal
 *       .filtros-modal-header
 *         h3 "Filtrar productos"
 *         button ✕ (cerrar)
 *       .filtros-modal-body
 *         .filtros-grupo  ← Sección (Ofertas / Novedades)
 *         .filtros-grupo  ← Tags
 *       .filtros-modal-footer
 *         button "Limpiar filtros"
 */
function crearModalFiltros() {

    // ── Botón que abre el modal ──────────────────────────────
    const btnFiltrar = document.createElement('button');
    btnFiltrar.id        = 'btn-filtrar';
    btnFiltrar.className = 'btn-filtrar';
    btnFiltrar.setAttribute('aria-haspopup', 'dialog');
    btnFiltrar.setAttribute('aria-expanded', 'false');
    btnFiltrar.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5" aria-hidden="true">
            <line x1="4"  y1="6"  x2="20" y2="6"/>
            <line x1="8"  y1="12" x2="16" y2="12"/>
            <line x1="11" y1="18" x2="13" y2="18"/>
        </svg>
        <span>Filtrar</span>
        <span id="filtros-badge" class="filtros-badge hidden">0</span>
    `;

    // ── Overlay + modal ──────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.id        = 'filtros-overlay';
    overlay.className = 'filtros-modal-overlay hidden';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'filtros-titulo');

    overlay.innerHTML = `
        <div class="filtros-modal" role="document">

            <div class="filtros-modal-header">
                <h3 id="filtros-titulo">Filtrar productos</h3>
                <button id="filtros-cerrar" class="filtros-cerrar" aria-label="Cerrar filtros">✕</button>
            </div>

            <div class="filtros-modal-body">

                <!-- Grupo: Sección -->
                <div class="filtros-grupo">
                    <p class="filtros-grupo-titulo">Sección</p>
                    <div class="filtros-chips">
                        <button
                            class="filtro-chip"
                            data-filtro="oferta"
                            aria-pressed="false"
                        >🏷️ Ofertas</button>
                        <button
                            class="filtro-chip"
                            data-filtro="nuevo"
                            aria-pressed="false"
                        >✨ Novedades</button>
                    </div>
                </div>

                <!-- Grupo: Tags -->
                <div class="filtros-grupo">
                    <p class="filtros-grupo-titulo">Categoría</p>
                    <div class="filtros-chips" id="filtros-tags">
                        ${TAGS_DISPONIBLES.map(tag => `
                            <button
                                class="filtro-chip"
                                data-filtro="${tag.value}"
                                aria-pressed="false"
                            >${tag.emoji} ${tag.label}</button>
                        `).join('')}
                    </div>
                </div>

            </div>

            <div class="filtros-modal-footer">
                <button id="filtros-limpiar" class="filtros-limpiar">
                    Limpiar filtros
                </button>
            </div>

        </div>
    `;

    // ── Insertar en el DOM ───────────────────────────────────
    // El botón va en un wrapper flex junto al buscador
    const buscadorWrap = document.querySelector('.buscador-wrap');
    if (buscadorWrap) {
        buscadorWrap.classList.add('buscador-filtros-wrap');
        buscadorWrap.appendChild(btnFiltrar);
    } else {
        gridCatalogo.parentNode.insertBefore(btnFiltrar, gridCatalogo);
    }

    // El overlay va en el body para que quede sobre todo
    document.body.appendChild(overlay);

    // ── Manejadores de eventos ───────────────────────────────
    btnFiltrar.addEventListener('click', abrirModal);
    document.getElementById('filtros-cerrar').addEventListener('click', cerrarModal);

    // Click en el overlay (fuera del modal) cierra
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cerrarModal();
    });

    // Escape cierra el modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) cerrarModal();
    });

    // Chips de filtro — toggle inmediato
    overlay.querySelectorAll('.filtro-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const valor = chip.dataset.filtro;
            if (filtrosActivos.has(valor)) {
                filtrosActivos.delete(valor);
                chip.classList.remove('activo');
                chip.setAttribute('aria-pressed', 'false');
            } else {
                filtrosActivos.add(valor);
                chip.classList.add('activo');
                chip.setAttribute('aria-pressed', 'true');
            }
            aplicarFiltros();
        });
    });

    // Botón limpiar
    document.getElementById('filtros-limpiar').addEventListener('click', () => {
        limpiarFiltros();
    });
}

function abrirModal() {
    const overlay  = document.getElementById('filtros-overlay');
    const btnAbrir = document.getElementById('btn-filtrar');
    overlay.classList.remove('hidden');
    btnAbrir.setAttribute('aria-expanded', 'true');
    // Focus en el botón cerrar para accesibilidad de teclado
    document.getElementById('filtros-cerrar').focus();
    // Bloquear scroll del body
    document.body.style.overflow = 'hidden';
}

function cerrarModal() {
    const overlay  = document.getElementById('filtros-overlay');
    const btnAbrir = document.getElementById('btn-filtrar');
    overlay.classList.add('hidden');
    btnAbrir.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    btnAbrir.focus();
}

/**
 * Resetea todos los filtros de categoría activos,
 * actualiza los chips del modal y reaaplica el filtrado.
 */
function limpiarFiltros() {
    filtrosActivos.clear();
    document.querySelectorAll('.filtro-chip').forEach(chip => {
        chip.classList.remove('activo');
        chip.setAttribute('aria-pressed', 'false');
    });
    aplicarFiltros();
}

/**
 * Actualiza el badge numérico sobre el botón "Filtrar"
 * y su estilo según si hay filtros activos.
 */
function actualizarBadgeFiltros() {
    const badge  = document.getElementById('filtros-badge');
    const btn    = document.getElementById('btn-filtrar');
    if (!badge || !btn) return;

    const count = filtrosActivos.size;

    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
        btn.classList.add('activo');
    } else {
        badge.classList.add('hidden');
        btn.classList.remove('activo');
    }
}


// ════════════════════════════════════════════════════════════
// ESTILOS DINÁMICOS
// ════════════════════════════════════════════════════════════

function inyectarEstilos() {
    const style = document.createElement('style');
    style.textContent = `

        /* ── Wrapper buscador + botón filtrar ── */
        .buscador-filtros-wrap {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            margin-bottom: 1.25rem;
        }

        .buscador-filtros-wrap #buscador {
            flex: 1;
            margin-bottom: 0;
        }

        /* ── Input buscador ── */
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

        #buscador::placeholder { color: var(--texto-suave); }

        /* ── Botón Filtrar ── */
        .btn-filtrar {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            padding: 0.72rem 1.1rem;
            border: 1.5px solid var(--borde);
            border-radius: 999px;
            background: white;
            color: var(--texto-suave);
            font-size: 0.875rem;
            font-family: var(--fuente-cuerpo);
            font-weight: 500;
            cursor: pointer;
            white-space: nowrap;
            position: relative;
            transition: all 0.2s;
            flex-shrink: 0;
        }

        .btn-filtrar:hover,
        .btn-filtrar.activo {
            border-color: var(--verde);
            color: var(--verde);
            background: var(--verde-suave);
        }

        /* Badge numérico sobre el botón */
        .filtros-badge {
            background: var(--rosa);
            color: white;
            font-size: 0.65rem;
            font-weight: 700;
            min-width: 18px;
            height: 18px;
            border-radius: 999px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0 4px;
            line-height: 1;
        }

        .filtros-badge.hidden { display: none; }

        /* ── Overlay del modal ── */
        .filtros-modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.45);
            backdrop-filter: blur(3px);
            -webkit-backdrop-filter: blur(3px);
            z-index: 200;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1.25rem;
            animation: fadeOverlay 0.2s ease;
        }

        .filtros-modal-overlay.hidden { display: none; }

        @keyframes fadeOverlay {
            from { opacity: 0; }
            to   { opacity: 1; }
        }

        /* ── Modal ── */
        .filtros-modal {
            background: white;
            border-radius: 16px;
            width: 100%;
            max-width: 420px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
            animation: slideModal 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
            overflow: hidden;
        }

        @keyframes slideModal {
            from { opacity: 0; transform: translateY(20px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }

        /* Header del modal */
        .filtros-modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1.25rem 1.5rem 1rem;
            border-bottom: 1px solid var(--borde);
        }

        .filtros-modal-header h3 {
            font-family: var(--fuente-titulo);
            font-size: 1.1rem;
            color: var(--texto);
        }

        .filtros-cerrar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: none;
            background: var(--crema);
            color: var(--texto-suave);
            font-size: 0.9rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s, color 0.2s;
            font-family: inherit;
        }

        .filtros-cerrar:hover {
            background: var(--rosa-suave);
            color: var(--rosa);
        }

        /* Cuerpo del modal */
        .filtros-modal-body {
            padding: 1.25rem 1.5rem;
            display: flex;
            flex-direction: column;
            gap: 1.25rem;
        }

        .filtros-grupo-titulo {
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--texto-suave);
            margin-bottom: 0.6rem;
        }

        /* Chips de filtro */
        .filtros-chips {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
        }

        .filtro-chip {
            padding: 0.45rem 0.9rem;
            border: 1.5px solid var(--borde);
            border-radius: 999px;
            background: white;
            color: var(--texto);
            font-size: 0.875rem;
            font-family: var(--fuente-cuerpo);
            cursor: pointer;
            transition: all 0.15s;
            font-weight: 400;
        }

        .filtro-chip:hover {
            border-color: var(--verde);
            color: var(--verde);
            background: var(--verde-suave);
        }

        .filtro-chip.activo {
            background: var(--verde);
            border-color: var(--verde);
            color: white;
            font-weight: 500;
        }

        /* Footer del modal */
        .filtros-modal-footer {
            padding: 1rem 1.5rem 1.25rem;
            border-top: 1px solid var(--borde);
        }

        .filtros-limpiar {
            width: 100%;
            padding: 0.65rem;
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

        .filtros-limpiar:hover {
            border-color: var(--rosa);
            color: var(--rosa);
            background: var(--rosa-suave);
        }

        /* ── Mensaje sin resultados ── */
        .sin-resultados {
            grid-column: 1 / -1;
        }

        /* ── Responsive ── */
        @media (max-width: 480px) {
            .filtros-modal {
                max-width: 100%;
                border-radius: 16px 16px 0 0;
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
            }

            .filtros-modal-overlay {
                align-items: flex-end;
                padding: 0;
            }

            @keyframes slideModal {
                from { transform: translateY(100%); }
                to   { transform: translateY(0);    }
            }
        }
    `;
    document.head.appendChild(style);
}


// ════════════════════════════════════════════════════════════
// EVENTOS DEL BUSCADOR
// ════════════════════════════════════════════════════════════

inputBuscador.addEventListener('input', (e) => {
    terminoBusqueda = e.target.value;
    aplicarFiltros();
});

inputBuscador.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        inputBuscador.value = '';
        terminoBusqueda     = '';
        aplicarFiltros();
        inputBuscador.blur();
    }
});



// ════════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ════════════════════════════════════════════════════════════
inyectarEstilos();
crearModalFiltros();
aplicarFiltros();

// ── Menú hamburguesa (mobile) ────────────────────────────────
(function() {
    const btnMenu = document.getElementById('btn-menu');
    const nav     = document.getElementById('site-nav');
    if (!btnMenu || !nav) return;

    // Agregar botón cerrar dentro del nav
    const btnCerrar = document.createElement('button');
    btnCerrar.innerHTML = '✕';
    btnCerrar.setAttribute('aria-label', 'Cerrar menú');
    btnCerrar.style.cssText = `
        position: absolute;
        top: 1.25rem;
        right: 1.25rem;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        border: 1.5px solid var(--borde);
        background: white;
        font-size: 1.1rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--texto-suave);
        font-family: inherit;
    `;
    nav.appendChild(btnCerrar);

    function abrirMenu() {
        nav.classList.add('abierto');
        btnMenu.classList.add('abierto');
        btnMenu.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';
    }

    function cerrarMenu() {
        nav.classList.remove('abierto');
        btnMenu.classList.remove('abierto');
        btnMenu.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
    }

    btnMenu.addEventListener('click', () => {
        nav.classList.contains('abierto') ? cerrarMenu() : abrirMenu();
    });

    btnCerrar.addEventListener('click', cerrarMenu);

    nav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', cerrarMenu);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') cerrarMenu();
    });
})();