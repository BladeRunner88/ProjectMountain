import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AccessProvider } from './lib/access.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AccessProvider>
        <App />
      </AccessProvider>
    </BrowserRouter>
  </StrictMode>,
)
