import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { InterviewProvider } from './context/InterviewContext';
import SetupScreen from './screens/SetupScreen';
import InterviewScreen from './screens/InterviewScreen';
import FeedbackScreen from './screens/FeedbackScreen';

export default function App() {
  return (
    <BrowserRouter>
      <InterviewProvider>
        <Routes>
          <Route path="/" element={<SetupScreen />} />
          <Route path="/interview" element={<InterviewScreen />} />
          <Route path="/feedback" element={<FeedbackScreen />} />
        </Routes>
      </InterviewProvider>
    </BrowserRouter>
  );
}
