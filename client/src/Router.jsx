import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import Dashboard from "./pages/dashboard/dashboard";
import Login from "./pages/login_signup/login";
import SignUp from "./pages/login_signup/sign-up";
import UpdatePassword from "./pages/login_signup/routes/update-password";
import ForgotPassword from "./pages/login_signup/routes/forgot-password";
import ProtectedRoute, { protectedLoader } from "./components/auth/ProtectedRoute";
import SettingsPage from "./pages/dashboard/routes/Settings/SettingsPage";
import NotionToBlogsPage from "./pages/dashboard/routes/Notion_Blogs/NotionToBlogsPage";
import NotionToSocialsPage from "./pages/dashboard/routes/Notion_Socials/NotionToSocialsPage";
import { logoutLoader } from "./pages/login_signup/routes/logout";
import { loader as authConfirmLoader } from "./pages/login_signup/routes/auth.confirm";
import  AuthError  from "./pages/login_signup/routes/auth.error";
import WebflowOAuthRedirect from './auth/WebflowOAuthRedirect';
import NotionOAuthRedirect from './auth/NotionOAuthRedirect';
import SyncSetupWizard from './pages/dashboard/routes/Notion_Blogs/SyncSetupWizard';




export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />
  },
  {
    path: "/dashboard",
    element: (
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    ),
    loader: protectedLoader,
    children: [
      {
        path: "settings",
        element: <SettingsPage />,
      },
      {
        path: "notion-to-blogs",
        element: <NotionToBlogsPage />,
        children: [
          {
            path: "new",
            element: <SyncSetupWizard />
          }
        ]
      },
      {
        path: "notion-to-socials",
        element: <NotionToSocialsPage />,
      },
    ]
  },
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/sign-up",
    element: <SignUp />,
  },
  {
    path: "/update-password",
    element: (
      <ProtectedRoute>
        <UpdatePassword />
      </ProtectedRoute>
    ),
    loader: protectedLoader
  },
  {
    path: "/logout",
    loader: logoutLoader
  },
  {
    path: "/forgot-password",
    element: <ForgotPassword />
  },
  {
    path: "/auth/confirm",
    loader: authConfirmLoader
  },
  {
    path: "/auth/error",
    element: <AuthError />
  },
  {
    path: "/oauth/callback/webflow",
    element: <WebflowOAuthRedirect />
  },
  {
    path: "/oauth/callback/notion",
    element: <NotionOAuthRedirect />
  }
]);