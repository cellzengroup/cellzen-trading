import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const passwordRules = [
  { test: (p) => p.length >= 6, label: 'At least 6 characters' },
  { test: (p) => /[A-Z]/.test(p), label: 'One uppercase letter' },
  { test: (p) => /[a-z]/.test(p), label: 'One lowercase letter' },
  { test: (p) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p), label: 'One special character' },
];

const inputStyle = {
  borderRadius: '1.8rem',
  backgroundColor: 'rgba(255, 255, 255, 0.22)',
  border: '1px solid rgba(255, 255, 255, 0.35)',
  color: '#fff',
  transition: 'all 0.3s ease',
};

const inputFocusStyle = {
  ...inputStyle,
  backgroundColor: 'rgba(255, 255, 255, 0.25)',
  border: '1px solid rgba(255, 255, 255, 0.5)',
};

const inputFocusClass = 'w-full px-4 py-3 focus:outline-none focus:ring-0 focus:border-transparent placeholder-gray-300';

/* CSS keyframes injected once */
const styleTag = document.createElement('style');
styleTag.textContent = `
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideDown {
    from { opacity: 0; max-height: 0; transform: translateY(-10px); }
    to { opacity: 1; max-height: 200px; transform: translateY(0); }
  }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-6px); }
    40% { transform: translateX(6px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(4px); }
  }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
  .login-card { animation: fadeInUp 0.6s ease-out; }
  .login-title { animation: fadeIn 0.8s ease-out; }
  .form-field { animation: fadeInUp 0.4s ease-out both; }
  .form-field:nth-child(1) { animation-delay: 0.1s; }
  .form-field:nth-child(2) { animation-delay: 0.2s; }
  .form-field:nth-child(3) { animation-delay: 0.3s; }
  .form-field:nth-child(4) { animation-delay: 0.4s; }
  .alert-slide { animation: slideDown 0.3s ease-out; overflow: hidden; }
  .shake { animation: shake 0.4s ease-in-out; }
  .tab-content { animation: scaleIn 0.3s ease-out; }
  .password-rule { animation: fadeIn 0.3s ease-out both; }
  .password-rule:nth-child(1) { animation-delay: 0.05s; }
  .password-rule:nth-child(2) { animation-delay: 0.1s; }
  .password-rule:nth-child(3) { animation-delay: 0.15s; }
  .password-rule:nth-child(4) { animation-delay: 0.2s; }
  .login-input { transition: all 0.3s ease; }
  .login-input:focus { background-color: rgba(255, 255, 255, 0.28) !important; border-color: rgba(255, 255, 255, 0.45) !important; }
  .login-input::placeholder { transition: opacity 0.3s ease; }
  .login-input:focus::placeholder { opacity: 0.5; }
  .submit-btn { transition: all 0.3s ease; }
  .submit-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 15px rgba(0,0,0,0.2); }
  .submit-btn:active:not(:disabled) { transform: translateY(0); }
  .eye-btn { transition: color 0.2s ease; }
  .eye-btn:hover { color: rgba(255, 255, 255, 0.9) !important; }
`;
if (!document.getElementById('login-animations')) {
  styleTag.id = 'login-animations';
  document.head.appendChild(styleTag);
}

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signUpEmail, setSignUpEmail] = useState('');
  const [shakeError, setShakeError] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const isPasswordValid = passwordRules.every((rule) => rule.test(password));
  const isEmailValid = (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

  // Shake animation on error
  useEffect(() => {
    if (error) {
      setShakeError(true);
      const t = setTimeout(() => setShakeError(false), 500);
      return () => clearTimeout(t);
    }
  }, [error]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isLogin) {
      if (!isEmailValid(email)) {
        setError('Please enter a valid email address (e.g. you@example.com)');
        return;
      }
      if (!isPasswordValid) {
        setError('Password must have at least 6 characters, one uppercase, one lowercase, and one special character');
        return;
      }
    }

    setLoading(true);

    try {
      if (isLogin) {
        await login(email, password);
        navigate('/inventorymanagement/dashboard', { replace: true });
      } else {
        await register(name, email, password);
        setSignUpEmail(email);
        setName('');
        setEmail('');
        setPassword('');
        setIsLogin(true);
        setError('');
        setFormKey((k) => k + 1);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleTabSwitch = (toLogin) => {
    setError('');
    setPassword('');
    setFormKey((k) => k + 1);
    if (toLogin) {
      setIsLogin(true);
      if (signUpEmail) {
        setEmail(signUpEmail);
      } else {
        setEmail('');
      }
    } else {
      setIsLogin(false);
      setEmail('');
      setSignUpEmail('');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#EFEAD8' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8 login-title">
          <h1 className="text-3xl font-bold" style={{ color: '#800000' }}>Yogini Arts</h1>
          <p className="text-gray-600 mt-2">Inventory Management System</p>
        </div>

        <div className="shadow-2xl p-8 login-card" style={{ backgroundColor: '#800000', borderRadius: '2.2rem' }}>
          {/* Tabs */}
          <div className="flex mb-6 p-1" style={{ backgroundColor: 'rgba(255, 255, 255, 0.15)', borderRadius: '1.8rem' }}>
            <button
              onClick={() => handleTabSwitch(true)}
              className={`flex-1 py-2.5 text-sm font-semibold transition-all duration-300 ${
                isLogin ? 'shadow-md' : 'text-gray-300 hover:text-white'
              }`}
              style={isLogin
                ? { backgroundColor: '#FFFFFF', color: '#800000', borderRadius: '1.5rem' }
                : { backgroundColor: 'transparent', borderRadius: '1.5rem' }
              }
            >
              Sign In
            </button>
            <button
              onClick={() => handleTabSwitch(false)}
              className={`flex-1 py-2.5 text-sm font-semibold transition-all duration-300 ${
                !isLogin ? 'shadow-md' : 'text-gray-300 hover:text-white'
              }`}
              style={!isLogin
                ? { backgroundColor: '#FFFFFF', color: '#800000', borderRadius: '1.5rem' }
                : { backgroundColor: 'transparent', borderRadius: '1.5rem' }
              }
            >
              Sign Up
            </button>
          </div>

          {signUpEmail && isLogin && (
            <div className="mb-4 p-3 text-sm alert-slide" style={{ backgroundColor: 'rgba(74, 222, 128, 0.2)', border: '1px solid rgba(74, 222, 128, 0.4)', borderRadius: '1rem', color: '#86efac' }}>
              Account created successfully! Please sign in.
            </div>
          )}

          {error && (
            <div className={`mb-4 p-3 text-sm alert-slide ${shakeError ? 'shake' : ''}`} style={{ backgroundColor: 'rgba(248, 113, 113, 0.2)', border: '1px solid rgba(248, 113, 113, 0.4)', borderRadius: '1rem', color: '#fca5a5' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 tab-content" key={formKey}>
            {!isLogin && (
              <div className="form-field">
                <label className="block text-sm font-medium text-white mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={!isLogin}
                  className={`${inputFocusClass} login-input`}
                  style={inputStyle}
                  placeholder="Your name"
                />
              </div>
            )}

            <div className="form-field">
              <label className="block text-sm font-medium text-white mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={`${inputFocusClass} login-input`}
                style={inputStyle}
                placeholder="you@example.com"
              />
              {!isLogin && email && !isEmailValid(email) && (
                <p className="mt-1.5 text-xs alert-slide" style={{ color: '#fca5a5' }}>Please enter a valid email (e.g. you@example.com)</p>
              )}
            </div>

            <div className="form-field">
              <label className="block text-sm font-medium text-white mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={`${inputFocusClass} pr-12 login-input`}
                  style={inputStyle}
                  placeholder={isLogin ? 'Enter your password' : 'Min 6 chars, A-z + symbol'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 focus:outline-none eye-btn"
                  style={{ color: 'rgba(255, 255, 255, 0.6)', top: '50%', transform: 'translateY(-50%)' }}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {/* Password strength indicators - only on Sign Up */}
              {!isLogin && password && (
                <div className="mt-2.5 space-y-1">
                  {passwordRules.map((rule, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs password-rule">
                      <span style={{
                        color: rule.test(password) ? '#86efac' : '#fca5a5',
                        transition: 'color 0.3s ease',
                      }}>
                        {rule.test(password) ? '\u2713' : '\u2717'}
                      </span>
                      <span style={{
                        color: rule.test(password) ? '#bbf7d0' : 'rgba(255,255,255,0.5)',
                        transition: 'color 0.3s ease',
                      }}>
                        {rule.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="form-field">
              <button
                type="submit"
                disabled={loading || (!isLogin && (!isPasswordValid || !isEmailValid(email)))}
                className="w-full py-3 font-semibold text-lg disabled:opacity-40 mt-2 submit-btn"
                style={{ backgroundColor: '#FFFFFF', color: '#800000', borderRadius: '1.8rem' }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Please wait...
                  </span>
                ) : isLogin ? 'Sign In' : 'Create Account'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
