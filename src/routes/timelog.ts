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
      select: {
        id: true,
        clockIn: true,
        lat: true,
        lng: true,
        employee: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: { clockIn: 'asc' },
    })

    res.json(timelogs)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.get('/recap/:month', async (req: Request, res: Response) => {
  const match = String(req.params.month).match(/^(\d{4})-(\d{2})$/)
  if (!match) {
    res.status(400).json({ error: 'Format mois invalide. Utilise YYYY-MM' })
    return
  }

  const year = parseInt(match[1])
  const monthNum = parseInt(match[2])

  if (year < 2020 || year > 2030 || monthNum < 1 || monthNum > 12) {
    res.status(400).json({ error: 'Date invalide' })
    return
  }

  const start = new Date(year, monthNum - 1, 1)
  const end = new Date(year, monthNum, 1)

  try {
    const employees = await prisma.employee.findMany({
      where: { companyId: req.auth!.companyId },
      select: { id: true, name: true, contractHours: true },
    })

    const timelogs = await prisma.timelog.findMany({
      where: {
        employee: { companyId: req.auth!.companyId },
        clockIn: { gte: start, lt: end },
      },
      select: {
        id: true,
        employeeId: true,
        clockIn: true,
        clockOut: true,
      },
    })

    const shifts = await prisma.shift.findMany({
      where: {
        companyId: req.auth!.companyId,
        startTime: { gte: start, lt: end },
      },
      select: {
        id: true,
        employeeId: true,
        startTime: true,
        endTime: true,
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

router.get('/export/:month', async (req: Request, res: Response) => {
  const match = String(req.params.month).match(/^(\d{4})-(\d{2})$/)
  if (!match) {
    res.status(400).json({ error: 'Format mois invalide. Utilise YYYY-MM' })
    return
  }

  const year = parseInt(match[1])
  const monthNum = parseInt(match[2])

  if (year < 2020 || year > 2030 || monthNum < 1 || monthNum > 12) {
    res.status(400).json({ error: 'Date invalide' })
    return
  }

  const start = new Date(year, monthNum - 1, 1)
  const end = new Date(year, monthNum, 1)

  try {
    const employees = await prisma.employee.findMany({
      where: { companyId: req.auth!.companyId },
      select: { id: true, name: true, contractHours: true },
    })

    const timelogs = await prisma.timelog.findMany({
      where: {
        employee: { companyId: req.auth!.companyId },
        clockIn: { gte: start, lt: end },
        clockOut: { not: null },
      },
      select: { employeeId: true, clockIn: true, clockOut: true },
    })

    const shifts = await prisma.shift.findMany({
      where: {
        companyId: req.auth!.companyId,
        startTime: { gte: start, lt: end },
      },
      select: { employeeId: true, startTime: true, endTime: true },
    })

    const rows = employees.map(emp => {
      const empTimelogs = timelogs.filter(t => t.employeeId === emp.id)
      const empShifts = shifts.filter(s => s.employeeId === emp.id)

      const workedMinutes = empTimelogs.reduce((acc, t) => {
        if (!t.clockOut) return acc
        return acc + (t.clockOut.getTime() - t.clockIn!.getTime()) / 60000
      }, 0)

      const workedHours = Math.round(workedMinutes / 60 * 10) / 10
      const normalHours = Math.min(workedHours, emp.contractHours)
      const extraHours = Math.max(0, workedHours - emp.contractHours)
      const absences = empShifts.length - empTimelogs.length

      return {
        matricule: emp.id.slice(0, 8).toUpperCase(),
        nom: emp.name,
        heures_contrat: emp.contractHours,
        heures_normales: normalHours,
        heures_supplementaires: extraHours,
        absences: Math.max(0, absences),
        periode: `${year}-${String(monthNum).padStart(2, '0')}`,
      }
    })

    const headers = ['matricule', 'nom', 'heures_contrat', 'heures_normales', 'heures_supplementaires', 'absences', 'periode']
    const csv = [
      headers.join(';'),
      ...rows.map(r => headers.map(h => r[h as keyof typeof r]).join(';')),
    ].join('\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="paie-${year}-${String(monthNum).padStart(2, '0')}.csv"`)
    res.send('\uFEFF' + csv)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router