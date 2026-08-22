import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Sync initial theme
const savedTheme = localStorage.getItem('emenu_theme')
if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('dark')
} else {
  document.documentElement.classList.remove('dark')
}

// Sync initial language
const savedLang = localStorage.getItem('emenu_language') || 'km'
document.documentElement.lang = savedLang

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
