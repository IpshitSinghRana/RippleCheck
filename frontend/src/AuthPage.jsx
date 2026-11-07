import React, { useState, useEffect } from 'react'
import {
  GitBranch,
  Shield,
  AlertCircle,
  CheckCircle2,
  Loader2
} from 'lucide-react'
import { signInWithPopup, signInWithRedirect, getRedirectResult } from 'firebase/auth'
import { auth, googleProvider, isFirebaseConfigured } from './firebase'
import { useAuth } from './AuthContext'

export function AuthPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  // Handle the result after a signInWithRedirect() flow returns
  useEffect(() => {
    if (!isFirebaseConfigured || !auth) return
    setLoading(true)
    getRedirectResult(auth)
      .then((result) => {
        if (result && result.user) {
          setStatusMessage(`Authenticated as ${result.user.displayName || result.user.email}`)
          console.log('[RippleCheck] Redirect sign-in successful.')
        }
      })
      .catch((err) => {
        console.error('[RippleCheck] Redirect result error:', err)
        if (err.code === 'auth/unauthorized-domain') {
          setError('This domain is not authorized in Firebase Console (Authentication → Settings → Authorized domains).')
        } else if (err.code && err.code !== 'auth/no-auth-event') {
          setError(err.message || 'Authentication failed after redirect.')
        }
      })
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleGoogleSignIn = async () => {
    setError('')
    setStatusMessage('')

    if (!isFirebaseConfigured || !auth || !googleProvider) {
      setError(
        'Firebase configuration is missing. Add your VITE_FIREBASE_* environment variables to frontend/.env.'
      )
      return
    }

    setLoading(true)
    try {
      const result = await signInWithPopup(auth, googleProvider)
      const token = await result.user.getIdToken()
      setStatusMessage(`Authenticated as ${result.user.displayName || result.user.email}`)
      console.log('[RippleCheck] Firebase Google Sign-In successful. ID Token acquired.')
    } catch (err) {
      console.error('[RippleCheck] Google Sign-In Error:', err)
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
        // Popup was blocked — fall back to redirect flow
        console.log('[RippleCheck] Popup blocked, falling back to signInWithRedirect.')
        setStatusMessage('Redirecting to Google Sign-In...')
        try {
          await signInWithRedirect(auth, googleProvider)
          // Page will navigate away; execution stops here
        } catch (redirectErr) {
          console.error('[RippleCheck] Redirect sign-in error:', redirectErr)
          setError(redirectErr.message || 'Authentication failed. Please try again.')
          setStatusMessage('')
          setLoading(false)
        }
        // Don't call setLoading(false) here — the redirect navigates the page
        return
      } else if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in cancelled: popup was closed before completing authentication.')
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('This domain is not authorized in Firebase Console (Authentication → Settings → Authorized domains).')
      } else {
        setError(err.message || 'Authentication failed. Please verify your connection and Firebase configuration.')
      }
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary, #0a0a0c)',
        color: 'var(--text-primary, #ededf0)',
        fontFamily: 'var(--font-sans)',
        position: 'relative',
        overflowY: 'auto'
      }}
    >
      {/* Top Header Bar */}
      <header
        style={{
          height: '46px',
          background: 'var(--bg-secondary, #111114)',
          borderBottom: '1px solid var(--border-subtle, #23232b)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          zIndex: 10
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '5px',
              background: '#17171c',
              border: '1px solid var(--border-medium, #2e2e38)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <GitBranch size={15} color="#ededf0" />
          </div>
          <span style={{ fontWeight: 700, fontSize: '13px', letterSpacing: '0.6px', color: '#ededf0' }}>
            RIPPLECHECK
          </span>
          <span
            style={{
              fontSize: '10px',
              color: 'var(--text-muted, #646473)',
              borderLeft: '1px solid var(--border-medium, #2e2e38)',
              paddingLeft: '8px'
            }}
          >
            Authentication
          </span>
        </div>
      </header>

      {/* Main Centered Authentication Panel */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 16px'
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '400px',
            background: 'var(--bg-secondary, #111114)',
            border: '1px solid var(--border-subtle, #23232b)',
            borderRadius: '8px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)',
            padding: '36px 30px',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px'
          }}
        >
          {/* Logo & Headings */}
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '44px',
                height: '44px',
                borderRadius: '8px',
                background: 'var(--bg-surface, #17171c)',
                border: '1px solid var(--border-medium, #2e2e38)',
                marginBottom: '16px'
              }}
            >
              <GitBranch size={22} color="#ededf0" />
            </div>

            <h1
              style={{
                fontSize: '20px',
                fontWeight: 700,
                color: '#ededf0',
                letterSpacing: '-0.3px',
                margin: '0 0 8px 0'
              }}
            >
              Welcome to RippleCheck
            </h1>

            <p
              style={{
                fontSize: '12px',
                color: 'var(--text-secondary, #9a9aa8)',
                lineHeight: 1.5,
                margin: 0
              }}
            >
              Understand your code. Predict the impact.
            </p>
          </div>

          {/* Setup Notice if Firebase credentials missing */}
          {!isFirebaseConfigured && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                padding: '10px 12px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle, #23232b)',
                borderRadius: '5px',
                fontSize: '11px',
                color: 'var(--text-secondary, #9a9aa8)',
                lineHeight: 1.4
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ededf0', fontWeight: 600 }}>
                <Shield size={13} />
                <span>Firebase Configuration Required</span>
              </div>
              <div>
                Add your Firebase project credentials in <code style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#ededf0' }}>frontend/.env</code> to activate Google authentication.
              </div>
            </div>
          )}

          {/* Error Message Area */}
          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '10px 12px',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '5px',
                fontSize: '11px',
                color: '#fca5a5',
                lineHeight: 1.4
              }}
            >
              <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0, marginTop: '1px' }} />
              <div>{error}</div>
            </div>
          )}

          {/* Status Message */}
          {statusMessage && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 12px',
                background: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '5px',
                fontSize: '11px',
                color: '#86efac',
                lineHeight: 1.4
              }}
            >
              <CheckCircle2 size={14} color="#22c55e" style={{ flexShrink: 0 }} />
              <div>{statusMessage}</div>
            </div>
          )}

          {/* Primary Action Button: Continue with Google */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              background: '#ededf0',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 16px',
              color: '#0a0a0c',
              fontSize: '13px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.75 : 1,
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.background = '#ffffff'
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.background = '#ededf0'
            }}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spin" color="#0a0a0c" />
                Connecting to Google...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.4 8.9 5 12 5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.3 14.7c-.2-.7-.4-1.6-.4-2.7s.1-2 .4-2.7L1.6 6.4C.6 8.3 0 10.1 0 12s.6 3.7 1.6 5.6l3.7-2.9z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.4-6.7-5.3L1.6 16C3.5 19.8 7.4 23 12 23z"
                  />
                </svg>
                Continue with Google
              </>
            )}
          </button>
        </div>
      </main>

      {/* Developer Aesthetic Footer */}
      <footer
        style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border-subtle, #23232b)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: 'var(--text-muted, #646473)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Shield size={12} />
          <span>Firebase Authentication • Google OAuth Provider</span>
        </div>
        <div>RippleCheck v1.0 • Neo4j Engine</div>
      </footer>
    </div>
  )
}
