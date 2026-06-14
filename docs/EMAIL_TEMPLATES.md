# Secuencia de Email — Campaña «Primer Toque» (Fase 1, Hype Digital)

> **Interplanetary Champions Cup (ICC)** · Lifecycle / CRM
> Narrativa madre: **«atleta, no máquina»** — el L-Striker es el primer deportista interplanetario.
> Lema teaser: **«El juego cambia de cancha. 2026.»** · Hashtag: **#ICCFirstTouch**

Esta es la secuencia completa de emails de la campaña, lista para **pegar en un proveedor**
(Mailchimp, Brevo, etc.). Cada email incluye: **asunto (2 variantes A/B)**, **preheader**,
**cuerpo**, **CTA** y una **nota de envío**.

### Convenciones
- **Merge tags genéricos:** `{{first_name}}` (nombre; con valor por defecto «Operador»),
  `{{total}}` (operadores apuntados), `{{plazas_restantes}}` (plazas fundacionales que quedan),
  `{{club}}` (club opcional declarado en el alta), `{{ranking_url}}`, `{{sim_url}}`,
  `{{waitlist_url}}`, `{{referral_url}}`, `{{unsubscribe_url}}`.
- **Enlaces base:** simulador `https://white-stone-07846b60f.7.azurestaticapps.net` ·
  landing inversores `https://white-stone-07846b60f.7.azurestaticapps.net/investors.html`.
- **Tono:** Acto I misterio/exclusividad · Acto II comunidad/reto · Acto III urgencia/cierre.
  Siempre «atleta, no máquina»; vender el momento, no el motor.
- **Default de personalización:** configura `{{first_name | default: "Operador"}}` en el proveedor.

---

## Email 1 — Bienvenida: «Operador Fundador»

- **Trigger:** automatización transaccional, **inmediata** tras el alta en la waitlist
  (`waitlist_signup`). Es el primer contacto: confirma la plaza y sella la promesa.
- **Asunto A:** `Estás dentro, {{first_name}}. Antes del Primer Toque.`
- **Asunto B:** `Operador Fundador confirmado — tu plaza está reservada`
- **Preheader:** `Tú estuviste antes de que un robot pateara un balón en la Luna.`

**Cuerpo:**

```
Bienvenido, Operador.

Estás en la lista. Te avisaremos del Primer Toque.

Eso no es una frase de marketing: es un contrato. Cuando un robot patee un balón
en la Luna —el Apolo 11 del entretenimiento— tú ya estabas dentro. Hoy reservas
tu plaza entre los primeros 1.000 operadores que estrenarán el control del
L-Striker.

Porque esto va de eso: el L-Striker no es una máquina que patea. Es el primer
deportista interplanetario. Un atleta entrenado para un único gesto histórico,
a 1,62 m/s² de gravedad, donde el balón no cae: vuela.

Tu plaza fundacional incluye:
- Plaza numerada entre los primeros 1.000 operadores.
- Aviso prioritario del Primer Toque (el evento real).
- Acceso anticipado a retos, rankings y drops (incl. el NFT del primer toque).
- Tu badge de «Operador Fundador» en la comunidad.

Mientras tanto, no esperes sentado: prueba el simulador. Manda el balón lo más
lejos que puedas en gravedad lunar. Ese es tu primer toque.
```

- **CTA principal:** `Ver el simulador` → `{{sim_url}}`
- **CTA secundario (texto):** `Comparte tu mejor disparo con #ICCFirstTouch`
- **Nota de envío:** transaccional, disparo inmediato (objetivo de apertura ≥ 60 %).
  Esta versión existe también como plantilla HTML de marca en `web/emails/welcome.html`.

---

## Email 2 — «Tú lo viste primero» (early-leads · Acto I)

- **Trigger:** **Semana 3**, segmento de early-leads (apuntados en Semanas 1–2, durante el
  misterio). Coincide con la revelación parcial del L-Striker.
- **Asunto A:** `Tú lo viste primero. Esto es ICC.`
- **Asunto B:** `{{first_name}}, ya puedes contarlo: esto era el misterio`
- **Preheader:** `El balón que flotaba sobre la Luna por fin tiene nombre.`

**Cuerpo:**

