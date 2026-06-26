import { Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './components/ThemeProvider';
import { AppConfigProvider } from './components/AppConfigProvider';
import AuthGate from './components/AuthGate';
import Navbar from './components/Navbar';
import Topbar from './components/Topbar';
import SyncRadarBackdrop from './components/SyncRadarBackdrop';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import DepartmentHealth from './pages/DepartmentHealth';
import Changes from './pages/Changes';
import OrganizationReport from './pages/OrganizationReport';
import Settings from './pages/Settings';

export default function App() {
  return (
    <ThemeProvider>
      <AppConfigProvider>
        <AuthGate>
          <div className="app-shell min-h-screen transition-colors relative overflow-x-hidden">
            <SyncRadarBackdrop />
            <Navbar />
            <div className="relative z-10 lg:pl-56 min-h-screen pb-16 lg:pb-0">
              <Topbar />
              <main className="max-w-[1280px] mx-auto w-full px-4 sm:px-6 py-6 lg:py-7">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/contacts" element={<Contacts />} />
                  <Route path="/department-health" element={<DepartmentHealth />} />
                  <Route path="/changes" element={<Changes />} />
                  <Route path="/reports" element={<OrganizationReport />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </main>
            </div>
          </div>
        </AuthGate>
      </AppConfigProvider>
    </ThemeProvider>
  );
}
