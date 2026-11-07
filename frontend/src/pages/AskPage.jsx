import React, { useState, useEffect } from 'react'
import {
  Send,
  Terminal,
  RefreshCw,
  Sparkles,
  AlertCircle,
  HelpCircle,
  Code2,
  Database,
  ArrowRight,
  Clock,
  Trash2,
  FileCode,
  Cpu,
  Globe,
  CheckCircle2
} from 'lucide-react'
import { QueryResultTable } from '../components/QueryResultTable'
import { apiUrl } from '../apiConfig'

export function AskPage({
  activeProjectId,
  idToken,
  getIdToken,
  handleSelectFile,
  setActiveTab
}) {
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [providerInfo, setProviderInfo] = useState({
    provider: 'ollama',
    mode: 'offline',
    model: 'qwen2.5-coder:3b',
    status: 'connected',
    statusMessage: 'Loading status...'
  })
  const [switchingProvider, setSwitchingProvider] = useState(false)

  // Fetch AI provider status
  const fetchProviderStatus = async () => {
    try {
      const res = await fetch(apiUrl('/ai/provider'))
      if (res.ok) {
        const data = await res.json()
        setProviderInfo(data)
      }
    } catch (err) {
      console.warn('Failed to fetch AI provider status:', err)
    }
  }

  useEffect(() => {
    fetchProviderStatus()
  }, [])

  const handleProviderChange = async (targetProvider) => {
    if (switchingProvider || providerInfo.provider === targetProvider) return
    setSwitchingProvider(true)
    try {
      const res = await fetch(apiUrl('/ai/provider'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: targetProvider })
      })
      if (res.ok) {
        const data = await res.json()
        setProviderInfo(data)
      }
    } catch (err) {
      console.error('Failed to change AI provider:', err)
    } finally {
      setSwitchingProvider(false)
    }
  }
  const [history, setHistory] = useState([
    {
      id: 'default-welcome',
      question: 'Which files in this repository have the highest number of dependent modules?',
      response: {
        intent: 'cypher_query',
        cypher: `MATCH (target:File {projectId: "${activeProjectId}"})<-[:IMPORTS]-(importer:File {projectId: "${activeProjectId}"})\nRETURN target.name AS name, target.path AS path, count(importer) AS importersCount\nORDER BY importersCount DESC\nLIMIT 5`,
        message: 'Here are the top most depended-upon files across the repository.'
      },
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ])

  // Suggested starter queries
  const suggestedQuestions = [
    'Which files does authService.js import?',
    'Which files directly depend on database.js?',
    'What files could be affected if config.js changes?',
    'Are there any circular dependencies in the repository?',
    'Which modules have the highest blast radius?'
  ]

  const handleSubmit = async (qText) => {
    const textToQuery = (qText || question).trim()
    if (!textToQuery || loading) return

    setLoading(true)
    const queryTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    try {
      const headers = { 'Content-Type': 'application/json' }
      const token = typeof getIdToken === 'function' ? await getIdToken() : idToken
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      const res = await fetch(apiUrl('/query'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          question: textToQuery,
          projectId: activeProjectId
        })
      })
      const data = await res.json()

      const newEntry = {
        id: 'msg-' + Date.now(),
        question: textToQuery,
        response: data,
        timestamp: queryTime
      }

      setHistory((prev) => [newEntry, ...prev])
      setQuestion('')
    } catch (err) {
      setHistory((prev) => [
        {
          id: 'err-' + Date.now(),
          question: textToQuery,
          response: { error: err.message || 'Failed to query the repository.' },
          timestamp: queryTime
        },
        ...prev
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, position: 'relative' }}>
      {/* 1. Page Header Bar */}
      <div
        style={{
          height: '42px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          zIndex: 5
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h1
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: '#ededf0',
              margin: 0,
              letterSpacing: '0.4px',
              textTransform: 'uppercase'
            }}
          >
            Ask Repository AI
          </h1>
          <span
            style={{
              fontSize: '10px',
              color: 'var(--text-muted)',
              borderLeft: '1px solid var(--border-medium)',
              paddingLeft: '8px'
            }}
          >
            {activeProjectId}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* AI Provider Selector: Offline vs Online */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '5px',
              padding: '2px',
              gap: '2px'
            }}
          >
            <button
              onClick={() => handleProviderChange('ollama')}
              disabled={switchingProvider}
              title="Offline local inference via Ollama (qwen2.5-coder:3b)"
              style={{
                background: providerInfo.provider === 'ollama' ? '#2e2e38' : 'transparent',
                color: providerInfo.provider === 'ollama' ? '#ededf0' : 'var(--text-muted)',
                border: 'none',
                borderRadius: '3px',
                padding: '3px 8px',
                fontSize: '11px',
                fontWeight: providerInfo.provider === 'ollama' ? 600 : 400,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s ease'
              }}
            >
              <Cpu size={12} color={providerInfo.provider === 'ollama' ? '#38bdf8' : 'currentColor'} />
              Offline (Ollama)
            </button>

            <button
              onClick={() => handleProviderChange('gemini')}
              disabled={switchingProvider}
              title="Online cloud inference via Google Gemini (gemini-2.5-flash)"
              style={{
                background: providerInfo.provider === 'gemini' ? '#2e2e38' : 'transparent',
                color: providerInfo.provider === 'gemini' ? '#ededf0' : 'var(--text-muted)',
                border: 'none',
                borderRadius: '3px',
                padding: '3px 8px',
                fontSize: '11px',
                fontWeight: providerInfo.provider === 'gemini' ? 600 : 400,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s ease'
              }}
            >
              <Globe size={12} color={providerInfo.provider === 'gemini' ? '#34d399' : 'currentColor'} />
              Online (Gemini)
            </button>
          </div>

          {/* Provider status indicator pill */}
          <div
            title={`Active: ${providerInfo.provider} (${providerInfo.model || 'model'}) - ${providerInfo.statusMessage || ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '10px',
              padding: '3px 7px',
              borderRadius: '4px',
              background: providerInfo.status === 'connected' ? 'rgba(52, 211, 153, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${providerInfo.status === 'connected' ? 'rgba(52, 211, 153, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              color: providerInfo.status === 'connected' ? '#34d399' : '#f87171'
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: providerInfo.status === 'connected' ? '#34d399' : '#f87171'
              }}
            />
            <span>{providerInfo.provider === 'ollama' ? 'Ollama' : 'Gemini'}</span>
            <span style={{ color: 'var(--text-muted)' }}>• {providerInfo.model}</span>
          </div>

          {history.length > 0 && (
            <button
              onClick={() => setHistory([])}
              title="Clear conversation history"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <Trash2 size={12} />
              Clear History
            </button>
          )}
        </div>
      </div>

      {/* 2. Main Two-Column Layout */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        {/* Left Sidebar: Suggested Questions & Guide */}
        <aside
          style={{
            width: '280px',
            minWidth: '240px',
            background: 'var(--bg-secondary)',
            borderRight: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 5,
            padding: '16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#ededf0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
            <Sparkles size={13} color="#60a5fa" />
            Suggested Questions
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto' }}>
            {suggestedQuestions.map((sq, i) => (
              <button
                key={i}
                onClick={() => {
                  setQuestion(sq)
                  handleSubmit(sq)
                }}
                disabled={loading}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '5px',
                  padding: '9px 12px',
                  textAlign: 'left',
                  color: 'var(--text-secondary)',
                  fontSize: '11px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  lineHeight: 1.4,
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.background = 'var(--bg-elevated)'
                    e.currentTarget.style.borderColor = '#60a5fa'
                    e.currentTarget.style.color = '#ededf0'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.background = 'var(--bg-surface)'
                    e.currentTarget.style.borderColor = 'var(--border-subtle)'
                    e.currentTarget.style.color = 'var(--text-secondary)'
                  }
                }}
              >
                {sq}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)', fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            RippleCheck translates your questions into read-only Neo4j Cypher queries scoped to <code style={{ color: '#93c5fd' }}>{activeProjectId}</code>.
          </div>
        </aside>

        {/* Right Main Panel: Conversation History & Query Input */}
        <main
          style={{
            flex: 1,
            background: 'var(--bg-primary)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0
          }}
        >
          {/* Conversation Stream */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}
          >
            {history.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)', textAlign: 'center', gap: '8px' }}>
                <HelpCircle size={32} strokeWidth={1.5} color="var(--border-medium)" />
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#ededf0' }}>No Queries Yet</div>
                <div style={{ fontSize: '11px' }}>Ask a question about the repository or click a suggested prompt from the left.</div>
              </div>
            ) : (
              history.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    maxWidth: '860px',
                    width: '100%'
                  }}
                >
                  {/* User Question */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '50%',
                        background: '#1f1f26',
                        border: '1px solid var(--border-medium)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        color: '#ededf0',
                        fontWeight: 700,
                        flexShrink: 0
                      }}
                    >
                      Q
                    </div>
                    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '10px 14px', flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#ededf0' }}>{item.question}</span>
                        <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{item.timestamp}</span>
                      </div>
                    </div>
                  </div>

                  {/* AI Response Card */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', paddingLeft: '36px' }}>
                    <div
                      style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        padding: '14px',
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                      }}
                    >
                      {item.response.error ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '4px', color: '#f87171', fontSize: '11px' }}>
                          <AlertCircle size={14} color="#f87171" style={{ flexShrink: 0 }} />
                          <span>{item.response.error}</span>
                        </div>
                      ) : (
                        <>
                          {/* Narrative / Message */}
                          {item.response.message && (
                            <div style={{ fontSize: '12px', color: '#ededf0', lineHeight: 1.5 }}>
                              {item.response.message}
                            </div>
                          )}

                          {/* Generated Cypher Query Preview */}
                          {item.response.cypher && (
                            <div style={{ background: '#09090d', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '8px 10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                                <Terminal size={11} color="#60a5fa" />
                                Generated Cypher Query
                              </div>
                              <pre
                                style={{
                                  margin: 0,
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: '11px',
                                  color: '#93c5fd',
                                  overflowX: 'auto',
                                  lineHeight: 1.4
                                }}
                              >
                                {item.response.cypher}
                              </pre>
                            </div>
                          )}

                          {/* Dynamic Query Results Table */}
                          {item.response.results && item.response.results.length > 0 && (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                  Query Results ({item.response.results.length})
                                </span>
                              </div>
                              <QueryResultTable
                                results={item.response.results}
                                onSelectFile={(filePath) => {
                                  if (handleSelectFile) handleSelectFile(filePath)
                                  if (setActiveTab) setActiveTab('Workspace')
                                }}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Bottom Prompt Input Bar */}
          <div
            style={{
              padding: '12px 16px',
              background: 'var(--bg-secondary)',
              borderTop: '1px solid var(--border-subtle)'
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSubmit()
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                maxWidth: '860px',
                margin: '0 auto'
              }}
            >
              <input
                type="text"
                placeholder="Ask about dependencies, imports, or blast radius in plain English..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                disabled={loading}
                style={{
                  flex: 1,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '5px',
                  padding: '8px 12px',
                  color: '#ededf0',
                  fontSize: '12px',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                disabled={!question.trim() || loading}
                style={{
                  background: question.trim() && !loading ? '#2e2e38' : 'transparent',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '5px',
                  padding: '8px 14px',
                  color: question.trim() && !loading ? '#ededf0' : 'var(--text-muted)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: question.trim() && !loading ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                {loading ? <RefreshCw size={12} className="spin" /> : <Send size={12} />}
                Ask
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  )
}

