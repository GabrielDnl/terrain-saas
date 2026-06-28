import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/requireAuth'

const router = Router()
router.use(requireAuth)

const employeeSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().max(20).optional(),
  contractHours: z.number().min(0).max(300).optional(),
})

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
  const parsed = employeeSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const { name, phone, contractHours } = parsed.data

  try {
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
  const parsed = employeeSchema.partial().safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const id = String(req.params.id)

  try {
    const existing = await prisma.employee.findFirst({
      where: { id, companyId: req.auth!.companyId },
    })

    if (!existing) {
      res.status(404).json({ error: 'Agent introuvable' })
      return
    }

    const employee = await prisma.employee.update({
      where: { id },
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone,
        contractHours: parsed.data.contractHours,
      },
    })

    res.json(employee)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.delete('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id)

  try {
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