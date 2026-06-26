import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma'

const router = Router()

// POST /auth/register — crée une Company + son premier User dirigeant
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { companyName, email, password, name } = req.body

    if (!companyName || !email || !password || !name) {
      res.status(400).json({ error: 'Tous les champs sont requis' })
      return
    }

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

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      res.status(400).json({ error: 'Email et mot de passe requis' })
      return
    }

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