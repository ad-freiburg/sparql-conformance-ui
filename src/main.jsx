import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { getRuntimeBasePath } from './utils/basePath.js'

function getRouterBasename() {
  const baseUrl = getRuntimeBasePath();
  if (baseUrl === '/') return undefined;
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={getRouterBasename()}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
