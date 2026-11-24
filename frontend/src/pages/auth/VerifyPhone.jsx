import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
import webLogo from "../../../assets/branding/Electronics POS Web logo.png";

export default function VerifyPhone() {
  const { user, loadUser } = useAuth();
  const [otp, setOtp] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [retrySeconds, setRetrySeconds] = useState(0);

  useEffect(() => {
    if (retrySeconds <= 0) return undefined;
    const timer = window.setTimeout(
      () => setRetrySeconds((seconds) => seconds - 1),
      1000
    );
    return () => window.clearTimeout(timer);
  }, [retrySeconds]);

  const sendOtp = async () => {
    setSending(true);
    setError("");
    setStatusMessage("");
    try {
      const response = await api.post("/auth/phone-verification/send/");
      setStatusMessage(response.data.detail);
      setRetrySeconds(response.data.retry_after_seconds || 60);
    } catch (sendError) {
      const data = sendError.response?.data;
      setRetrySeconds(data?.retry_after_seconds || 0);
      setError(data?.detail || "Unable to send the phone verification OTP.");
    } finally {
      setSending(false);
    }
  };

  const verifyOtp = async (event) => {
    event.preventDefault();
    setVerifying(true);
    setError("");
    setStatusMessage("");
    try {
      const response = await api.post(
        "/auth/phone-verification/verify/",
        { otp }
      );
      setStatusMessage(response.data.detail);
      setOtp("");
      await loadUser();
    } catch (verifyError) {
      setError(
        verifyError.response?.data?.detail ||
          "Unable to verify the phone OTP."
      );
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="login-page flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
        <img
          src={webLogo}
          alt="Electronics POS"
          className="mx-auto mb-6 w-64 max-w-full object-contain"
        />
        <h1 className="mb-2 text-xl font-bold text-slate-900">
          Phone verification
        </h1>
        <p className="mb-5 text-sm text-slate-600">
          {user?.phone_number
            ? `Verify ${user.phone_number}`
            : "Your account has no phone number"}
        </p>

        {statusMessage && (
          <p role="status" className="mb-4 text-sm text-green-700">
            {statusMessage}
          </p>
        )}
        {error && (
          <p role="alert" className="mb-4 text-sm text-red-700">
            {error}
          </p>
        )}

        {user?.phone_verified ? (
          <Link
            to="/"
            className="inline-block rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white"
          >
            Continue
          </Link>
        ) : (
          <>
            <button
              type="button"
              disabled={sending || retrySeconds > 0 || !user?.phone_number}
              onClick={sendOtp}
              className="mb-5 w-full rounded-lg border border-blue-600 py-3 font-semibold text-blue-700 disabled:opacity-60"
            >
              {retrySeconds > 0
                ? `Resend OTP in ${retrySeconds}s`
                : sending
                  ? "Sending..."
                  : "Send verification OTP"}
            </button>

            <form onSubmit={verifyOtp} className="space-y-4 text-left">
              <label className="block text-sm font-medium text-slate-700">
                6-digit OTP
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(event) =>
                    setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="mt-1 w-full rounded-lg border p-3 text-center text-xl tracking-[0.5em]"
                  placeholder="000000"
                />
              </label>
              <button
                type="submit"
                disabled={verifying}
                className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white disabled:opacity-60"
              >
                {verifying ? "Verifying..." : "Verify OTP"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
