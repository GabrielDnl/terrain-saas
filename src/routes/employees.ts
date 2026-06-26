import { Router, Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/requireAuth'

const router = Router()
router.use(requireAuth)

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

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, phone, contractHours } = req.body
    const id = String(req.params.id)

    const existing = await prisma.employee.findFirst({
      where: { id, companyId: req.auth!.companyId },
    })

    if (!existing) {
      res.status(404).json({ error: 'Agent introuvable' })
      return
    }

    const employee = await prisma.employee.update({
      where: { id },
      data: { name, phone, contractHours },
    })

    res.json(employee)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id)

    const existing = await prisma.employee.findFirst({
      where: { id, companyId: req.auth!.companyId },
    })

    if (!existing) {
      res.status(404).json({ error: 'Agent introuvable' })
      return
    }

    await prisma.employee.delete({ where: { id } })
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router