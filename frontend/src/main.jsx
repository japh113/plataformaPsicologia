import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import SessionRoot from './SessionRoot.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SessionRoot />
  </StrictMode>,
)
