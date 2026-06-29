import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { sendWelcomeEmail } from '../lib/email'

const router = Router()

const registerSchema = z.object({
  companyName: z.string().min(2).max(100),
  email: z.string().email().max(255),
  password: z.string().min(8).max(100),
  name: z.string().min(2).max(100),
})

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(100),
})

router.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const { companyName, email, password, name } = parsed.data

  try {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      res.status(409).json({ error: 'Email déjà utilisé' })
      return
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const company = await prisma.company.create({
      data: {
        name: companyName,
        users: {
          create: {
            email,
            password: hashedPassword,
            name,
            role: 'MANAGER',
          },
        },
      },
      include: { users: true },
    })

    const user = company.users[0]

    const token = jwt.sign(
      { userId: user.id, companyId: company.id, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    )

    sendWelcomeEmail(email, name, companyName)

    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      company: { id: company.id, name: company.name },
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const { email, password } = parsed.data

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { company: true },
    })

    if (!user) {
      res.status(401).json({ error: 'Identifiants invalides' })
      return
    }

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      res.status(401).json({ error: 'Identifiants invalides' })
      return
    }

    const token = jwt.sign(
      { userId: user.id, companyId: user.companyId, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    )

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      company: { id: user.companyId, name: user.company.name },
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router