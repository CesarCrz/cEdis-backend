import type { EmailTemplate } from './types'

// ─── Base wrapper ─────────────────────────────────────────────────────────────
// Estilo Stripe/GitHub: responsive, dark mode, Outlook VML, hover via <style>

function base(preheader: string, body: string): string {
  const year = new Date().getFullYear()
  return `<!DOCTYPE html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    * { box-sizing: border-box; }
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
    u + #body a { color: inherit; text-decoration: none; font-size: inherit; font-family: inherit; font-weight: inherit; line-height: inherit; }

    .btn-primary:hover { background-color: #0f766e !important; }
    .btn-danger:hover  { background-color: #b91c1c !important; }
    .link-muted:hover  { color: #374151 !important; }

    @media only screen and (max-width: 600px) {
      .outer-td  { padding: 24px 0 !important; }
      .card      { border-radius: 0 !important; border-left: none !important; border-right: none !important; }
      .card-head { padding: 32px 24px !important; border-radius: 0 !important; }
      .card-body { padding: 32px 24px !important; }
      .card-foot { padding: 24px 24px !important; border-radius: 0 !important; }
      .btn-wrap  { width: 100% !important; }
      .btn-wrap a { display: block !important; width: 100% !important; text-align: center !important; }
      .code-block { font-size: 36px !important; letter-spacing: 8px !important; }
    }

    @media (prefers-color-scheme: dark) {
      .dark-bg   { background-color: #0f172a !important; }
      .dark-card { background-color: #1e293b !important; border-color: #334155 !important; }
      .dark-body { color: #e2e8f0 !important; }
      .dark-muted { color: #94a3b8 !important; }
      .dark-foot { background-color: #0f172a !important; border-color: #1e293b !important; }
      .dark-divider { background-color: #334155 !important; }
      .dark-inner { background-color: #0f172a !important; border-color: #334155 !important; }
    }
  </style>
</head>
<body id="body" style="margin:0;padding:0;background-color:#f6f9fc;word-spacing:normal;">

  <!-- Preheader invisible -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f6f9fc" class="dark-bg">
    <tr>
      <td class="outer-td" align="center" style="padding:48px 20px;">

        <!--[if (gte mso 9)|(IE)]><table role="presentation" width="560" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
        <table role="presentation" class="card dark-card" cellpadding="0" cellspacing="0"
               style="width:100%;max-width:560px;background-color:#ffffff;border-radius:8px;border:1px solid #e2e8f0;">

          <!-- Cabecera -->
          <tr>
            <td class="card-head" align="center" bgcolor="#0f172a"
                style="padding:40px 48px 36px;border-radius:8px 8px 0 0;background-color:#0f172a;">
              <a href="https://cedis.ceats.app" style="text-decoration:none;display:inline-block;">
                <table role="presentation" cellpadding="0" cellspacing="0" align="center">
                  <tr>
                    <td align="center" bgcolor="#0d9488"
                        style="width:36px;height:36px;border-radius:8px;background-color:#0d9488;
                               font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                               font-size:18px;font-weight:700;color:#ffffff;line-height:36px;text-align:center;
                               vertical-align:middle;">
                      c
                    </td>
                    <td width="10"> </td>
                    <td>
                      <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
                                   font-size:24px;font-weight:700;letter-spacing:-0.5px;color:#ffffff;">cEdis</span>
                    </td>
                  </tr>
                </table>
              </a>
              <p style="margin:10px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                        font-size:12px;color:rgba(255,255,255,0.45);letter-spacing:0.5px;text-transform:uppercase;">
                Gestión de centros de distribución
              </p>
            </td>
          </tr>

          <!-- Cuerpo -->
          <tr>
            <td class="card-body dark-body" style="padding:48px 48px 40px;
                font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
                font-size:15px;line-height:1.7;color:#374151;">
              ${body}
            </td>
          </tr>

          <!-- Divisor -->
          <tr>
            <td style="padding:0 48px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td class="dark-divider" height="1" bgcolor="#e2e8f0" style="font-size:0;line-height:0;"> </td></tr>
              </table>
            </td>
          </tr>

          <!-- Pie -->
          <tr>
            <td class="card-foot dark-foot" align="center" bgcolor="#f9fafb"
                style="padding:28px 48px;border-radius:0 0 8px 8px;background-color:#f9fafb;">
              <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                        font-size:12px;color:#9ca3af;line-height:1.5;">
                © ${year} cEdis · Todos los derechos reservados.
              </p>
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                        font-size:12px;line-height:1.5;">
                <a href="mailto:support@ceats.app" class="link-muted"
                   style="color:#9ca3af;text-decoration:none;">Soporte</a>
              </p>
            </td>
          </tr>

        </table>
        <!--[if (gte mso 9)|(IE)]></td></tr></table><![endif]-->

      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─── CTA button (Outlook-compatible VML) ──────────────────────────────────────

function ctaButton(href: string, label: string, variant: 'primary' | 'danger' = 'primary'): string {
  const bg  = variant === 'danger' ? '#dc2626' : '#0d9488'
  const cls = variant === 'danger' ? 'btn-danger' : 'btn-primary'
  return `
  <table role="presentation" class="btn-wrap" cellpadding="0" cellspacing="0" style="margin:32px auto 0;">
    <tr>
      <td align="center">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
          href="${href}"
          style="height:48px;v-text-anchor:middle;width:220px;"
          arcsize="12%" strokecolor="${bg}" fillcolor="${bg}">
          <w:anchorlock/>
          <center style="color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:600;">
            ${label}
          </center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <a href="${href}" class="${cls}"
           style="display:inline-block;background-color:${bg};color:#ffffff;
                  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
                  font-size:15px;font-weight:600;line-height:1;padding:14px 32px;text-decoration:none;
                  border-radius:6px;mso-padding-alt:14px 32px;
                  -webkit-transition:background-color 0.15s ease;transition:background-color 0.15s ease;">
          ${label}
        </a>
        <!--<![endif]-->
      </td>
    </tr>
  </table>`
}

// ─── Alert box ────────────────────────────────────────────────────────────────

function alertBox(content: string, type: 'warning' | 'info' | 'success' | 'neutral' = 'neutral'): string {
  const map = {
    warning: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e' },
    info:    { bg: '#f0fdfa', border: '#0d9488', text: '#134e4a' },
    success: { bg: '#f0fdf4', border: '#10b981', text: '#065f46' },
    neutral: { bg: '#f8fafc', border: '#94a3b8', text: '#475569' },
  }
  const c = map[type]
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td class="dark-inner" bgcolor="${c.bg}"
          style="background-color:${c.bg};border-left:3px solid ${c.border};border-radius:0 6px 6px 0;padding:16px 18px;">
        <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                  font-size:13px;line-height:1.6;color:${c.text};">${content}</p>
      </td>
    </tr>
  </table>`
}

