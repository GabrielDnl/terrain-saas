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

    res.json({
      employee: {
        name: employee.name,
      },
      shifts: shifts.map(s => ({
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        site: s.site,
      })),
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router