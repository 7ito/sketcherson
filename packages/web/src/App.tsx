import { Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from './components/HomePage';
import { RoomPage } from './components/RoomPage';
import { ShellThemeProvider } from './components/ShellThemeProvider';
import { type SketchersonWebSlots, WebExtensionSlotsProvider } from './components/WebExtensionSlots';

export type AppProps = {
  slots?: SketchersonWebSlots;
};

export function App({ slots }: AppProps = {}) {
  return (
    <WebExtensionSlotsProvider slots={slots}>
      <ShellThemeProvider>
        <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/room/:code" element={<RoomPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ShellThemeProvider>
    </WebExtensionSlotsProvider>
  );
}