// ─── Detail row ───────────────────────────────────────────────────────────────

function detailRow(label: string, value: string, last = false): string {
  const border = last ? '' : 'border-bottom:1px solid #e2e8f0;'
  return `
  <tr>
    <td style="padding:12px 0;${border}font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
               font-size:13px;color:#6b7280;">${label}</td>
    <td align="right" style="padding:12px 0;${border}font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
               font-size:13px;font-weight:600;color:#111827;">${value}</td>
  </tr>`
}

// ════════════════════════════════════════════════════════════════════════════════
// TEMPLATES
// ════════════════════════════════════════════════════════════════════════════════

// ── 1. Magic Link ─────────────────────────────────────────────────────────────

export function getMagicLinkTemplate(email: string, magicLink: string): EmailTemplate {
  return {
    subject: 'Tu enlace de acceso a cEdis',
    html: base(
      `Aquí está tu enlace para iniciar sesión en cEdis. Expira en 1 hora.`,
      `
      <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">
        Inicia sesión en cEdis
      </h1>

      <p style="margin:0 0 16px;color:#374151;">
        Recibiste este correo porque solicitaste un enlace de acceso para
        <strong style="color:#111827;">${email}</strong>.
      </p>

      <p style="margin:0 0 8px;color:#374151;">
        Haz clic en el botón para acceder. El enlace expira en <strong>1 hora</strong> y es de un solo uso.
      </p>

      ${ctaButton(magicLink, 'Acceder a cEdis')}

      <p style="margin:32px 0 8px;font-size:13px;color:#6b7280;">
        Si el botón no funciona, copia y pega este enlace en tu navegador:
      </p>
      <p style="margin:0;font-size:12px;word-break:break-all;color:#9ca3af;
                font-family:'Courier New',Courier,monospace;background-color:#f8fafc;
                border-radius:4px;padding:10px 12px;border:1px solid #e2e8f0;">
        ${magicLink}
      </p>

      ${alertBox('Si no solicitaste este acceso, ignora este correo. Tu cuenta permanece segura.', 'neutral')}
      `,
    ),
  }
}

