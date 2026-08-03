import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Bots from './pages/Bots';
import BotInstances from './pages/BotInstances';
import BotDashboard from './pages/BotDashboard';
import Products from './pages/Products';
import NewProduct from './pages/NewProduct';
import ProductDetail from './pages/ProductDetail';
import CallDetail from './pages/CallDetail';
import Embed from './pages/Embed';

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" />;
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<PrivateRoute><Bots /></PrivateRoute>} />
        <Route path="/bots/:botType" element={<PrivateRoute><BotInstances /></PrivateRoute>} />
        <Route path="/bots/:botType/:productId" element={<PrivateRoute><BotDashboard /></PrivateRoute>} />
        <Route path="/products" element={<PrivateRoute><Products /></PrivateRoute>} />
        <Route path="/products/new" element={<PrivateRoute><NewProduct /></PrivateRoute>} />
        <Route path="/products/:id" element={<PrivateRoute><ProductDetail /></PrivateRoute>} />
        <Route path="/calls/:id" element={<PrivateRoute><CallDetail /></PrivateRoute>} />
        <Route path="/embed/:id" element={<PrivateRoute><Embed /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
  );
}