import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Landing } from './pages/Landing'
import { HowItWorksPage } from './pages/HowItWorks'
import { RequestAccess } from './pages/RequestAccess'
import { About } from './pages/About'
import { Contact } from './pages/Contact'
import { Documentation } from './pages/Documentation'
import { AppShell } from './app/AppShell'
import { Graph } from './pages/Graph'
import { Search } from './pages/Search'
import { Dashboard } from './pages/Dashboard'
import { ControlRoomGraph } from './pages/ControlRoomGraph'
import { ControlRoomFindings } from './pages/ControlRoomFindings'
import { DemoEnter } from './pages/DemoEnter'
import { DemoWorkspace } from './pages/DemoWorkspace'
import { useAccess } from './lib/access'
import { GraphSimulationProvider } from './components/demo/graph/GraphSimulationContext'

function RequireAccess() {
  const { granted } = useAccess()
  return granted ? (
    <GraphSimulationProvider>
      <Outlet />
    </GraphSimulationProvider>
  ) : (
    <Navigate to="/request-access" replace />
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/how-it-works" element={<HowItWorksPage />} />
      <Route path="/request-access" element={<RequestAccess />} />
      <Route path="/about" element={<About />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/documentation" element={<Documentation />} />
      <Route element={<RequireAccess />}>
        <Route path="/app" element={<AppShell />}>
          <Route index element={<Navigate to="graph" replace />} />
          <Route path="graph" element={<Graph />} />
          <Route path="search" element={<Search />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="control-room" element={<ControlRoomGraph />} />
          <Route path="control-room/findings" element={<ControlRoomFindings />} />
        </Route>
        <Route path="/demo/enter" element={<DemoEnter />} />
        <Route path="/demo" element={<AppShell />}>
          <Route path="workspace" element={<DemoWorkspace />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
