import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { InterviewProvider } from './context/InterviewContext';
import SetupScreen from './screens/SetupScreen';
import InterviewScreen from './screens/InterviewScreen';
import FeedbackScreen from './screens/FeedbackScreen';

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <InterviewProvider>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<SetupScreen />} />
          <Route path="/interview" element={<InterviewScreen />} />
          <Route path="/feedback" element={<FeedbackScreen />} />
        </Routes>
      </InterviewProvider>
    </BrowserRouter>
  );
}
