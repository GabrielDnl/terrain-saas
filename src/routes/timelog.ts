import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/requireAuth'

const router = Router()
router.use(requireAuth)

const clockSchema = z.object({
  employeeId: z.string().uuid(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
})

router.post('/clockin', async (req: Request, res: Response) => {
  const parsed = clockSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const { employeeId, lat, lng } = parsed.data

  try {
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, companyId: req.auth!.companyId },
    })
    if (!employee) {
      res.status(404).json({ error: 'Agent introuvable' })
      return
    }

    const existing = await prisma.timelog.findFirst({
      where: {
        employeeId,
        clockIn: { not: null },
        clockOut: null,
      },
    })
    if (existing) {
      res.status(409).json({ error: 'Agent déjà en poste' })
      return
    }

    const timelog = await prisma.timelog.create({
      data: {
        employeeId,
        clockIn: new Date(),
        lat: lat ?? null,
        lng: lng ?? null,
        status: 'PENDING',
      },
      include: { employee: true },
    })

    res.status(201).json(timelog)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.post('/clockout', async (req: Request, res: Response) => {
  const parsed = clockSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const { employeeId, lat, lng } = parsed.data

  try {
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, companyId: req.auth!.companyId },
    })
    if (!employee) {
      res.status(404).json({ error: 'Agent introuvable' })
      return
    }

    const timelog = await prisma.timelog.findFirst({
      where: {
        employeeId,
        clockIn: { not: null },
        clockOut: null,
      },
    })
    if (!timelog) {
      res.status(404).json({ error: 'Aucun pointage d\'arrivée trouvé' })
      return
    }

    const updated = await prisma.timelog.update({
      where: { id: timelog.id },
      data: {
        clockOut: new Date(),
        lat: lat ?? timelog.lat,
        lng: lng ?? timelog.lng,
      },
      include: { employee: true },
    })

    res.json(updated)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.get('/live', async (req: Request, res: Response) => {
  try {
    const timelogs = await prisma.timelog.findMany({
      where: {
        employee: { companyId: req.auth!.companyId },
        clockIn: { not: null },
        clockOut: null,
      },
      include: { employee: true },
      orderBy: { clockIn: 'asc' },
    })

    res.json(timelogs)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.get('/recap/:month', async (req: Request, res: Response) => {
  const { month } = req.params
  const match = String(req.params.month).match(/^(\d{4})-(\d{2})$/)
  if (!match) {
    res.status(400).json({ error: 'Format mois invalide. Utilise YYYY-MM' })
    return
  }

  const year = parseInt(match[1])
  const monthNum = parseInt(match[2]) - 1
  const start = new Date(year, monthNum, 1)
  const end = new Date(year, monthNum + 1, 1)

  try {
    const employees = await prisma.employee.findMany({
      where: { companyId: req.auth!.companyId },
    })

    const timelogs = await prisma.timelog.findMany({
      where: {
        employee: { companyId: req.auth!.companyId },
        clockIn: { gte: start, lt: end },
      },
      include: { employee: true },
    })

    const shifts = await prisma.shift.findMany({
      where: {
        companyId: req.auth!.companyId,
        startTime: { gte: start, lt: end },
      },
    })

    const recap = employees.map(emp => {
      const empTimelogs = timelogs.filter(t => t.employeeId === emp.id && t.clockOut)
      const empShifts = shifts.filter(s => s.employeeId === emp.id)

      const workedMinutes = empTimelogs.reduce((acc, t) => {
        if (!t.clockOut) return acc
        return acc + (t.clockOut.getTime() - t.clockIn!.getTime()) / 60000
      }, 0)

      const plannedMinutes = empShifts.reduce((acc, s) => {
        return acc + (s.endTime.getTime() - s.startTime.getTime()) / 60000
      }, 0)

      return {
        employee: { id: emp.id, name: emp.name, contractHours: emp.contractHours },
        workedHours: Math.round(workedMinutes / 60 * 10) / 10,
        plannedHours: Math.round(plannedMinutes / 60 * 10) / 10,
        contractHours: emp.contractHours,
        absences: empShifts.length - empTimelogs.length,
        timelogs: empTimelogs.length,
      }
    })

    res.json(recap)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router