// ── 2. Invitación a CEDIS ─────────────────────────────────────────────────────

export function getInvitationTemplate(params: {
  nombreCedis: string
  role: string
  inviteLink: string
  expiresInDays: number
}): EmailTemplate {
  const { nombreCedis, role, inviteLink, expiresInDays } = params
  const roleLabel: Record<string, string> = {
    owner: 'Propietario',
    admin: 'Administrador',
    viewer: 'Visualizador',
  }
  return {
    subject: `Invitación a ${nombreCedis} — cEdis`,
    html: base(
      `Fuiste invitado a unirte a ${nombreCedis} en cEdis como ${roleLabel[role] ?? role}.`,
      `
      <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">
        Tienes una invitación
      </h1>

      <p style="margin:0 0 16px;color:#374151;">
        Fuiste invitado a unirte al centro de distribución
        <strong style="color:#111827;">${nombreCedis}</strong> como
        <strong style="color:#0d9488;">${roleLabel[role] ?? role}</strong>.
      </p>

      <p style="margin:0 0 32px;color:#374151;">
        Al aceptar tendrás acceso a:
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
        <tr><td style="padding:7px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:#374151;">&#10003;&nbsp; Inventario y kardex en tiempo real</td></tr>
        <tr><td style="padding:7px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:#374151;">&#10003;&nbsp; Gestión de entradas y ventas</td></tr>
        <tr><td style="padding:7px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:#374151;">&#10003;&nbsp; Alertas de faltantes y mermas</td></tr>
        <tr><td style="padding:7px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:#374151;">&#10003;&nbsp; Dashboard y reportes del CEDIS</td></tr>
      </table>

      ${ctaButton(inviteLink, 'Aceptar invitación')}

      ${alertBox(`Esta invitación expira en <strong>${expiresInDays} días</strong>. Si no la esperabas, ignora este correo.`, 'warning')}
      `,
    ),
  }
}

// ── 3. Bienvenida (primer login, CEDIS creado) ────────────────────────────────

export function getWelcomeTemplate(params: {
  nombreCedis: string
  dashboardUrl: string
}): EmailTemplate {
  const { nombreCedis, dashboardUrl } = params
  return {
    subject: `¡Bienvenido a cEdis! — ${nombreCedis}`,
    html: base(
      `Tu CEDIS "${nombreCedis}" está listo. Empieza a gestionar tu inventario.`,
      `
      <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">
        Tu CEDIS está listo
      </h1>

      <p style="margin:0 0 16px;color:#374151;">
        <strong style="color:#111827;">${nombreCedis}</strong> fue creado exitosamente.
        Ya puedes comenzar a gestionar tu inventario.
      </p>

      <p style="margin:0 0 32px;color:#374151;">
        Sigue estos pasos para empezar:
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
        ${[
          ['Configura tus insumos', 'Agrega los productos que manejas en tu CEDIS'],
          ['Registra tus proveedores', 'Para llevar control de tus entradas de mercancía'],
          ['Crea tus recetas', 'Define cómo se compone cada producto de venta'],
          ['Registra tu primera entrada', 'Comienza a llevar el control de inventario'],
        ].map(([title, desc], i) => `
        <tr>
          <td width="36" valign="top" style="padding-top:2px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" bgcolor="#0d9488"
                    style="width:26px;height:26px;border-radius:50%;background-color:#0d9488;
                           font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                           font-size:12px;font-weight:700;color:#ffffff;line-height:26px;text-align:center;">
                  ${i + 1}
                </td>
              </tr>
            </table>
          </td>
          <td style="padding-bottom:20px;">
            <p style="margin:0 0 3px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;font-weight:600;color:#111827;">${title}</p>
            <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#6b7280;line-height:1.5;">${desc}</p>
          </td>
        </tr>`).join('')}
      </table>

      ${ctaButton(dashboardUrl, 'Ir a mi CEDIS')}

      ${alertBox('¿Necesitas ayuda? Contáctanos en <a href="mailto:support@ceats.app" style="color:#134e4a;">support@ceats.app</a>', 'info')}
      `,
    ),
  }
}
