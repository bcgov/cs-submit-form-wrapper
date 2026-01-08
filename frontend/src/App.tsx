import { useEffect } from 'react'
import { FormBuilder } from '@formio/react'
import './App.css'
import './index.css'

function App() {
  const setIsDark = (isDark: boolean) => {
    if (isDark) {
      document.documentElement.setAttribute('data-bs-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-bs-theme', 'light');
    }
  }


  useEffect(() => {
    const mq = window.matchMedia(
      "(prefers-color-scheme: dark)"
    );

    setIsDark(mq.matches);

    // This callback will fire if the perferred color scheme changes without a reload
    mq.addEventListener("change", (evt) => setIsDark(evt.matches));
  }, []);

  return (
    <>
      <div>
        <FormBuilder />
      </div>
    </>
  )
}

export default App
