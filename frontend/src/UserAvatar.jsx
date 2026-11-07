import React, { useState, useEffect } from 'react'
import { User } from 'lucide-react'

// Derive 1-2 letter initials from a display name or email
function getInitials(name, email) {
  if (name && typeof name === 'string') {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    if (parts.length === 1 && parts[0].length > 0) {
      return parts[0].slice(0, 2).toUpperCase()
    }
  }
  if (email && typeof email === 'string') {
    const prefix = email.split('@')[0]
    if (prefix) return prefix.slice(0, 2).toUpperCase()
  }
  return null
}

export function UserAvatar({ user, size = 20, fontSize = 9 }) {
  const [imgError, setImgError] = useState(false)

  // Reset error state whenever the user or photoURL changes (e.g. login/switch account)
  useEffect(() => {
    setImgError(false)
  }, [user?.photoURL, user?.uid])

  const photoURL = user?.photoURL
  const displayName = user?.displayName || user?.email || 'Developer'
  const initials = getInitials(user?.displayName, user?.email)

  // If photoURL exists and has not encountered an error, render <img>
  if (photoURL && !imgError) {
    return (
      <img
        src={photoURL}
        alt={displayName}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          border: '1px solid var(--border-medium, #2e2e38)',
          objectFit: 'cover',
          display: 'block',
          flexShrink: 0
        }}
      />
    )
  }

  // Fallback 1: Circular badge with user initials
  if (initials) {
    return (
      <div
        title={displayName}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          background: '#202B36',
          border: '1px solid #6B9BCB',
          color: '#6B9BCB',
          fontSize: `${fontSize}px`,
          fontWeight: 700,
          letterSpacing: '0.5px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
          flexShrink: 0
        }}
      >
        {initials}
      </div>
    )
  }

  // Fallback 2: Generic circular user icon
  return (
    <div
      title={displayName}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: 'var(--bg-surface, #17171c)',
        border: '1px solid var(--border-medium, #2e2e38)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}
    >
      <User size={Math.max(10, size - 8)} color="var(--text-secondary, #9a9aa8)" />
    </div>
  )
}

