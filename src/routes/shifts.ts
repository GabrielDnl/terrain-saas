import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/requireAuth'
import { sendSMS } from '../lib/sms'

const router = Router()
router.use(requireAuth)

const shiftSchema = z.object({
  employeeId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  site: z.string().optional(),
})

const hasConflict = async (
  employeeId: string,
  startTime: Date,
  endTime: Date,
  excludeId?: string
) => {
  const conflicts = await prisma.shift.findMany({
    where: {
      employeeId,
      id: excludeId ? { not: excludeId } : undefined,
      OR: [
        { startTime: { lt: endTime }, endTime: { gt: startTime } },
      ],
    },
  })
  return conflicts.length > 0
}

router.post('/', async (req: Request, res: Response) => {
  const parsed = shiftSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const { employeeId, startTime, endTime, site } = parsed.data

  try {
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, companyId: req.auth!.companyId },
    })
    if (!employee) {
      res.status(404).json({ error: 'Agent introuvable' })
      return
    }

    const start = new Date(startTime)
    const end = new Date(endTime)

    if (end <= start) {
      res.status(400).json({ error: 'L\'heure de fin doit être après l\'heure de début' })
      return
    }

    const conflict = await hasConflict(employeeId, start, end)
    if (conflict) {
      res.status(409).json({ error: 'Conflit de planning détecté pour cet agent' })
      return
    }

    const shift = await prisma.shift.create({
      data: {
        employeeId,
        startTime: start,
        endTime: end,
        site: site ?? null,
        companyId: req.auth!.companyId,
      },
      include: { employee: true },
    })

    res.status(201).json(shift)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.get('/', async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query

  try {
    let start: Date
    let end: Date

    if (startDate && endDate) {
      start = new Date(String(startDate))
      end = new Date(String(endDate))
    } else {
      const now = new Date()
      const dow = now.getDay()
      start = new Date(now)
      start.setDate(now.getDate() - (dow <= 4 ? dow - 1 : dow - 8))
      start.setHours(0, 0, 0, 0)
      end = new Date(start)
      end.setDate(start.getDate() + 7)
    }

    const shifts = await prisma.shift.findMany({
      where: {
        companyId: req.auth!.companyId,
        startTime: { gte: start, lt: end },
      },
      include: { employee: true },
      orderBy: { startTime: 'asc' },
    })

    res.json(shifts)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.put('/:id', async (req: Request, res: Response) => {
  const parsed = shiftSchema.partial().safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const id = String(req.params.id)

  try {
    const existing = await prisma.shift.findFirst({
      where: { id, companyId: req.auth!.companyId },
    })
    if (!existing) {
      res.status(404).json({ error: 'Shift introuvable' })
      return
    }

    const start = parsed.data.startTime ? new Date(parsed.data.startTime) : existing.startTime
    const end = parsed.data.endTime ? new Date(parsed.data.endTime) : existing.endTime
    const employeeId = parsed.data.employeeId ?? existing.employeeId

    if (end <= start) {
      res.status(400).json({ error: 'L\'heure de fin doit être après l\'heure de début' })
      return
    }

    const conflict = await hasConflict(employeeId, start, end, id)
    if (conflict) {
      res.status(409).json({ error: 'Conflit de planning détecté pour cet agent' })
      return
    }

    const shift = await prisma.shift.update({
      where: { id },
      data: {
        employeeId,
        startTime: start,
        endTime: end,
        site: parsed.data.site ?? existing.site,
      },
      include: { employee: true },
    })

    res.json(shift)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.delete('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id)

  try {
    const existing = await prisma.shift.findFirst({
      where: { id, companyId: req.auth!.companyId },
    })
    if (!existing) {
      res.status(404).json({ error: 'Shift introuvable' })
      return
    }

    await prisma.shift.delete({ where: { id } })
    res.json({ success: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.post('/publish', async (req: Request, res: Response) => {
  const { startDate, endDate } = req.body

  if (!startDate || !endDate) {
    res.status(400).json({ error: 'startDate et endDate requis' })
    return
  }

  try {
    const shifts = await prisma.shift.findMany({
      where: {
        companyId: req.auth!.companyId,
        startTime: {
          gte: new Date(startDate),
          lt: new Date(endDate),
        },
      },
      include: { employee: true },
      orderBy: { startTime: 'asc' },
    })

    const byEmployee = shifts.reduce((acc, shift) => {
      const id = shift.employeeId
      if (!acc[id]) acc[id] = { employee: shift.employee, shifts: [] }
      acc[id].shifts.push(shift)
      return acc
    }, {} as Record<string, { employee: any; shifts: typeof shifts }>)

    const results = []
    const appUrl = process.env.APP_URL || 'http://localhost:5173'

    for (const { employee, shifts: empShifts } of Object.values(byEmployee)) {
      if (!employee.phone) continue

      const lines = empShifts.map(s => {
        const start = new Date(s.startTime)
        const end = new Date(s.endTime)
        const day = start.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'numeric' })
        return `${day}: ${start.getUTCHours()}h-${end.getUTCHours()}h${s.site ? ' ' + s.site : ''}`
      })

      const message = `Bonjour ${employee.name.split(' ')[0]}, votre planning:\n${lines.join('\n')}\nVoir: ${appUrl}/mon-planning/${employee.accessToken}`
      const sent = await sendSMS(employee.phone, message)
      results.push({ employee: employee.name, phone: employee.phone, sent })
    }

    res.json({ success: true, results })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router