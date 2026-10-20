import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Import audit utilities to initialize window functions for services
import './utils/auditUtils.js'
// Import performance utilities
import './utils/perfUtils.js'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').then(registration => {
      console.log('SW registered: ', registration);

      // If there is already a waiting service worker on load, notify the app
      if (registration.waiting) {
        window.dispatchEvent(new CustomEvent('sw-update-available', { detail: registration }));
      }

      // Listen for future updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New content is ready; send custom event
              window.dispatchEvent(new CustomEvent('sw-update-available', { detail: registration }));
            }
          });
        }
      });
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}


const rootContainer = document.getElementById('root');
const root = ReactDOM.createRoot(rootContainer);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Flag that React application mounted successfully
window.__appMounted = true;
const initialLoader = document.querySelector('.initial-loader');
if (initialLoader) {
  initialLoader.style.transition = 'opacity 0.25s ease-out';
  initialLoader.style.opacity = '0';
  setTimeout(() => initialLoader.remove(), 250);
}
