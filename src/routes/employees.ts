import { Router, Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/requireAuth'

const router = Router()
router.use(requireAuth)

// GET /employees — liste les agents de la company
router.get('/', async (req: Request, res: Response) => {
  try {
    const employees = await prisma.employee.findMany({
      where: { companyId: req.auth!.companyId },
      orderBy: { createdAt: 'asc' },
    })
    res.json(employees)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /employees — ajouter un agent
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, phone, contractHours } = req.body

    if (!name) {
      res.status(400).json({ error: 'Le nom est requis' })
      return
    }

    const employee = await prisma.employee.create({
      data: {
        name,
        phone: phone ?? null,
        contractHours: contractHours ?? 151,
        companyId: req.auth!.companyId,
      },
    })

    res.status(201).json(employee)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// PUT /employees/:id — modifier un agent
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, phone, contractHours } = req.body

    const existing = await prisma.employee.findFirst({
      where: { id: req.params.id, companyId: req.auth!.companyId },
    })

    if (!existing) {
      res.status(404).json({ error: 'Agent introuvable' })
      return
    }

    const employee = await prisma.employee.update({
      where: { id: req.params.id },
      data: { name, phone, contractHours },
    })

    res.json(employee)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// DELETE /employees/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.employee.findFirst({
      where: { id: req.params.id, companyId: req.auth!.companyId },
    })

    if (!existing) {
      res.status(404).json({ error: 'Agent introuvable' })
      return
    }

    await prisma.employee.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router