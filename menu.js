// ============================================================
// MENU.JS — Menú hamburguesa mobile
// El Bunker de las Flores
// ============================================================
// Se carga en template-index.html y template-producto.html.
// Crea un panel dropdown que aparece debajo del botón,
// sin ocupar toda la pantalla.
// ============================================================

(function () {
    const btnMenu = document.getElementById('btn-menu');
    if (!btnMenu) return;

    // ── Crear el panel ───────────────────────────────────────
    const panel = document.createElement('div');
    panel.id        = 'menu-panel';
    panel.className = 'menu-panel';
    panel.setAttribute('role',       'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Menú de navegación');

    // Botón cerrar dentro del panel
    const btnCerrar = document.createElement('button');
    btnCerrar.className = 'menu-panel-cerrar';
    btnCerrar.innerHTML = '✕';
    btnCerrar.setAttribute('aria-label', 'Cerrar menú');
    panel.appendChild(btnCerrar);

    // Links — se clonan del nav original si existe,
    // o se usan los hardcodeados como fallback (template-producto)
    const navOriginal = document.getElementById('site-nav');
    const linksData = navOriginal
        ? Array.from(navOriginal.querySelectorAll('a')).map(a => ({
              href: a.getAttribute('href'),
              text: a.textContent.trim()
          }))
        : [
              { href: '../index.html#ofertas',   text: 'Ofertas'   },
              { href: '../index.html#novedades', text: 'Novedades' },
              { href: '../index.html#catalogo',  text: 'Catálogo'  },
              { href: '../index.html#contacto',  text: 'Contacto'  },
          ];

    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Secciones');
    linksData.forEach(({ href, text }) => {
        const a = document.createElement('a');
        a.href        = href;
        a.textContent = text;
        a.className   = 'menu-panel-link';
        nav.appendChild(a);
    });
    panel.appendChild(nav);

    // Insertar el panel justo después del header
    const header = document.querySelector('.site-header');
    if (header && header.parentNode) {
        header.parentNode.insertBefore(panel, header.nextSibling);
    } else {
        document.body.appendChild(panel);
    }

    // ── Lógica de apertura / cierre ──────────────────────────
    function estaAbierto() {
        return panel.classList.contains('abierto');
    }

    function abrir() {
        panel.classList.add('abierto');
        btnMenu.classList.add('abierto');
        btnMenu.setAttribute('aria-expanded', 'true');
        btnCerrar.focus();
    }

    function cerrar() {
        panel.classList.remove('abierto');
        btnMenu.classList.remove('abierto');
        btnMenu.setAttribute('aria-expanded', 'false');
        btnMenu.focus();
    }

    btnMenu.addEventListener('click', () => estaAbierto() ? cerrar() : abrir());
    btnCerrar.addEventListener('click', cerrar);

    // Click en un link cierra el panel
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', cerrar));

    // Click fuera del panel cierra
    document.addEventListener('click', (e) => {
        if (estaAbierto() && !panel.contains(e.target) && !btnMenu.contains(e.target)) {
            cerrar();
        }
    });

    // Escape cierra
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && estaAbierto()) cerrar();
    });
})();