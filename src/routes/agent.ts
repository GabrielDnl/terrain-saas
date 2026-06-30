import { Router, Request, Response } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

router.get('/:token', async (req: Request, res: Response) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { accessToken: String(req.params.token) },
    })

    if (!employee) {
      res.status(404).json({ error: 'Lien invalide ou expiré' })
      return
    }

    if (employee.tokenExpiresAt && employee.tokenExpiresAt < new Date()) {
      res.status(401).json({ error: 'Ce lien a expiré. Demandez un nouveau planning à votre responsable.' })
      return
    }

    const now = new Date()
    const start = new Date(now)
    start.setDate(now.getDate() - now.getDay() + 1)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(start.getDate() + 7)

    const shifts = await prisma.shift.findMany({
      where: {
        employeeId: employee.id,
        startTime: { gte: start, lt: end },
      },
      orderBy: { startTime: 'asc' },
    })

    const activeTimelog = await prisma.timelog.findFirst({
      where: {
        employeeId: employee.id,
        clockIn: { not: null },
        clockOut: null,
        status: 'PENDING',
      },
    })

    res.json({
      employee: { id: employee.id, name: employee.name },
      shifts: shifts.map(s => ({
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        site: s.site,
      })),
      isClockedIn: !!activeTimelog,
      clockIn: activeTimelog?.clockIn ?? null,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.post('/:token/clockin', async (req: Request, res: Response) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { accessToken: String(req.params.token) },
    })

    if (!employee) {
      res.status(404).json({ error: 'Lien invalide ou expiré' })
      return
    }

    if (employee.tokenExpiresAt && employee.tokenExpiresAt < new Date()) {
      res.status(401).json({ error: 'Ce lien a expiré' })
      return
    }

    const existing = await prisma.timelog.findFirst({
      where: {
        employeeId: employee.id,
        clockIn: { not: null },
        clockOut: null,
        status: 'PENDING',
      },
    })
    if (existing) {
      res.status(409).json({ error: 'Déjà en poste' })
      return
    }

    const { lat, lng } = req.body

    const timelog = await prisma.timelog.create({
      data: {
        employeeId: employee.id,
        clockIn: new Date(),
        lat: lat ?? null,
        lng: lng ?? null,
        status: 'PENDING',
      },
    })

    res.status(201).json({ id: timelog.id, clockIn: timelog.clockIn })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.post('/:token/clockout', async (req: Request, res: Response) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { accessToken: String(req.params.token) },
    })

    if (!employee) {
      res.status(404).json({ error: 'Lien invalide ou expiré' })
      return
    }

    const timelog = await prisma.timelog.findFirst({
      where: {
        employeeId: employee.id,
        clockIn: { not: null },
        clockOut: null,
        status: 'PENDING',
      },
    })

    if (!timelog) {
      res.status(404).json({ error: 'Aucun pointage d\'arrivée trouvé' })
      return
    }

    const { lat, lng } = req.body

    const updated = await prisma.timelog.update({
      where: { id: timelog.id },
      data: {
        clockOut: new Date(),
        lat: lat ?? timelog.lat,
        lng: lng ?? timelog.lng,
      },
    })

    res.json({ id: updated.id, clockOut: updated.clockOut })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.post('/:token/absence', async (req: Request, res: Response) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { accessToken: String(req.params.token) },
    })

    if (!employee) {
      res.status(404).json({ error: 'Lien invalide' })
      return
    }

    const { reason } = req.body

    await prisma.timelog.create({
      data: {
        employeeId: employee.id,
        status: 'DISPUTED',
        lat: null,
        lng: null,
      },
    })

    console.log(`Absence signalée par ${employee.name} — motif: ${reason || 'Non précisé'}`)
    res.json({ success: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router