```
{{first_name}}, mientras todos preguntaban «¿qué es esto?», tú ya estabas dentro.

¿Recuerdas el balón que entraba flotando sobre el regolito? ¿La frase «El juego
cambia de cancha. 2026.»? No era una metáfora. Era una declaración.

Esto es ICC: Interplanetary Champions Cup. Fútbol robótico en la Luna. Y el
protagonista no es un robot: es el L-Striker, el primer deportista interplanetario.
Atleta, no máquina.

Tú no llegas ahora. Tú llegaste antes de la revelación. Por eso eres de los
primeros: cuando esto sea historia, tú ya lo habías visto venir.

El simulador ya está vivo. La misma física que vivirá el L-Striker en la Luna,
hoy, en tu pantalla. Pruébalo antes que nadie.
```

- **CTA principal:** `Entrar al simulador` → `{{sim_url}}`
- **Nota de envío:** Semana 3 (alinea con la revelación parcial del teaser).
  KPI de control: tasa de apertura ≥ 45 %.

---

## Email 3 — «Defiende tu plaza» (reto · Acto II)

- **Trigger:** **Semana 5**, a toda la waitlist, al lanzar el reto **#ICCFirstTouch** con
  leaderboard público.
- **Asunto A:** `Defiende tu plaza: marca tu récord, {{first_name}}.`
- **Asunto B:** `Eres operador. Demuéstralo en el ranking.`
- **Preheader:** `El leaderboard ya está abierto. ¿Cuánto hang-time aguantas?`

**Cuerpo:**

```
{{first_name}}, reservaste tu plaza. Ahora toca defenderla.

El reto #ICCFirstTouch ya está en marcha, con leaderboard público. La regla es
simple: tu mejor disparo, pero en la Luna. Con un sexto de gravedad (1,62 m/s²),
el balón no cae como en la Tierra: vuela. Hang-time imposible. Contenido para clip.

Un operador fundador no mira desde la grada. Entra, dispara y deja su nombre en
el ranking. El récord de la semana recibe difusión oficial y acceso anticipado.

Tu reto:
1. Entra al simulador y haz tu mejor toque.
2. Comparte tu récord con #ICCFirstTouch.
3. Reta a alguien que crea que puede superarte.

El balón espera. ¿Lo mandas a la órbita o miras cómo lo hace otro?
```

- **CTA principal:** `Marcar mi récord` → `{{ranking_url}}`
- **CTA secundario (texto):** `Comparte con #ICCFirstTouch y reta a tu rival`
- **Nota de envío:** Semana 5 (lanzamiento del reto). KPI de control: CTR al simulador.

---

## Email 4 — Prueba social del contador: «Ya somos {{total}} operadores»

- **Trigger:** **Semana 8** (mitad de campaña), a leads que aún no han disparado o no han
  vuelto. Usa el contador como prueba social.
- **Asunto A:** `Ya somos {{total}} operadores. Y tú eres uno.`
- **Asunto B:** `{{total}} personas ya quieren operar un robot en la Luna`
- **Preheader:** `Las plazas fundacionales son 1.000. El movimiento ya es real.`

**Cuerpo:**

```
{{first_name}}, esto ya no es una idea. Es un movimiento.

Ya somos {{total}} operadores apuntados a estrenar el control del L-Striker. Las
plazas fundacionales son 1.000, y se llenan toque a toque.

Cada uno de esos {{total}} cree lo mismo que tú: que el próximo gran momento del
deporte no se jugará en un estadio, sino sobre el regolito. Que el primer
deportista interplanetario merece público desde su primer toque.

Tú ya tienes tu plaza. Lo que aún no tienes es tu marca en el ranking. La mitad
de la campaña ya pasó; el récord de campaña recibirá difusión masiva y acceso
anticipado. Todavía estás a tiempo de ser ese nombre.
```

- **CTA principal:** `Ver el ranking y disparar` → `{{ranking_url}}`
- **Nota de envío:** Semana 8. KPI de control: conversión email → actividad en el simulador.
  Asegura que `{{total}}` se inyecta desde el contador real (`POST /api/waitlist` → `total`).

---

## Email 5 — Urgencia: «Quedan < 300 plazas» (Acto III)

- **Trigger:** **Semana 10**, a toda la waitlist que aún no haya «confirmado» su estatus,
  cuando empieza a comunicarse la escasez real.
