import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Paint the correct platform style on the very first frame, before the async
// bootstrap payload arrives. The bootstrap value remains authoritative.
document.documentElement.dataset.platform = navigator.userAgent.includes('Macintosh')
  ? 'darwin'
  : 'win32'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(<App />)
