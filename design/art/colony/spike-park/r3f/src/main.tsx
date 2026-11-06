import { createRoot } from 'react-dom/client'
import { App } from './App'
import { settings } from './settings'

if (settings.transparent) document.body.classList.add('transparent')
createRoot(document.getElementById('root')!).render(<App />)
