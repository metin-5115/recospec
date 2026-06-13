import React from 'react'
import ReactDOM from 'react-dom/client'
import { SidePanelApp } from './SidePanelApp'
import { ErrorBoundary } from './components/ErrorBoundary'
import './side-panel.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SidePanelApp />
    </ErrorBoundary>
  </React.StrictMode>,
)