- **Asunto A:** `Quedan {{plazas_restantes}} plazas fundacionales.`
- **Asunto B:** `{{first_name}}, después de esto: lista de espera.`
- **Preheader:** `Las plazas de Operador Fundador son finitas. Y se acaban.`

**Cuerpo:**

```
{{first_name}}, tenemos que ser claros: quedan menos de {{plazas_restantes}} plazas
fundacionales. Después, lista de espera.

El «1.000» nunca fue decorativo. Ser Operador Fundador significa estar entre los
primeros que tocarán el balón en la Luna —numerado, con acceso anticipado y el
badge que solo tendrán mil personas en el mundo—. Cuando se cierren, se cierran.

Tú ya reservaste. Lo que te pedimos ahora es que asegures tu sitio dentro del
movimiento: vuelve, dispara, deja tu marca y haz que tu plaza cuente antes del
cierre simbólico de las 1.000.

El L-Striker no espera. Y las plazas, tampoco.
```

- **CTA principal:** `Asegurar mi plaza` → `{{waitlist_url}}`
- **CTA secundario (texto):** `Invita y sube de posición:` `{{referral_url}}`
- **Nota de envío:** Semana 10. KPI de control: velocidad de altas/día y reactivación.
  Inyecta `{{plazas_restantes}}` desde `1000 − total`; no enviar si supera 300.

---

## Email 6 — Cierre: «Operador Fundador confirmado»

- **Trigger:** **Semana 12**, cierre de campaña, a todos los operadores fundadores. Cierre
  simbólico de las 1.000 plazas + puente a Fase 2 (MVP).
- **Asunto A:** `Operador Fundador confirmado. Las 1.000 plazas, cerradas.`
- **Asunto B:** `{{first_name}}, lo conseguimos: 1.000 operadores. Tú entre ellos.`
- **Preheader:** `Estabas antes del Primer Toque. Ahora empieza lo de verdad.`

**Cuerpo:**

```
{{first_name}}, está hecho.

Las 1.000 plazas fundacionales están cerradas. Y tú estás dentro, confirmado como
Operador Fundador de la Interplanetary Champions Cup.

Hace doce semanas esto era un balón flotando en silencio sobre la Luna y una
frase: «El juego cambia de cancha». Hoy somos {{total}} personas que creen que el
primer deportista interplanetario merece historia. Tú ayudaste a construir ese
movimiento desde antes de que tuviera nombre.

Lo que viene: el L-Striker deja el simulador y empieza a entrenar para el Primer
Toque real —el Apolo 11 del entretenimiento—. Como Operador Fundador, tendrás
aviso prioritario, acceso anticipado a los drops (incl. el NFT del primer toque)
y tu badge en la comunidad. Nada de esto se abre a quien llegue después.

Gracias por estar antes que nadie. Nos vemos en la cancha. La de verdad.
```

- **CTA principal:** `Ver el simulador` → `{{sim_url}}`
- **CTA secundario (texto):** `Sigue el camino al Primer Toque con #ICCFirstTouch`
- **Nota de envío:** Semana 12. KPI de control: leads finales y materiales de inversión.
  Variante para inversores puede enlazar a `{{waitlist_url}}` → landing de inversores.

---

## Notas de implementación (CRM)

- **Personalización:** todos los `{{first_name}}` con valor por defecto «Operador» para
  altas sin nombre (el formulario solo exige email).
- **Segmentos:**
  - *early-leads* (Email 2): apuntados en Semanas 1–2.
  - *toda la waitlist* (Emails 3, 5): todos los activos no dados de baja.
  - *inactivos / sin disparo* (Emails 4): sin evento `shot_executed` reciente.
  - *operadores fundadores* (Email 6): todos los que siguen en lista al cierre.
- **Datos dinámicos:** `{{total}}` y `{{plazas_restantes}}` deben provenir del contador real
  de la tabla `waitlist` (`POST /api/waitlist` → `{ ok:true, total }`); `plazas_restantes = 1000 − total`.
- **Pie obligatorio:** todos los emails llevan enlace de baja `{{unsubscribe_url}}` y la
  dirección física del remitente (requisito antispam/RGPD).
- **A/B testing:** rotar Asunto A/B por defecto al 50/50; quedarse con el ganador por tasa
  de apertura en envíos posteriores.
