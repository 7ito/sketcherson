import { Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from './components/HomePage';
import { RoomPage } from './components/RoomPage';
import { ShellThemeProvider } from './components/ShellThemeProvider';

export function App() {
  return (
    <ShellThemeProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/room/:code" element={<RoomPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ShellThemeProvider>
  );
}
