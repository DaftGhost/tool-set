import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RandomPersonaGenerator } from './App.tsx'
import './styles.css'

createRoot(document.getElementById('root')!).render(<StrictMode><RandomPersonaGenerator /></StrictMode>)
