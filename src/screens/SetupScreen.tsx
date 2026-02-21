import { useNavigate } from 'react-router-dom';
import { useInterview } from '../context/InterviewContext';
import { seededQuestions } from '../data/questions';
import { Role, Difficulty } from '../types';

export default function SetupScreen() {
  const { state, dispatch } = useInterview();
  const navigate = useNavigate();

  const handleStart = () => {
    // Pick a random question matching role + difficulty from seed data
    const matching = seededQuestions.filter(
      (q) => q.role === state.role && q.difficulty === state.difficulty
    );
    const question = matching[Math.floor(Math.random() * matching.length)];
    if (question) {
      dispatch({ type: 'SET_QUESTION', payload: question });
    }
    navigate('/interview');
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1>AI Mock Interview Coach</h1>
      <p>Select your role and difficulty, then start practicing.</p>

      {/* TODO: Replace with RoleSelector component */}
      <div style={{ margin: '1rem 0' }}>
        <label>Role: </label>
        <select
          value={state.role}
          onChange={(e) => dispatch({ type: 'SET_ROLE', payload: e.target.value as Role })}
        >
          <option value="swe_intern">SWE Intern</option>
          <option value="pm_intern">PM Intern</option>
        </select>
      </div>

      {/* TODO: Replace with DifficultySelector component */}
      <div style={{ margin: '1rem 0' }}>
        <label>Difficulty: </label>
        <select
          value={state.difficulty}
          onChange={(e) => dispatch({ type: 'SET_DIFFICULTY', payload: e.target.value as Difficulty })}
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>

      <button onClick={handleStart} style={{ padding: '0.75rem 2rem', fontSize: '1.1rem' }}>
        Start Interview
      </button>
    </div>
  );
}
