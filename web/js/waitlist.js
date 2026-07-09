/**
 * waitlist.js — Captura de leads "Sé de los primeros 1.000 operadores".
 *
 * Expone window.ICCWaitlist, que auto-cablea TODOS los formularios con la
 * clase .waitlist-form presentes en la pagina. Al enviar:
 *   1) preventDefault y validacion ligera de email en cliente,
 *   2) POST a /api/waitlist con { email, club, source } (source = data-source),
 *   3) deshabilita el boton durante el envio,
 *   4) muestra exito o error en el <p class="waitlist-msg"> via .is-ok/.is-error,
 *   5) si existe window.ICCAnalytics, dispara track('waitlist_signup').
 *
 * Todo va envuelto en try/catch para degradar con elegancia (incluso en
 * file://, sin red o con la API caida). Nunca rompe la UX. IIFE, sin modulos.
 */

(function () {
  // URL relativa de la API gestionada (Azure Static Web Apps expone /api).
  const ENDPOINT = "/api/waitlist";

  /**
   * Lee el codigo de referido de la URL (?ref=XXXX). Devuelve "" si no viene o
   * no tiene forma valida (alfanumerico, 4-12 chars). El servidor revalida.
   * @returns {string}
   */
  function refFromUrl() {
    try {
      const raw = new URLSearchParams(window.location.search).get("ref") || "";
      const code = raw.trim().toUpperCase();
      return /^[0-9A-Z]{4,12}$/.test(code) ? code : "";
    } catch (_err) {
      return ""; // entorno sin URLSearchParams / file://
    }
  }

  /**
   * Construye el enlace de invitacion del operador a partir de su codigo.
   * Apunta a la raiz del sitio (el simulador), que es el mejor gancho.
   * @param {string} code
   * @returns {string}
   */
  function shareUrlFor(code) {
    try {
      const url = new URL("/", window.location.href);
      url.search = "?ref=" + encodeURIComponent(code);
      return url.toString();
    } catch (_err) {
      return "?ref=" + code;
    }
  }

  /**
   * Pinta el bloque de invitacion bajo el formulario, con el enlace propio y un
   * boton de copiar. Idempotente: si ya existe, solo actualiza el enlace.
   * @param {HTMLFormElement} form
   * @param {string} code
   * @param {number} referrals
   */
  function showReferral(form, code, referrals) {
    if (!code) return;
    try {
      const link = shareUrlFor(code);

      let box = form.querySelector(".waitlist-referral");
      if (!box) {
        box = document.createElement("div");
        box.className = "waitlist-referral";

        const lead = document.createElement("p");
        lead.className = "waitlist-referral-lead";
        box.appendChild(lead);

        const row = document.createElement("div");
        row.className = "waitlist-referral-row";

        const input = document.createElement("input");
        input.type = "text";
        input.className = "text-input waitlist-referral-link";
        input.readOnly = true;
        input.setAttribute("aria-label", "Tu enlace de invitación");

        const copy = document.createElement("button");
        copy.type = "button";
        copy.className = "btn ghost-btn waitlist-referral-copy";
        copy.textContent = "Copiar";
        copy.addEventListener("click", function () {
          copyToClipboard(input.value, copy);
        });

        row.append(input, copy);
        box.append(row);
        form.appendChild(box);
      }

      const leadEl = box.querySelector(".waitlist-referral-lead");
      leadEl.textContent =
        referrals > 0
          ? "Invita y sube en la lista. Ya has traído " +
            referrals +
            (referrals === 1 ? " operador." : " operadores.")
          : "Invita a otros operadores con tu enlace:";

      box.querySelector(".waitlist-referral-link").value = link;
      box.hidden = false;
    } catch (_err) {
      /* el bloque de invitacion nunca debe romper el alta */
    }
  }

  /**
   * Copia texto al portapapeles con feedback en el boton. Degrada a select()
   * si la Clipboard API no esta disponible (http:// o navegador antiguo).
   * @param {string} text
   * @param {HTMLButtonElement} button
   */
  function copyToClipboard(text, button) {
    const done = function () {
      const original = button.textContent;
      button.textContent = "¡Copiado!";
      setTimeout(function () {
        button.textContent = original;
      }, 1600);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {
          /* permiso denegado: no hacemos nada ruidoso */
        });
        return;
      }
    } catch (_err) {
      /* caemos al fallback */
    }
    try {
      const input = button.parentNode.querySelector(".waitlist-referral-link");
      input.select();
      done();
    } catch (_err) {
      /* sin portapapeles: el enlace sigue visible y seleccionable a mano */
    }
  }

  // Mensajes de UI (centralizados para coherencia de marca).
  const MSG = {
    ok: "Estás en la lista. Te avisaremos del Primer Toque.",
    invalidEmail: "Introduce un correo electrónico válido.",
    error: "No hemos podido registrarte ahora mismo. Inténtalo de nuevo.",
    sending: "Enviando…",
  };

  // Texto del boton mientras se envia (se restaura al terminar).
  const SENDING_LABEL = "Enviando…";

  /**
   * Validacion ligera de formato de email en cliente. El servidor es la
   * autoridad final; esto solo evita envios obviamente invalidos.
   * @param {string} email
   * @returns {boolean}
   */
  function isValidEmail(email) {
    if (typeof email !== "string") return false;
    const value = email.trim();
    // Patron conservador: algo@algo.tld sin espacios.
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  /**
   * Pinta un mensaje en el <p class="waitlist-msg"> del formulario.
   * @param {HTMLElement|null} msgEl  Elemento de mensaje (puede ser null).
   * @param {string} text             Texto a mostrar.
   * @param {"ok"|"error"|"info"} kind Variante visual.
   */
  function showMessage(msgEl, text, kind) {
    if (!msgEl) return;
    try {
      msgEl.textContent = text;
      msgEl.classList.remove("is-ok", "is-error");
      if (kind === "ok") msgEl.classList.add("is-ok");
      else if (kind === "error") msgEl.classList.add("is-error");
      msgEl.hidden = false;
    } catch (_err) {
      /* Si el DOM no coopera, ignoramos para no romper la UX. */
    }
  }

  /**
   * Dispara la analitica de registro si el modulo esta disponible.
   * @param {string} source
   */
  function trackSignup(source) {
    try {
      if (
        window.ICCAnalytics &&
        typeof window.ICCAnalytics.track === "function"
      ) {
        window.ICCAnalytics.track("waitlist_signup", { source: source || "" });
      }
    } catch (_err) {
      /* La analitica nunca debe romper la UX. */
    }
  }

  /**
   * Gestiona el envio de un formulario .waitlist-form concreto.
   * @param {SubmitEvent} event
   * @param {HTMLFormElement} form
   */
  async function handleSubmit(event, form) {
    try {
      event.preventDefault();
    } catch (_err) {
      /* Entorno raro sin preventDefault: continuamos igualmente. */
    }

    const emailEl = form.querySelector('input[name="email"]');
    const clubEl = form.querySelector('input[name="club"]');
    const button = form.querySelector('button[type="submit"], button');
    const msgEl = form.querySelector(".waitlist-msg");
    const source = (form.getAttribute("data-source") || "").trim();

    const email = emailEl && emailEl.value ? emailEl.value.trim() : "";
    const club = clubEl && clubEl.value ? clubEl.value.trim() : "";

    // Validacion en cliente: feedback inmediato sin tocar la red.
    if (!isValidEmail(email)) {
      showMessage(msgEl, MSG.invalidEmail, "error");
      try {
        if (emailEl) emailEl.focus();
      } catch (_err) {
        /* ignorar */
      }
      return;
    }

    // Estado "enviando": deshabilitar boton y guardar su etiqueta original.
    let originalLabel = "";
    if (button) {
      originalLabel = button.textContent;
      button.disabled = true;
      try {
        button.textContent = SENDING_LABEL;
      } catch (_err) {
        /* ignorar */
      }
    }
    showMessage(msgEl, MSG.sending, "info");

    try {
      // Adjuntamos el codigo de quien invito (si llegamos por un enlace ?ref=).
      const payload = { email: email, club: club, source: source, ref: refFromUrl() };

      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data = null;
      try {
        data = await response.json();
      } catch (_parseErr) {
        data = null;
      }

      if (response.ok && data && data.ok) {
        // Exito: confirmamos, limpiamos el formulario y registramos analitica.
        showMessage(msgEl, MSG.ok, "ok");
        trackSignup(source);
        try {
          form.reset();
        } catch (_resetErr) {
          /* ignorar */
        }
        // Le damos su enlace de invitacion: el bucle viral empieza aqui.
        showReferral(form, data.code, Number(data.referrals) || 0);
        // Tras un alta correcta dejamos el boton inhabilitado para evitar
        // reenvios accidentales del mismo lead.
        if (button) {
          button.disabled = true;
          try {
            button.textContent = "Listo";
          } catch (_err) {
            /* ignorar */
          }
        }
        return;
      }

      // Error controlado del servidor (p.ej. 400 email invalido) sin exponer
      // detalles internos crudos.
      const serverMsg =
        data && typeof data.error === "string" && data.error.length < 160
          ? data.error
          : MSG.error;
      showMessage(msgEl, serverMsg, "error");
      restoreButton(button, originalLabel);
    } catch (_err) {
      // Fallo de red / file:// / API caida: degradacion elegante.
      showMessage(msgEl, MSG.error, "error");
      restoreButton(button, originalLabel);
    }
  }

  /**
   * Rehabilita el boton y restaura su etiqueta original tras un error.
   * @param {HTMLButtonElement|null} button
   * @param {string} originalLabel
   */
  function restoreButton(button, originalLabel) {
    if (!button) return;
    button.disabled = false;
    try {
      if (originalLabel) button.textContent = originalLabel;
    } catch (_err) {
      /* ignorar */
    }
  }

  /**
   * Cablea un formulario concreto (idempotente: marca con dataset.iccWired).
   * @param {HTMLFormElement} form
   */
  function wireForm(form) {
    try {
      if (!form || form.dataset.iccWired === "1") return;
      form.dataset.iccWired = "1";
      form.addEventListener("submit", function (event) {
        handleSubmit(event, form);
      });
    } catch (_err) {
      /* Si un formulario falla al cablearse, no afecta al resto. */
    }
  }

  /** Busca y cablea todos los .waitlist-form de la pagina. */
  function init() {
    try {
      const forms = document.querySelectorAll(".waitlist-form");
      for (let i = 0; i < forms.length; i++) {
        wireForm(forms[i]);
      }
    } catch (_err) {
      /* Sin DOM utilizable: no hacemos nada. */
    }
  }

  // Auto-arranque robusto: si el DOM aun no esta listo, esperamos; si ya lo
  // esta, inicializamos de inmediato.
  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  } catch (_err) {
    /* Entorno sin document: el modulo se expone igualmente. */
  }

  // Exposicion global (sin modulos para que funcione con file://). Permite
  // re-cablear manualmente si se inyectan formularios despues (init).
  window.ICCWaitlist = { init: init, wireForm: wireForm };
})();
