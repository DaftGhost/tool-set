import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RandomPersonaGenerator } from './App.tsx'

createRoot(document.getElementById('root')!).render(<StrictMode><RandomPersonaGenerator /></StrictMode>)
