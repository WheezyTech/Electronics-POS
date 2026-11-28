
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Download, Lock, MonitorDown, Smartphone, UserRound } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import webLogo from "../../../assets/branding/Electronics POS Web logo.png";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await login(username, password);
      const returnTo = location.state?.from;
      navigate(
        returnTo?.pathname?.startsWith("/")
          ? `${returnTo.pathname}${returnTo.search || ""}${returnTo.hash || ""}`
          : ["ACCOUNTANT", "AUDITOR"].includes(response.user?.role)
            ? "/reports"
            : "/dashboard",
        { replace: true }
      );
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        err.message ||
        "Login failed. Check your credentials."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <img
            src={webLogo}
            alt="Electronics POS — Sell, Manage, Grow"
            className="mx-auto mb-4 w-72 max-w-full object-contain"
          />

          <p className="mt-2 text-sm text-slate-500">
            Sign in to access your business dashboard
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Username
            </label>

            <div className="flex items-center rounded-lg border border-slate-300 px-3">
              <UserRound size={18} className="text-slate-400" />

              <input
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="w-full border-0 bg-transparent p-3 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Password
            </label>

            <div className="flex items-center rounded-lg border border-slate-300 px-3">
              <Lock size={18} className="text-slate-400" />

              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full border-0 bg-transparent p-3 outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-blue-700 hover:text-blue-800"
          >
            Forgot password?
          </Link>
        </div>

        <div className="mt-6 border-t border-slate-200 pt-5">
          <p className="mb-3 text-center text-sm font-medium text-slate-700">
            Get the Electronics POS app
          </p>
          <div className="grid grid-cols-2 gap-3">
            <a
              href="https://github.com/WheezyTech/Electronics-POS/releases"
              target="_blank"
              rel="noreferrer"
              title="Open Windows releases"
              className="flex items-center justify-center gap-2 rounded-lg border border-blue-200 px-3 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
            >
              <MonitorDown size={17} />
              Windows releases
              <Download size={15} />
            </a>
            <a
              href="/downloads/electronics-pos.apk"
              download="Electronics POS.apk"
              title="Download the Android app"
              className="flex items-center justify-center gap-2 rounded-lg border border-green-200 px-3 py-2.5 text-sm font-medium text-green-700 hover:bg-green-50"
            >
              <Smartphone size={17} />
              Android releases
              <Download size={15} />
            </a>
          </div>
          <p className="mt-2 text-center text-xs text-slate-400">
            Windows releases are hosted on GitHub. Download the Android app here.
          </p>
        </div>

        <p className="mt-8 text-center text-xs text-slate-400">
          Electronics POS Management System
        </p>
      </div>
    </div>
  );
}
