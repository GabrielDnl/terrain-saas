import { Router, Request, Response } from 'express'
import Stripe from 'stripe'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/requireAuth'
import { sendPaymentConfirmationEmail } from '../lib/email'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const router = Router()

router.post('/checkout', requireAuth, async (req: Request, res: Response) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.auth!.companyId },
    })

    if (!company) {
      res.status(404).json({ error: 'Entreprise introuvable' })
      return
    }

    if (company.isPaid) {
      res.status(409).json({ error: 'Abonnement déjà actif' })
      return
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID!,
          quantity: 1,
        },
      ],
      metadata: { companyId: company.id },
      success_url: `${process.env.APP_URL}/planning?payment=success`,
      cancel_url: `${process.env.APP_URL}/upgrade?payment=cancelled`,
    })

    res.json({ url: session.url })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.post('/webhook', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (error) {
    console.error('Webhook signature invalide:', error)
    res.status(400).json({ error: 'Webhook invalide' })
    return
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const companyId = session.metadata?.companyId

    if (companyId) {
      const company = await prisma.company.update({
        where: { id: companyId },
        data: {
          isPaid: true,
          stripeCustomerId: session.customer as string,
        },
        include: { users: true },
      })
      const manager = company.users[0]
      if (manager) {
        sendPaymentConfirmationEmail(manager.email, manager.name, company.name)
      }
      console.log(`Company ${companyId} activée après paiement`)
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription
    const company = await prisma.company.findFirst({
      where: { stripeCustomerId: subscription.customer as string },
    })
    if (company) {
      await prisma.company.update({
        where: { id: company.id },
        data: { isPaid: false },
      })
      console.log(`Company ${company.id} désactivée après résiliation`)
    }
  }

  res.json({ received: true })
})

export default router