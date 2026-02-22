import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { InterviewProvider } from './context/InterviewContext';
// import SetupScreen from './screens/SetupScreen';
import HomeScreen from './screens/HomeScreen';
import JobDescription from './screens/JobDescription';

const PreInterviewScreen = lazy(() => import('./screens/PreInterviewScreen'));
const InterviewScreen = lazy(() => import('./screens/InterviewScreen'));
const FeedbackScreen = lazy(() => import('./screens/FeedbackScreen'));

const loadingFallback = (
  <div style={{
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#09090f',
    color: '#64748b',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
  }}>
    Loading...
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <InterviewProvider>
        <Routes>
          <Route path="/" element={<div className="page-enter"><HomeScreen /></div>} />
          {/* <Route path="/setup" element={<div className="page-enter"><SetupScreen /></div>} /> */}
          <Route path="/job-description" element={<div className="page-enter"><JobDescription /></div>} />
          <Route path="/pre-interview" element={
            <Suspense fallback={loadingFallback}>
              <div className="page-enter"><PreInterviewScreen /></div>
            </Suspense>
          } />
          <Route path="/interview" element={
            <Suspense fallback={loadingFallback}>
              <div className="page-enter"><InterviewScreen /></div>
            </Suspense>
          } />
          <Route path="/feedback" element={
            <Suspense fallback={loadingFallback}>
              <div className="page-enter"><FeedbackScreen /></div>
            </Suspense>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </InterviewProvider>
    </BrowserRouter>
  );
}
