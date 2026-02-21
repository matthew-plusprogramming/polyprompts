import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { InterviewProvider } from './context/InterviewContext';
import SetupScreen from './screens/SetupScreen';

const InterviewScreen = lazy(() => import('./screens/InterviewScreen'));
const FeedbackScreen = lazy(() => import('./screens/FeedbackScreen'));

export default function App() {
  return (
    <BrowserRouter>
      <InterviewProvider>
        <Suspense fallback={<div style={{ padding: '2rem' }}>Loading...</div>}>
          <Routes>
            <Route path="/" element={<SetupScreen />} />
            <Route path="/interview" element={<InterviewScreen />} />
            <Route path="/feedback" element={<FeedbackScreen />} />
          </Routes>
        </Suspense>
      </InterviewProvider>
    </BrowserRouter>
  );
}
