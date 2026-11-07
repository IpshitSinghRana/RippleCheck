import React, { useState, useEffect } from 'react'
import {
  Sparkles,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  HardDrive,
  Cpu,
  RefreshCw,
  ArrowRight
} from 'lucide-react'

export function SetupWizardModal({ onComplete }) {
  const [readiness, setReadiness] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pulling, setPulling] = useState(false)
  const [progress, setProgress] = useState({ status: '', percent: 0 })
  const [error, setError] = useState('')

  const checkStatus = async () => {
    setLoading(true)
    setError('')
    try {
      if (window.electronAPI && typeof window.electronAPI.checkSystemReadiness === 'function') {
        const res = await window.electronAPI.checkSystemReadiness()
        setReadiness(res)
        if (res.isFullyReady) {
          onComplete()
        }
      } else {
        // Not in desktop or mock
        onComplete()
      }
    } catch (err) {
      setError(err.message || 'Failed to check system requirements.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkStatus()

    if (window.electronAPI && typeof window.electronAPI.onModelProgress === 'function') {
      const unsub = window.electronAPI.onModelProgress((p) => {
        setProgress(p)
        if (p.status === 'success') {
          setPulling(false)
          checkStatus()
        }
      })
      return () => unsub()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStartOllama = async () => {
    setLoading(true)
    try {
      await window.electronAPI.startOllama()
      await checkStatus()
    } catch (err) {
      setError(err.message || 'Could not start Ollama service.')
      setLoading(false)
    }
  }

  const handleDownloadModel = async () => {
    setPulling(true)
    setError('')
    setProgress({ status: 'Initiating download...', percent: 0 })
    try {
      await window.electronAPI.pullModel('qwen2.5-coder:3b')
      await checkStatus()
    } catch (err) {
      setError(err.message || 'Failed to download AI model. Please check your connection and retry.')
      setPulling(false)
    }
  }

  if (loading && !readiness) {
    return (
      <div style={backdropStyle}>
        <div style={modalStyle}>
          <Loader2 size={24} className="spin" color="#ededf0" />
          <div style={{ fontSize: '13px', color: '#9a9aa8', marginTop: '12px' }}>
            Checking desktop environment & AI runtime...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={backdropStyle}>
      <div style={modalStyle}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={iconBadgeStyle}>
            <Sparkles size={22} color="#ededf0" />
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '8px 0 4px', color: '#ededf0' }}>
            RippleCheck Desktop Setup
          </h2>
          <p style={{ fontSize: '12px', color: '#9a9aa8', margin: 0 }}>
            Configuring 100% offline, private AI code intelligence.
          </p>
        </div>

        {/* Steps List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Step 1: Ollama Service */}
          <div style={stepCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Cpu size={16} color={readiness?.ollamaRunning ? '#22c55e' : '#eab308'} />
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#ededf0' }}>Local AI Runtime (Ollama)</div>
                <div style={{ fontSize: '11px', color: '#646473' }}>
                  {readiness?.ollamaRunning
                    ? 'Service active on 127.0.0.1:11434'
                    : readiness?.ollamaInstalled
                    ? 'Installed but service is stopped'
                    : 'Ollama not detected'}
                </div>
              </div>
            </div>
            {readiness?.ollamaRunning ? (
              <CheckCircle2 size={16} color="#22c55e" />
            ) : readiness?.ollamaInstalled ? (
              <button type="button" onClick={handleStartOllama} style={actionBtnStyle}>
                Start Service
              </button>
            ) : (
              <span style={{ fontSize: '11px', color: '#f87171' }}>Requires Ollama</span>
            )}
          </div>

          {/* Step 2: Model Setup */}
          <div style={stepCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <HardDrive size={16} color={readiness?.modelReady ? '#22c55e' : '#38bdf8'} />
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#ededf0' }}>
                  Code Intelligence Model (qwen2.5-coder:3b)
                </div>
                <div style={{ fontSize: '11px', color: '#646473' }}>
                  {readiness?.modelReady
                    ? 'Installed & ready for offline code analysis'
                    : pulling
                    ? `${progress.status || 'Downloading...'} (${progress.percent}%)`
                    : '1.9 GB download required for offline mode'}
                </div>
              </div>
            </div>
            {readiness?.modelReady ? (
              <CheckCircle2 size={16} color="#22c55e" />
            ) : pulling ? (
              <Loader2 size={16} className="spin" color="#38bdf8" />
            ) : (
              <button
                type="button"
                onClick={handleDownloadModel}
                disabled={!readiness?.ollamaRunning || pulling}
                style={{
                  ...actionBtnStyle,
                  opacity: !readiness?.ollamaRunning ? 0.5 : 1,
                  cursor: !readiness?.ollamaRunning ? 'not-allowed' : 'pointer'
                }}
              >
                <Download size={13} style={{ marginRight: '4px' }} />
                Download Model
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar (if pulling) */}
        {pulling && (
          <div style={{ marginTop: '14px' }}>
            <div style={progressBarContainerStyle}>
              <div style={{ ...progressBarFillStyle, width: `${progress.percent}%` }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#646473', marginTop: '4px' }}>
              <span>{progress.status}</span>
              <span>{progress.percent}%</span>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div style={errorBannerStyle}>
            <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '11px', color: '#fca5a5' }}>{error}</div>
          </div>
        )}

        {/* Footer Actions */}
        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" onClick={checkStatus} style={secondaryBtnStyle}>
            <RefreshCw size={12} style={{ marginRight: '4px' }} />
            Refresh
          </button>
          <button
            type="button"
            onClick={onComplete}
            disabled={!readiness?.isFullyReady}
            style={{
              ...primaryBtnStyle,
              opacity: !readiness?.isFullyReady ? 0.5 : 1,
              cursor: !readiness?.isFullyReady ? 'not-allowed' : 'pointer'
            }}
          >
            Launch Workspace
            <ArrowRight size={13} style={{ marginLeft: '4px' }} />
          </button>
        </div>
      </div>
    </div>
  )
}

const backdropStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100vh',
  background: 'rgba(0, 0, 0, 0.75)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  fontFamily: 'var(--font-sans)'
}

const modalStyle = {
  width: '100%',
  maxWidth: '480px',
  background: 'var(--bg-secondary, #111114)',
  border: '1px solid var(--border-medium, #2e2e38)',
  borderRadius: '8px',
  padding: '28px 24px',
  boxShadow: '0 16px 40px rgba(0, 0, 0, 0.8)'
}

const iconBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '42px',
  height: '42px',
  borderRadius: '8px',
  background: '#17171c',
  border: '1px solid var(--border-medium, #2e2e38)'
}

const stepCardStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 14px',
  background: '#17171c',
  border: '1px solid var(--border-subtle, #23232b)',
  borderRadius: '6px'
}

const actionBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  background: '#23232b',
  border: '1px solid #383845',
  color: '#ededf0',
  borderRadius: '4px',
  padding: '5px 10px',
  fontSize: '11px',
  fontWeight: 600
}

const primaryBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  background: '#ededf0',
  border: 'none',
  color: '#0a0a0c',
  borderRadius: '5px',
  padding: '8px 14px',
  fontSize: '12px',
  fontWeight: 600
}

const secondaryBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  background: 'transparent',
  border: '1px solid #2e2e38',
  color: '#9a9aa8',
  borderRadius: '5px',
  padding: '8px 12px',
  fontSize: '12px'
}

const progressBarContainerStyle = {
  width: '100%',
  height: '6px',
  background: '#1f1f26',
  borderRadius: '3px',
  overflow: 'hidden'
}

const progressBarFillStyle = {
  height: '100%',
  background: '#38bdf8',
  transition: 'width 0.2s ease'
}

const errorBannerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 12px',
  marginTop: '12px',
  background: 'rgba(239, 68, 68, 0.08)',
  border: '1px solid rgba(239, 68, 68, 0.25)',
  borderRadius: '5px'
}

