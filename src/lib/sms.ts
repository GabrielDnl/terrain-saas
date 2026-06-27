import { BrevoClient } from '@getbrevo/brevo'

const client = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY!,
})

export const sendSMS = async (to: string, message: string) => {
  const recipient = to.replace(/\s/g, '').replace(/^0/, '+33')

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[SMS SIMULÉ] À: ${recipient}`)
    console.log(`[SMS SIMULÉ] Message: ${message}`)
    return true
  }

  try {
    await client.transactionalSms.sendTransacSms({
      sender: process.env.BREVO_SMS_SENDER || 'TerrainSaaS',
      recipient,
      content: message,
      type: 'transactional',
    })
    console.log(`SMS envoyé à ${recipient}`)
    return true
  } catch (error) {
    console.error('Erreur envoi SMS:', error)
    return false
  }
}