import React, { useState, useMemo } from 'react'
import {
  ShieldAlert,
  Trash2,
  Edit3,
  RefreshCw,
  Search,
  FileCode,
  ArrowRight,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  Info
} from 'lucide-react'
import { ProjectExplorer } from '../ProjectExplorer'

export function ImpactPage({
  activeProjectId,
  rawGraph,
  filteredFiles,
  searchQuery,
  setSearchQuery,
  selectedFile,
  handleSelectFile,
  impactData,
  loadingImpact,
  analysisMode,
  setAnalysisMode,
  normalizedAffectedFiles,
  directImporters,
  transitiveDependents,
  expandedPathFiles,
  toggleExpand,
  activeHighlightedPath,
  handleHighlightPath
}) {
  // Local simulation mode tab: 'modify' | 'delete' | 'rename'
  const [simulationMode, setSimulationMode] = useState('modify') // 'modify' | 'delete' | 'rename'
  const [renameNewName, setRenameNewName] = useState('')

  // Sync simulationMode to analysisMode if modify or delete
  const handleSwitchMode = (mode) => {
    setSimulationMode(mode)
    if (mode === 'modify' || mode === 'delete') {
      setAnalysisMode(mode)
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
            Change Impact Analysis
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

        {selectedFile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-secondary)' }}>
            <span>Target:</span>
            <span style={{ color: '#6B9BCB', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{selectedFile.name}</span>
          </div>
        )}
      </div>

      {/* 2. Main Two-Column Interface */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        {/* Left Sidebar: File Selection & Search */}
        <aside
          style={{
            width: '280px',
            minWidth: '240px',
            background: 'var(--bg-secondary)',
            borderRight: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 5
          }}
        >
          {/* File Search */}
          <div style={{ padding: '12px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={13}
                style={{
                  position: 'absolute',
                  left: '8px',
                  top: '8px',
                  color: searchQuery.trim() ? '#38bdf8' : 'var(--text-muted)'
                }}
              />
              <input
                type="text"
                placeholder="Search file to test impact..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-surface)',
                  border: '1px solid ' + (searchQuery.trim() ? '#38bdf8' : 'var(--border-subtle)'),
                  borderRadius: '4px',
                  padding: '6px 24px 6px 26px',
                  color: 'var(--text-primary)',
                  fontSize: '11px',
                  outline: 'none',
                  transition: 'border-color 0.15s ease'
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  title="Clear search"
                  style={{
                    position: 'absolute',
                    right: '6px',
                    top: '5px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '2px'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#ededf0')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Project Explorer Tree */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            <div
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '6px',
                paddingLeft: '4px'
              }}
            >
              Select Target File ({filteredFiles.length})
            </div>
            <ProjectExplorer
              files={filteredFiles}
              selectedFilePath={selectedFile?.path}
              onSelectFile={handleSelectFile}
              isSearching={Boolean(searchQuery.trim())}
            />
          </div>
        </aside>

        {/* Right Main Panel: Impact Simulation & Blast Radius */}
        <main
          style={{
            flex: 1,
            background: 'var(--bg-primary)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {selectedFile ? (
            <div style={{ maxWidth: '960px', width: '100%', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Target File Overview Card */}
              <div
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '16px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '4px',
                        background: '#202B36',
                        border: '1px solid #6B9BCB',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <FileCode size={16} color="#6B9BCB" />
                    </div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#ededf0' }}>{selectedFile.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{selectedFile.path}</div>
                    </div>
                  </div>

                  {/* Quick summary pill */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        background: normalizedAffectedFiles.length > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                        border: `1px solid ${normalizedAffectedFiles.length > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
                        fontSize: '11px',
                        fontWeight: 600,
                        color: normalizedAffectedFiles.length > 0 ? '#f87171' : '#4ade80'
                      }}
                    >
                      {normalizedAffectedFiles.length} Affected Module{normalizedAffectedFiles.length === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>

                {selectedFile.summary && (
                  <div style={{ marginTop: '10px', padding: '8px 10px', background: 'var(--bg-surface)', borderRadius: '4px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {selectedFile.summary}
                  </div>
                )}
              </div>

              {/* Simulation Mode Tabs: Modify, Delete, Rename */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div
                  style={{
                    display: 'flex',
                    background: 'var(--bg-secondary)',
                    padding: '3px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-subtle)',
                    width: 'fit-content'
                  }}
                >
                  <button
                    onClick={() => handleSwitchMode('modify')}
                    style={{
                      padding: '6px 14px',
                      fontSize: '11px',
                      fontWeight: 600,
                      borderRadius: '4px',
                      border: 'none',
                      background: simulationMode === 'modify' ? '#202B36' : 'transparent',
                      color: simulationMode === 'modify' ? '#6B9BCB' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <ShieldAlert size={13} />
                    Modify Simulation
                  </button>

                  <button
                    onClick={() => handleSwitchMode('delete')}
                    style={{
                      padding: '6px 14px',
                      fontSize: '11px',
                      fontWeight: 600,
                      borderRadius: '4px',
                      border: 'none',
                      background: simulationMode === 'delete' ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                      color: simulationMode === 'delete' ? '#ef4444' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Trash2 size={13} />
                    Delete Simulation
                  </button>

                  <button
                    onClick={() => handleSwitchMode('rename')}
                    style={{
                      padding: '6px 14px',
                      fontSize: '11px',
                      fontWeight: 600,
                      borderRadius: '4px',
                      border: 'none',
                      background: simulationMode === 'rename' ? 'rgba(251, 191, 36, 0.15)' : 'transparent',
                      color: simulationMode === 'rename' ? '#fbbf24' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Edit3 size={13} />
                    Rename Simulation
                  </button>
                </div>

                {/* Simulation Description Banner */}
                {simulationMode === 'modify' && (
                  <div
                    style={{
                      background: '#121e28',
                      border: '1px solid rgba(107, 155, 203, 0.3)',
                      borderRadius: '6px',
                      padding: '12px 14px',
                      fontSize: '11px',
                      color: '#cbd5e1',
                      lineHeight: 1.4
                    }}
                  >
                    <strong style={{ color: '#6B9BCB' }}>Modifying {selectedFile.name}:</strong> Predicts breaking API changes or contract modifications propagating to direct callers and downstream transitive dependents.
                  </div>
                )}

                {simulationMode === 'delete' && (
                  <div
                    style={{
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '6px',
                      padding: '12px 14px',
                      fontSize: '11px',
                      color: '#fca5a5',
                      lineHeight: 1.4
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, marginBottom: '2px', color: '#ef4444' }}>
                      <AlertTriangle size={13} />
                      Delete Simulation
                    </div>
                    If <strong>{selectedFile.name}</strong> were deleted, all {directImporters.length} direct importers will immediately fail to resolve dependencies (<code style={{ fontFamily: 'var(--font-mono)' }}>MODULE_NOT_FOUND</code>).
                  </div>
                )}

                {simulationMode === 'rename' && (
                  <div
                    style={{
                      background: 'rgba(251, 191, 36, 0.08)',
                      border: '1px solid rgba(251, 191, 36, 0.3)',
                      borderRadius: '6px',
                      padding: '12px 14px',
                      fontSize: '11px',
                      color: '#fef08a',
                      lineHeight: 1.4,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div>
                      <strong style={{ color: '#fbbf24' }}>Renaming {selectedFile.name}:</strong> All {directImporters.length} direct importers must have their <code style={{ fontFamily: 'var(--font-mono)' }}>import / require</code> path strings updated to the new name.
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="text"
                        placeholder={`e.g. ${selectedFile.name.replace(/\.[^.]+$/, '')}-v2.js`}
                        value={renameNewName}
                        onChange={(e) => setRenameNewName(e.target.value)}
                        style={{
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-medium)',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          color: '#ededf0',
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          width: '260px'
                        }}
                      />
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {directImporters.length} file{directImporters.length === 1 ? '' : 's'} require import path refactoring
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Statistics & Hop Distance Metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Direct Importers (1 Hop)</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#ef4444', marginTop: '2px' }}>{directImporters.length}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>Direct consumers requiring updates</div>
                </div>

                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Transitive Dependents (2+ Hops)</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#fb923c', marginTop: '2px' }}>{transitiveDependents.length}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>Cascade ripple impact</div>
                </div>

                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Max Ripple Distance</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#6B9BCB', marginTop: '2px' }}>
                    {normalizedAffectedFiles.reduce((max, f) => (f.hops > max ? f.hops : max), 0)} <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>hops</span>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>Longest propagation path</div>
                </div>
              </div>

              {/* Affected Files Breakdown List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {loadingImpact ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <RefreshCw size={16} className="spin" style={{ marginBottom: '6px' }} />
                    <div>Analyzing transitive impact paths...</div>
                  </div>
                ) : normalizedAffectedFiles.length === 0 ? (
                  <div
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      padding: '24px',
                      textAlign: 'center',
                      color: 'var(--text-muted)'
                    }}
                  >
                    <CheckCircle2 size={24} color="#22c55e" style={{ margin: '0 auto 8px' }} />
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#ededf0', marginBottom: '4px' }}>
                      Zero Downstream Impact
                    </div>
                    <div style={{ fontSize: '11px' }}>
                      No other files import <strong>{selectedFile.name}</strong>. It can be safely modified, renamed, or deleted without breaking other modules.
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Direct Importers Section */}
                    {directImporters.length > 0 && (
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>Direct Importers — 1 Hop ({directImporters.length})</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Immediate Breakage</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {directImporters.map((aff) => {
                            const isExpanded = expandedPathFiles.has(aff.path)
                            return (
                              <div
                                key={aff.path}
                                style={{
                                  background: 'var(--bg-secondary)',
                                  border: '1px solid var(--border-subtle)',
                                  borderRadius: '6px',
                                  padding: '12px 14px'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <FileCode size={14} color="#ef4444" />
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#ededf0' }}>{aff.name}</span>
                                    <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
                                      1 HOP
                                    </span>
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <button
                                      onClick={() => handleSelectFile(aff.path)}
                                      title="Switch impact analysis to this file"
                                      style={{
                                        background: 'transparent',
                                        border: '1px solid var(--border-subtle)',
                                        borderRadius: '4px',
                                        padding: '3px 8px',
                                        color: 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        fontSize: '10px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}
                                    >
                                      Analyze Target
                                      <ArrowRight size={10} />
                                    </button>
                                  </div>
                                </div>

                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                                  {aff.path}
                                </div>

                                {simulationMode === 'rename' && (
                                  <div style={{ marginTop: '8px', padding: '6px 8px', background: 'rgba(251, 191, 36, 0.08)', borderRadius: '4px', fontSize: '10px', color: '#fde047', fontFamily: 'var(--font-mono)' }}>
                                    Update import: <code style={{ color: '#ef4444' }}>from '{selectedFile.name}'</code> → <code style={{ color: '#4ade80' }}>from '{renameNewName.trim() || selectedFile.name}'</code>
                                  </div>
                                )}

                                <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                  {aff.consequence || `Direct broken import: Module '${selectedFile.name}' will fail to resolve.`}
                                </div>

                                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)', fontSize: '10px', color: '#6B9BCB', fontFamily: 'var(--font-mono)' }}>
                                  {aff.dependencyPath && aff.dependencyPath.length > 0 ? aff.dependencyPath.join(' → ') : `${aff.name} → ${selectedFile.name}`}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Transitive Dependents Section */}
                    {transitiveDependents.length > 0 && (
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#fb923c', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>Transitive Dependents — 2+ Hops ({transitiveDependents.length})</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Cascade Ripple</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {transitiveDependents.map((aff) => (
                            <div
                              key={aff.path}
                              style={{
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: '6px',
                                padding: '12px 14px'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <FileCode size={14} color="#fb923c" />
                                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#ededf0' }}>{aff.name}</span>
                                  <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', background: 'rgba(251, 146, 60, 0.15)', color: '#fb923c' }}>
                                    {aff.hops} HOPS
                                  </span>
                                </div>

                                <button
                                  onClick={() => handleSelectFile(aff.path)}
                                  title="Switch impact analysis to this file"
                                  style={{
                                    background: 'transparent',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: '4px',
                                    padding: '3px 8px',
                                    color: 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    fontSize: '10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                >
                                  Analyze Target
                                  <ArrowRight size={10} />
                                </button>
                              </div>

                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                                {aff.path}
                              </div>

                              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                {aff.consequence || `Cascade runtime failure: Calls will fail when propagating to '${selectedFile.name}'.`}
                              </div>

                              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)', fontSize: '10px', color: '#6B9BCB', fontFamily: 'var(--font-mono)' }}>
                                {aff.dependencyPath && aff.dependencyPath.length > 0 ? aff.dependencyPath.join(' → ') : `${aff.name} → ... → ${selectedFile.name}`}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)', textAlign: 'center', gap: '10px', padding: '40px' }}>
              <Layers size={36} strokeWidth={1.5} color="var(--border-medium)" />
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#ededf0' }}>Select a File to Analyze Impact</div>
              <div style={{ fontSize: '12px', maxWidth: '380px', lineHeight: 1.5 }}>
                Choose any project file from the left repository explorer to simulate modify, delete, or rename blast radius.
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

