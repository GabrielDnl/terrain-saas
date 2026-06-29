import { BrevoClient } from '@getbrevo/brevo'

const client = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY!,
})

export const sendWelcomeEmail = async (to: string, name: string, companyName: string) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[EMAIL SIMULÉ] À: ${to}`)
    console.log(`[EMAIL SIMULÉ] Bienvenue ${name} de ${companyName}`)
    return true
  }

  try {
    await client.transactionalEmails.sendTransacEmail({
      to: [{ email: to, name }],
      sender: { email: 'no-reply@terrain-saas.fr', name: 'Terrain SaaS' },
      subject: `Bienvenue sur Terrain SaaS, ${name.split(' ')[0]} !`,
      htmlContent: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
          <h1 style="font-size: 24px; font-weight: 500; color: #111; margin-bottom: 8px;">
            Bienvenue sur Terrain SaaS
          </h1>
          <p style="color: #555; font-size: 15px; line-height: 1.6;">
            Bonjour ${name.split(' ')[0]},<br><br>
            Votre espace <strong>${companyName}</strong> est prêt. Vous pouvez dès maintenant
            créer votre planning, ajouter vos agents et publier les horaires par SMS.
          </p>
          <a href="${process.env.APP_URL}/planning"
             style="display:inline-block;margin-top:24px;padding:12px 24px;background:#2563eb;color:white;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500;">
            Accéder à mon espace
          </a>
          <p style="color: #999; font-size: 13px; margin-top: 32px;">
            Une question ? Répondez à cet email, on vous répond sous 24h.
          </p>
        </div>
      `,
    })
    console.log(`Email de bienvenue envoyé à ${to}`)
    return true
  } catch (error) {
    console.error('Erreur envoi email:', error)
    return false
  }
}

export const sendPaymentConfirmationEmail = async (to: string, name: string, companyName: string) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[EMAIL SIMULÉ] À: ${to}`)
    console.log(`[EMAIL SIMULÉ] Confirmation paiement ${name} — ${companyName}`)
    return true
  }

  try {
    await client.transactionalEmails.sendTransacEmail({
      to: [{ email: to, name }],
      sender: { email: 'no-reply@terrain-saas.fr', name: 'Terrain SaaS' },
      subject: 'Votre abonnement Terrain SaaS est activé',
      htmlContent: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
          <h1 style="font-size: 24px; font-weight: 500; color: #111; margin-bottom: 8px;">
            Abonnement activé
          </h1>
          <p style="color: #555; font-size: 15px; line-height: 1.6;">
            Bonjour ${name.split(' ')[0]},<br><br>
            Votre abonnement <strong>Terrain SaaS — 59€/mois</strong> est maintenant actif.
            Toutes les fonctionnalités sont disponibles pour votre équipe.
          </p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:24px 0;">
            <p style="color:#166534;font-size:14px;margin:0;">
              ✓ Planning hebdomadaire illimité<br>
              ✓ Pointage mobile avec géolocalisation<br>
              ✓ Notifications SMS automatiques<br>
              ✓ Export paie CSV mensuel
            </p>
          </div>
          <a href="${process.env.APP_URL}/planning"
             style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500;">
            Accéder à mon espace
          </a>
          <p style="color: #999; font-size: 13px; margin-top: 32px;">
            Facture disponible dans votre espace Stripe. Une question ? Répondez à cet email.
          </p>
        </div>
      `,
    })
    console.log(`Email confirmation paiement envoyé à ${to}`)
    return true
  } catch (error) {
    console.error('Erreur envoi email:', error)
    return false
  }
}