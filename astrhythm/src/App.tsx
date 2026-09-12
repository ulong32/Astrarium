import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ChartViewer } from "./pages/ChartViewer";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ChartViewer />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
