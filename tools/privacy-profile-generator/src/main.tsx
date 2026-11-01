import React from 'react'
import { createRoot } from 'react-dom/client'
import { PrivacyProfileGenerator } from './App'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Application root element is missing')

createRoot(root).render(
  <React.StrictMode>
    <PrivacyProfileGenerator />
  </React.StrictMode>,
)
