import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { ChoresProvider } from './hooks/useChores'
import { LabelsProvider } from './hooks/useLabels'
import { ViewsProvider } from './hooks/useViews'
import { PwaProvider } from './hooks/usePwa'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <PwaProvider>
        <AuthProvider>
          <ChoresProvider>
            <LabelsProvider>
              <ViewsProvider>
                <App />
              </ViewsProvider>
            </LabelsProvider>
          </ChoresProvider>
        </AuthProvider>
      </PwaProvider>
    </BrowserRouter>
  </StrictMode>,
)
