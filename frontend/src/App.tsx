import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Landing } from './pages/Landing'
import { HowItWorksPage } from './pages/HowItWorks'
import { RequestAccess } from './pages/RequestAccess'
import { About } from './pages/About'
import { Contact } from './pages/Contact'
import { Documentation } from './pages/Documentation'
import { AppShell } from './app/AppShell'
import { Graph } from './pages/Graph'
import { GraphNext } from './pages/GraphNext'
import { Search } from './pages/Search'
import { Dashboard } from './pages/Dashboard'
import { ControlRoom } from './pages/ControlRoom'
import { ControlRoomFindings } from './pages/ControlRoomFindings'
import { TabStub } from './components/controlRoom/TabStub'
import { Overview } from './components/controlRoom/Overview'
import { Processing } from './components/controlRoom/Processing'
import { Identity } from './components/controlRoom/Identity'
import { Meaning } from './components/controlRoom/Meaning'
import { Reasoning } from './components/controlRoom/Reasoning'
import { Detection } from './components/controlRoom/Detection'
import { Prediction } from './components/controlRoom/Prediction'
import { Revision } from './components/controlRoom/Revision'
import { Exposure } from './components/controlRoom/Exposure'
import { Trust } from './components/controlRoom/Trust'
import { Model } from './components/controlRoom/Model'
import { DEFAULT_TAB_ID } from './components/controlRoom/tabs'
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
          <Route path="graph-next" element={<GraphNext />} />
          <Route path="search" element={<Search />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="control-room" element={<ControlRoom />}>
            <Route index element={<Navigate to={DEFAULT_TAB_ID} replace />} />
            <Route path="overview" element={<Overview />} />
            <Route path="processing" element={<Processing />} />
            <Route path="model" element={<Model />} />
            <Route path="identity" element={<Identity />} />
            <Route path="meaning" element={<Meaning />} />
            <Route path="reasoning" element={<Reasoning />} />
            <Route path="detection" element={<Detection />} />
            <Route path="prediction" element={<Prediction />} />
            <Route path="revision" element={<Revision />} />
            <Route path="exposure" element={<Exposure />} />
            <Route path="trust" element={<Trust />} />
            <Route path=":tab" element={<TabStub />} />
          </Route>
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
