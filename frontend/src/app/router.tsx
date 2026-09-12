import { createBrowserRouter, Navigate } from "react-router-dom";
import { App } from "./App";
import { LoginPage } from "./LoginPage";
import { GuestRoute, ProtectedRoute } from "./ProtectedRoute";

export const router = createBrowserRouter([
  {
    element: <GuestRoute />,
    children: [{ path: "/login", element: <LoginPage /> }],
  },
  {
    element: <ProtectedRoute />,
    children: [{ path: "/", element: <App /> }],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
