import React, { useState, useRef, useEffect } from 'react'
import {
  GitBranch,
  Upload,
  FileArchive,
  FolderGit2,
  Trash2,
  ArrowRight,
  LogOut,
  Calendar,
  Layers,
  FileCode,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  Play,
  MonitorDown
} from 'lucide-react'
import { useAuth } from './AuthContext'
import { UserAvatar } from './UserAvatar'
import { apiUrl } from './apiConfig'

// Safe helper to parse JSON responses from fetch
async function parseJsonResponse(res) {
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return await res.json()
  }
  const text = await res.text()
  if (res.status === 401) {
    throw new Error('Authentication required (401): Session may have expired. Please sign in again.')
  }
  if (res.status === 403) {
    throw new Error('Permission denied (403): You do not have access to this project.')
  }
  if (res.status === 413) {
    throw new Error('Upload rejected: File size exceeds the allowed limit.')
  }
  if (res.status >= 500) {
    throw new Error(`Server error (${res.status}): ${text.slice(0, 150) || res.statusText}`)
  }
  throw new Error(`Unexpected server response (${res.status} ${res.statusText}): ${text.slice(0, 150)}`)
}

// Helper to format byte sizes cleanly
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export function Dashboard({ onOpenWorkspace }) {
  const { user, idToken, signOut } = useAuth()
  const fileInputRef = useRef(null)

  // Upload drag & selection state
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploadError, setUploadError] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState('')

  // Processing state
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisStatus, setAnalysisStatus] = useState('')
  const [loadingProjects, setLoadingProjects] = useState(true)

  // Backend-persisted project list
  const [projects, setProjects] = useState([
    {
      id: 'sample-repo',
      name: 'sample-repo',
      path: 'data/sample-repo',
      fileCount: 6,
      dependencyCount: 5,
      lastScanned: 'Sample workspace',
      isDefault: true
    }
  ])

  // Helper to obtain a guaranteed fresh Firebase ID token
  const getFreshToken = async () => {
    if (user && typeof user.getIdToken === 'function') {
      try {
        return await user.getIdToken()
      } catch (err) {
        console.warn('[RippleCheck] Failed to refresh user token:', err)
      }
    }
    return idToken
  }

  // Fetch projects from backend GET /api/projects
  const fetchProjects = async () => {
    try {
      setLoadingProjects(true)
      const token = await getFreshToken()
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      let res
      try {
        res = await fetch(apiUrl('/projects'), { headers })
      } catch (fetchErr) {
        if (fetchErr.name === 'TypeError' || (fetchErr.message && fetchErr.message.toLowerCase().includes('fetch'))) {
          throw new Error('Connection failed: Backend API server unreachable on http://localhost:3000.')
        }
        throw fetchErr
      }
      if (res.ok) {
        const data = await parseJsonResponse(res)
        if (Array.isArray(data.projects)) {
          setProjects(
            data.projects.map((p) => ({
              id: p.projectId || p.id,
              name: p.projectName || p.name,
              path: p.originalZipName ? `archive/${p.originalZipName}` : 'data/sample-repo',
              fileCount: p.fileCount,
              dependencyCount: p.dependencyCount,
              lastScanned: p.lastScannedAt ? new Date(p.lastScannedAt).toLocaleDateString() : 'Active',
              isDefault: p.projectId === 'sample-repo'
            }))
          )
        }
      } else {
        const errData = await parseJsonResponse(res).catch(() => ({ error: `Status ${res.status}` }))
        setUploadError(errData.error || `Failed to fetch projects (HTTP ${res.status})`)
      }
    } catch (err) {
      console.warn('Failed to load projects from backend:', err)
      setUploadError(err.message || 'Failed to connect to projects service.')
    } finally {
      setLoadingProjects(false)
    }
  }

  useEffect(() => {
    fetchProjects()
  }, [idToken])

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    setUploadError('')
    setUploadSuccess('')

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      validateAndSetFile(files[0])
    }
  }

  const handleFileInputChange = (e) => {
    setUploadError('')
    setUploadSuccess('')
    const files = e.target.files
    if (files && files.length > 0) {
      validateAndSetFile(files[0])
    }
  }

  const validateAndSetFile = (file) => {
    const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed'
    if (!isZip) {
      setUploadError('Invalid file type. Please upload a standard .zip archive only.')
      setSelectedFile(null)
      return
    }

    if (file.size > 100 * 1024 * 1024) {
      setUploadError('Oversized archive. Maximum allowed compressed file size is 100 MB.')
      setSelectedFile(null)
      return
    }

    setSelectedFile(file)
  }

  const handleRemoveSelectedFile = () => {
    setSelectedFile(null)
    setUploadError('')
    setUploadSuccess('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDeleteProject = async (projectId, e) => {
    e.stopPropagation()
    if (projectId === 'sample-repo') return

    try {
      const token = await getFreshToken()
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      let res
      try {
        res = await fetch(apiUrl(`/projects/${encodeURIComponent(projectId)}`), {
          method: 'DELETE',
          headers
        })
      } catch (fetchErr) {
        if (fetchErr.name === 'TypeError' || (fetchErr.message && fetchErr.message.toLowerCase().includes('fetch'))) {
          throw new Error('Connection failed: Backend API server unreachable on http://localhost:3000.')
        }
        throw fetchErr
      }
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== projectId))
      } else {
        const data = await parseJsonResponse(res)
        setUploadError(data.error || 'Failed to delete project.')
      }
    } catch (err) {
      setUploadError(err.message || 'Error occurred while deleting project.')
    }
  }

  // Handle actual backend upload and analysis
  const handleAnalyzeRepository = async () => {
    if (!selectedFile || isAnalyzing) return

    setUploadError('')
    setUploadSuccess('')
    setIsAnalyzing(true)
    setAnalysisStatus('Preparing archive...')

    try {
      // 1. Ensure fresh authentication token
      const token = await getFreshToken()
      if (!token) {
        throw new Error('Authentication required: Please sign in with your Google account before uploading repositories.')
      }

      const formData = new FormData()
      formData.append('file', selectedFile)

      setAnalysisStatus('Uploading archive & analyzing AST dependencies...')

      let res
      try {
        res = await fetch(apiUrl('/projects/upload'), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: formData
        })
      } catch (fetchErr) {
        if (fetchErr.name === 'TypeError' || (fetchErr.message && fetchErr.message.toLowerCase().includes('fetch'))) {
          throw new Error('Connection failed: Unable to reach the RippleCheck API server at /api/projects/upload. Please ensure the backend server is running on http://localhost:3000 and network connection is active.')
        }
        throw fetchErr
      }

      const data = await parseJsonResponse(res)

      if (!res.ok) {
        throw new Error(data.error || `Server returned ${res.status}: ${res.statusText}`)
      }

      const newProject = {
        id: data.project.id,
        name: data.project.name,
        path: `archive/${data.project.originalName}`,
        fileCount: data.project.fileCount,
        dependencyCount: data.project.dependencyCount,
        lastScanned: 'Just now',
        isDefault: false
      }

      setProjects((prev) => [newProject, ...prev])
      setUploadSuccess(`Repository analyzed successfully! Created project "${data.project.name}" with ${data.project.fileCount} files.`)
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setUploadError(err.message || 'An error occurred during repository analysis.')
    } finally {
      setIsAnalyzing(false)
      setAnalysisStatus('')
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
        overflowY: 'auto'
      }}
    >
      {/* 1. Header */}
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
            Dashboard
          </span>
        </div>

        {/* Authenticated user profile and working logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserAvatar user={user} size={24} fontSize={10} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#ededf0' }}>
              {user?.displayName || user?.email || 'Developer'}
            </span>
          </div>

          <button
            onClick={signOut}
            title="Log Out"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'transparent',
              border: '1px solid var(--border-subtle, #23232b)',
              borderRadius: '4px',
              padding: '4px 10px',
              color: 'var(--text-secondary, #9a9aa8)',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ef4444'
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-secondary, #9a9aa8)'
              e.currentTarget.style.borderColor = 'var(--border-subtle, #23232b)'
            }}
          >
            <LogOut size={12} />
            Log Out
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main
        style={{
          flex: 1,
          maxWidth: '1040px',
          width: '100%',
          margin: '0 auto',
          padding: '36px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '32px'
        }}
      >
        {/* 2. Welcome Section */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1
              style={{
                fontSize: '22px',
                fontWeight: 700,
                margin: '0 0 6px 0',
                letterSpacing: '-0.3px',
                color: '#ededf0'
              }}
            >
              Your Projects
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary, #9a9aa8)', margin: 0, lineHeight: 1.5 }}>
              Analyze dependencies and understand the impact of code changes.
            </p>
          </div>

          {/* Desktop Edition Banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px',
              padding: '8px 14px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-subtle, #23232b)',
              fontSize: '11px',
              color: 'var(--text-secondary, #9a9aa8)',
              maxWidth: '460px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MonitorDown size={14} color="#818cf8" />
              <div>
                <span style={{ fontWeight: 600, color: '#ededf0' }}>RippleCheck Desktop v1.0.0 is now available.</span>{' '}
                <span>Run dependency analysis locally with embedded graph storage and local AI.</span>
              </div>
            </div>
            <a
              href="https://github.com/IpshitSinghRana/RippleCheck/releases/tag/v1.0.0"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#ededf0',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid var(--border-medium, #2e2e38)',
                padding: '4px 10px',
                borderRadius: '4px',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'
                e.currentTarget.style.borderColor = 'var(--border-medium, #2e2e38)'
              }}
            >
              Get Offline App
            </a>
          </div>
        </div>

        {/* 3. Upload Section */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isAnalyzing && fileInputRef.current?.click()}
            style={{
              background: isDragging ? 'var(--bg-elevated, #1f1f26)' : 'var(--bg-secondary, #111114)',
              border: isDragging
                ? '2px dashed #ededf0'
                : '1.5px dashed var(--border-medium, #2e2e38)',
              borderRadius: '8px',
              padding: '36px 20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              cursor: isAnalyzing ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
              opacity: isAnalyzing ? 0.7 : 1
            }}
            onMouseEnter={(e) => {
              if (!isDragging && !isAnalyzing) e.currentTarget.style.borderColor = 'var(--border-active, #454554)'
            }}
            onMouseLeave={(e) => {
              if (!isDragging && !isAnalyzing) e.currentTarget.style.borderColor = 'var(--border-medium, #2e2e38)'
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept=".zip,application/zip,application/x-zip-compressed"
              style={{ display: 'none' }}
              onChange={handleFileInputChange}
              disabled={isAnalyzing}
            />

            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '8px',
                background: 'var(--bg-surface, #17171c)',
                border: '1px solid var(--border-medium, #2e2e38)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {isAnalyzing ? (
                <Loader2 size={20} color="#ededf0" className="spin" />
              ) : (
                <Upload size={20} color="#ededf0" />
              )}
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#ededf0', marginBottom: '3px' }}>
                {isAnalyzing ? 'Analyzing repository codebase...' : 'Drag and drop your project repository here'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary, #9a9aa8)' }}>
                Supports codebase archives in <span style={{ fontFamily: 'var(--font-mono)', color: '#ededf0' }}>.zip</span> format (up to 100 MB)
              </div>
            </div>

            <button
              type="button"
              disabled={isAnalyzing}
              onClick={(e) => {
                e.stopPropagation()
                fileInputRef.current?.click()
              }}
              style={{
                background: 'var(--bg-surface, #17171c)',
                border: '1px solid var(--border-medium, #2e2e38)',
                borderRadius: '5px',
                padding: '6px 14px',
                color: '#ededf0',
                fontSize: '11px',
                fontWeight: 600,
                cursor: isAnalyzing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (!isAnalyzing) {
                  e.currentTarget.style.background = 'var(--bg-elevated, #1f1f26)'
                  e.currentTarget.style.borderColor = 'var(--border-active, #454554)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isAnalyzing) {
                  e.currentTarget.style.background = 'var(--bg-surface, #17171c)'
                  e.currentTarget.style.borderColor = 'var(--border-medium, #2e2e38)'
                }
              }}
            >
              <FileArchive size={13} />
              Browse ZIP
            </button>
          </div>

          {/* Validation Error Message */}
          {uploadError && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '5px',
                fontSize: '11px',
                color: '#fca5a5'
              }}
            >
              <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0 }} />
              <div>{uploadError}</div>
            </div>
          )}

          {/* Success Message */}
          {uploadSuccess && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                background: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '5px',
                fontSize: '11px',
                color: '#86efac'
              }}
            >
              <CheckCircle2 size={14} color="#22c55e" style={{ flexShrink: 0 }} />
              <div>{uploadSuccess}</div>
            </div>
          )}

          {/* Selected File Details Bar + Explicit "Analyse Repository" Button */}
          {selectedFile && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                background: 'var(--bg-secondary, #111114)',
                border: '1px solid var(--border-medium, #2e2e38)',
                borderRadius: '6px',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                <FileArchive size={16} color="#ededf0" style={{ flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#ededf0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedFile.name}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted, #646473)', fontFamily: 'var(--font-mono)' }}>
                    {formatBytes(selectedFile.size)} • Ready for analysis
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={handleAnalyzeRepository}
                  disabled={isAnalyzing}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#ededf0',
                    color: '#0a0a0c',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '6px 14px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: isAnalyzing ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!isAnalyzing) e.currentTarget.style.background = '#ffffff'
                  }}
                  onMouseLeave={(e) => {
                    if (!isAnalyzing) e.currentTarget.style.background = '#ededf0'
                  }}
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 size={12} className="spin" />
                      {analysisStatus || 'Analyzing...'}
                    </>
                  ) : (
                    <>
                      <Play size={11} fill="#0a0a0c" />
                      Analyse Repository
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={isAnalyzing}
                  onClick={handleRemoveSelectedFile}
                  title="Remove selected archive"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted, #646473)',
                    cursor: isAnalyzing ? 'not-allowed' : 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#ededf0')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted, #646473)')}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}
        </section>

        {/* 4. Recent Projects Section */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.2px', color: '#ededf0', margin: 0 }}>
              Recent Projects ({projects.length})
            </h2>
          </div>

          {/* 5. Empty State or Projects List */}
          {projects.length === 0 ? (
            <div
              style={{
                background: 'var(--bg-secondary, #111114)',
                border: '1px solid var(--border-subtle, #23232b)',
                borderRadius: '8px',
                padding: '48px 24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                gap: '12px'
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '8px',
                  background: 'var(--bg-surface, #17171c)',
                  border: '1px solid var(--border-medium, #2e2e38)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <FolderGit2 size={20} color="var(--text-muted, #646473)" />
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#ededf0', marginBottom: '4px' }}>
                  No repositories analyzed yet
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary, #9a9aa8)', maxWidth: '340px', lineHeight: 1.5 }}>
                  Drop your first project repository ZIP above to map dependency trees and inspect potential code changes.
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {projects.map((project) => (
                <div
                  key={project.id}
                  style={{
                    background: 'var(--bg-secondary, #111114)',
                    border: '1px solid var(--border-subtle, #23232b)',
                    borderRadius: '6px',
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    transition: 'border-color 0.15s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border-medium, #2e2e38)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle, #23232b)')}
                >
                  {/* Left: Project Identity & Path */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '5px',
                        background: 'var(--bg-surface, #17171c)',
                        border: '1px solid var(--border-medium, #2e2e38)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      <FolderGit2 size={16} color="#ededf0" />
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#ededf0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {project.name}
                        </span>
                        {project.isDefault && (
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              background: 'var(--bg-surface, #17171c)',
                              border: '1px solid var(--border-medium, #2e2e38)',
                              color: 'var(--text-secondary, #9a9aa8)'
                            }}
                          >
                            Sample Workspace
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted, #646473)', fontFamily: 'var(--font-mono)' }}>
                        {project.path}
                      </div>
                    </div>
                  </div>

                  {/* Middle / Right: Stats & Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexShrink: 0 }}>
                    {/* Metrics */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '11px', color: 'var(--text-secondary, #9a9aa8)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <FileCode size={12} color="var(--text-muted, #646473)" />
                        <span><strong style={{ color: '#ededf0' }}>{project.fileCount}</strong> files</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Layers size={12} color="var(--text-muted, #646473)" />
                        <span><strong style={{ color: '#ededf0' }}>{project.dependencyCount}</strong> dependencies</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Calendar size={12} color="var(--text-muted, #646473)" />
                        <span>{project.lastScanned}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => onOpenWorkspace(project.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: '#ededf0',
                          color: '#0a0a0c',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '6px 12px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#ffffff')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#ededf0')}
                      >
                        Open Workspace
                        <ArrowRight size={12} />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleDeleteProject(project.id, e)}
                        title="Delete project from list"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '28px',
                          height: '28px',
                          background: 'transparent',
                          border: '1px solid var(--border-subtle, #23232b)',
                          borderRadius: '4px',
                          color: 'var(--text-muted, #646473)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#ef4444'
                          e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = 'var(--text-muted, #646473)'
                          e.currentTarget.style.borderColor = 'var(--border-subtle, #23232b)'
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
