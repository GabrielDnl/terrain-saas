import express, { Request, Response, NextFunction } from 'express'
import dotenv from 'dotenv'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import cors from 'cors'
import authRoutes from './routes/auth'
import employeeRoutes from './routes/employees'
import shiftRoutes from './routes/shifts'
import agentRoutes from './routes/agent'

dotenv.config()

const app = express()

app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
app.use(express.json())

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'GET' && !req.is('application/json')) {
    res.status(415).json({ error: 'Content-Type application/json requis' })
    return
  }
  next()
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Trop de requêtes, réessaie dans 15 minutes' },
})

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Trop de requêtes' },
})

const agentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Trop de requêtes' },
})

app.use(globalLimiter)

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.use('/auth', authLimiter, authRoutes)
app.use('/employees', employeeRoutes)
app.use('/shifts', shiftRoutes)
app.use('/agent', agentLimiter, agentRoutes)

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`)
})

export default app