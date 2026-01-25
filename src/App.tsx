import './App.css'
import { Canvas } from './components/Canvas'

function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Recap Canvas · Prototype</p>
          <h1>Canvas overview</h1>
        </div>
      </header>

      <Canvas />
    </div>
  )
}

export default App
