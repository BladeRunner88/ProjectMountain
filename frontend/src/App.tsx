import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Landing } from './pages/Landing'
import { HowItWorksPage } from './pages/HowItWorks'
import { RequestAccess } from './pages/RequestAccess'
import { AppShell } from './app/AppShell'
import { Graph } from './pages/Graph'
import { Search } from './pages/Search'
import { Dashboard } from './pages/Dashboard'
import { useAccess } from './lib/access'

function RequireAccess() {
  const { granted } = useAccess()
  return granted ? <Outlet /> : <Navigate to="/request-access" replace />
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/how-it-works" element={<HowItWorksPage />} />
      <Route path="/request-access" element={<RequestAccess />} />
      <Route element={<RequireAccess />}>
        <Route path="/app" element={<AppShell />}>
          <Route index element={<Navigate to="graph" replace />} />
          <Route path="graph" element={<Graph />} />
          <Route path="search" element={<Search />} />
          <Route path="dashboard" element={<Dashboard />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
