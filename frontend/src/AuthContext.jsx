import React, { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signOut as fbSignOut, getRedirectResult } from 'firebase/auth'
import { auth, isFirebaseConfigured } from './firebase'

const AuthContext = createContext({
  user: null,
  idToken: null,
  loading: true,
  isConfigured: false,
  signOut: async () => {}
})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [idToken, setIdToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // If Firebase credentials are missing, mark loading complete with null user
    if (!isFirebaseConfigured || !auth) {
      setUser(null)
      setIdToken(null)
      setLoading(false)
      return
    }

    // Process any pending redirect sign-in result FIRST so that the subsequent
    // onAuthStateChanged callback sees the authenticated user immediately,
    // rather than firing once with null (unauthenticated) before the redirect
    // token is exchanged. This prevents the app from briefly flashing the
    // AuthPage after a successful signInWithRedirect() flow.
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          console.log('[RippleCheck] AuthContext: redirect sign-in result received for', result.user.email)
        }
      })
      .catch((err) => {
        // auth/no-auth-event is expected when there is no pending redirect — ignore it.
        if (err.code !== 'auth/no-auth-event') {
          console.error('[RippleCheck] AuthContext: redirect result error:', err.code, err.message)
        }
      })

    // Subscribe to Firebase Authentication state updates.
    // This fires after getRedirectResult has exchanged the token (if any),
    // so the first emission will already carry the signed-in user.
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const token = await currentUser.getIdToken()
          setUser(currentUser)
          setIdToken(token)
        } catch (err) {
          console.error('[RippleCheck] Failed to retrieve user ID token:', err)
          setUser(currentUser)
          setIdToken(null)
        }
      } else {
        setUser(null)
        setIdToken(null)
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const signOut = async () => {
    if (auth) {
      await fbSignOut(auth)
    }
    setUser(null)
    setIdToken(null)
  }

  const value = {
    user,
    idToken,
    loading,
    isConfigured: isFirebaseConfigured,
    signOut
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

