import { Routes, Route } from 'react-router-dom';
import SearchPage from './pages/SearchPage';
import SingleRunView from './pages/SingleRunView';
import CompareView from './pages/CompareView';
import ManualEngineRunsPage from './pages/ManualEngineRunsPage';

export default function App() {
    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-[1000px] mx-auto">
                <Routes>
                    <Route path="/" element={<SearchPage />} />
                    <Route path="/manual-engines" element={<ManualEngineRunsPage />} />
                    <Route path="/run/:id" element={<SingleRunView />} />
                    <Route path="/compare/:id1/:id2" element={<CompareView />} />
                </Routes>
            </div>
        </div>
    );
}
