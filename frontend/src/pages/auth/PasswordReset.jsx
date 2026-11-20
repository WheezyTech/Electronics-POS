import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import webLogo from "../../../assets/branding/Electronics POS Web logo.png";

export default function PasswordReset() {
  const [searchParams] = useSearchParams();
  const uid = searchParams.get("uid");
  const token = searchParams.get("token");
  const isConfirming = Boolean(uid && token);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (isConfirming && password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const response = isConfirming
        ? await api.post("/auth/password-reset/confirm/", {
            uid,
            token,
            password,
          })
        : await api.post("/auth/password-reset/", { email });
      setMessage(response.data.detail);
    } catch (requestError) {
      const data = requestError.response?.data;
      setError(
        data?.detail ||
          data?.password?.[0] ||
          "Unable to process the password reset request."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <img
          src={webLogo}
          alt="Electronics POS"
          className="mx-auto mb-6 w-64 max-w-full object-contain"
        />
        <h1 className="mb-2 text-center text-xl font-bold text-slate-900">
          {isConfirming ? "Choose a new password" : "Reset your password"}
        </h1>
        <p className="mb-6 text-center text-sm text-slate-500">
          {isConfirming
            ? "Enter a new password for your account."
            : "We’ll email a reset link if the address belongs to an active account with a verified email."}
        </p>

        {message && (
          <div role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            {message}
          </div>
        )}
        {error && (
          <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!message && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {isConfirming ? (
              <>
                <label className="block text-sm font-medium text-slate-700">
                  New password
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-3"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Confirm new password
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-3"
                  />
                </label>
              </>
            ) : (
              <label className="block text-sm font-medium text-slate-700">
                Verified email address
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-3"
                />
              </label>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting
                ? "Please wait..."
                : isConfirming
                  ? "Save new password"
                  : "Send reset link"}
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-sm">
          <Link to="/login" className="font-medium text-blue-700 hover:text-blue-800">
            Return to sign in
          </Link>
        </p>
        {!isConfirming && (
          <p className="mt-3 text-center text-sm">
            <Link to="/verify-email" className="text-blue-700 hover:text-blue-800">
              Need to verify your email first?
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
