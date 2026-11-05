import React from 'react'
import { createRoot } from 'react-dom/client'
import { TextFormatterApp } from './App'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Application root element is missing')

createRoot(root).render(
  <React.StrictMode>
    <TextFormatterApp />
  </React.StrictMode>,
)
