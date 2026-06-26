import express from 'express'
import dotenv from 'dotenv'
import authRoutes from './routes/auth'
import employeeRoutes from './routes/employees'

dotenv.config()

const app = express()
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.use('/auth', authRoutes)
app.use('/employees', employeeRoutes)

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`)
})

export default app