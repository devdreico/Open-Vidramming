import { useEffect } from 'react';
import { useAppController } from './state/useAppController';
import { Sidebar } from './ui/Sidebar';
import { PreviewArea } from './ui/PreviewArea';

export default function App() {
  const ctrl = useAppController();
  const { refreshHistory } = ctrl;

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  return (
    <div className="flex h-dvh w-screen flex-col-reverse overflow-hidden bg-white text-ink-950 lg:flex-row">
      <Sidebar ctrl={ctrl} />
      <PreviewArea ctrl={ctrl} />
    </div>
  );
}
