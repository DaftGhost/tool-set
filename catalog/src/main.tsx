import { createRoot } from 'react-dom/client'
import App from './App'
import './catalog.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Catalog root element was not found')

createRoot(rootElement).render(<App />)
