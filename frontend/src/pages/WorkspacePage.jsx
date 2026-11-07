import React, { useEffect } from 'react'
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  useReactFlow
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Layers,
  Search,
  FileCode,
  AlertCircle,
  Sparkles,
  Download,
  Maximize2,
  RefreshCw,
  Send,
  Info,
  Radio,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Terminal,
  Palette,
  Trash2,
  AlertTriangle,
  ExternalLink,
  Check,
  FileImage,
  Code
} from 'lucide-react'
import { FileNode } from '../FileNode'
import { ProjectExplorer } from '../ProjectExplorer'

const nodeTypes = {
  fileNode: FileNode
}

// Handles viewport controls inside <ReactFlow>:
// 1. Auto-fits the viewport after a layout recalculation or fit button click.
// 2. Smoothly centers the targeted node (e.g. when selected in Project Explorer or search).
// 3. Exposes reactFlow instance functions to parent component via ref callback.
function GraphNavigator({ fitTrigger, centerTarget, onReactFlowReady }) {
  const reactFlow = useReactFlow()
  const { fitView, setCenter, getNode, getZoom } = reactFlow

  useEffect(() => {
    if (onReactFlowReady) {
      onReactFlowReady(reactFlow)
    }
  }, [onReactFlowReady, reactFlow])

  useEffect(() => {
    if (fitTrigger === 0) return // skip the very first render; ReactFlow's own fitView handles it
    // Small delay lets ReactFlow commit the new node positions before measuring
    const id = setTimeout(() => fitView({ padding: 0.18, duration: 350 }), 50)
    return () => clearTimeout(id)
  }, [fitTrigger, fitView])

  useEffect(() => {
    if (!centerTarget || !centerTarget.id) return
    const id = setTimeout(() => {
      const node = getNode(centerTarget.id)
      if (node && node.position) {
        const w = node.measured?.width || 220
        const h = node.measured?.height || 88
        const cx = node.position.x + w / 2
        const cy = node.position.y + h / 2
        const currentZoom = getZoom()
        const targetZoom = Math.min(Math.max(currentZoom, 0.9), 1.15)
        setCenter(cx, cy, { duration: 600, zoom: targetZoom })
      }
    }, 60)
    return () => clearTimeout(id)
  }, [centerTarget, getNode, setCenter, getZoom])

  return null
}
function QueryResultTable({ results, onSelectFile }) {
  if (!results || !Array.isArray(results) || results.length === 0) return null

  // Flatten row data
  const normalizedRows = results.map((rawRow, idx) => {
    if (!rawRow || typeof rawRow !== 'object') {
      return { _rawId: idx, value: String(rawRow) }
    }
    const flat = { _rawId: idx }
    for (const [key, val] of Object.entries(rawRow)) {
      if (val && typeof val === 'object' && val.properties && typeof val.properties === 'object') {
        Object.entries(val.properties).forEach(([pKey, pVal]) => {
          flat[pKey] = pVal
        })
      } else if (Array.isArray(val)) {
        flat[key] = val.map((v) => (v && typeof v === 'object' && v.name ? v.name : String(v))).join(', ')
      } else if (val && typeof val === 'object') {
        if ('low' in val && 'high' in val) {
          flat[key] = val.low
        } else {
          flat[key] = JSON.stringify(val)
        }
      } else {
        flat[key] = val !== null && val !== undefined ? val : ''
      }
    }
    return flat
  })

  // Extract unique column names across all rows
  const ignoredKeys = new Set(['_rawId', 'elementId', 'identity', 'labels', 'p', 'rawRecords', 'projectId', 'userId'])
  const colSet = new Set()
  normalizedRows.forEach((row) => {
    Object.keys(row).forEach((k) => {
      if (!ignoredKeys.has(k)) {
        colSet.add(k)
      }
    })
  })

  // Sort columns in intuitive order: name, path, hops, impactType, summary, then others
  const priority = ['name', 'path', 'hops', 'impactType', 'summary']
  const columns = Array.from(colSet).sort((a, b) => {
    const ai = priority.indexOf(a)
    const bi = priority.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b)
  })

  if (columns.length === 0) return null

  return (
    <div
      style={{
        marginTop: '8px',
        maxHeight: '220px',
        overflowX: 'auto',
        overflowY: 'auto',
        borderRadius: '4px',
        border: '1px solid var(--border-subtle, #23232b)',
        background: '#09090d'
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '11px',
          textAlign: 'left'
        }}
      >
        <thead>
          <tr style={{ background: '#121217', borderBottom: '1px solid var(--border-subtle, #23232b)', position: 'sticky', top: 0, zIndex: 1 }}>
            {columns.map((col) => (
              <th
                key={col}
                style={{
                  padding: '6px 10px',
                  fontWeight: 600,
                  fontSize: '10px',
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted, #8b8b99)',
                  whiteSpace: 'nowrap'
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {normalizedRows.map((row, rowIdx) => {
            const fileName = row.name || row.path || row['affected.name'] || row['dep.name'] || row['importer.name']
            return (
              <tr
                key={row._rawId || rowIdx}
                onClick={() => {
                  if (fileName && typeof onSelectFile === 'function') {
                    onSelectFile(fileName)
                  }
                }}
                style={{
                  borderBottom: rowIdx < normalizedRows.length - 1 ? '1px solid #1a1a24' : 'none',
                  cursor: fileName ? 'pointer' : 'default',
                  transition: 'background 0.15s ease'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#15151e')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {columns.map((col) => {
                  const val = row[col]
                  const isCodeField = col === 'path' || col === 'name' || col.endsWith('.path') || col.endsWith('.name')
                  return (
                    <td
                      key={col}
                      style={{
                        padding: '6px 10px',
                        color: isCodeField ? '#93c5fd' : '#ededf0',
                        fontFamily: isCodeField ? 'var(--font-mono)' : 'inherit',
                        fontSize: '11px',
                        verticalAlign: 'top',
                        maxWidth: col === 'summary' ? '450px' : '220px',
                        whiteSpace: col === 'summary' ? 'normal' : 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        lineHeight: 1.4
                      }}
                    >
                      {val !== undefined && val !== null && String(val) !== '' ? String(val) : '—'}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function WorkspacePage({
  activeProjectId,
  rawGraph,
  loadingGraph,
  graphError,
  fetchGraph,
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  searchQuery,
  setSearchQuery,
  filteredFiles,
  centerTarget,
  fitViewTrigger,
  setFitViewTrigger,
  graphMode,
  handleModeChange,
  selectedFile,
  handleSelectFile,
  impactData,
  loadingImpact,
  analysisMode,
  setAnalysisMode,
  activeHighlightedPath,
  handleHighlightPath,
  expandedPathFiles,
  toggleExpand,
  handlePaneClick,
  updateEdgeStyles,
  setEdges,
  nlQuestion,
  setNlQuestion,
  nlResponse,
  setNlResponse,
  nlLoading,
  handleNlSubmit,
  showMinimap,
  setShowMinimap,
  showLegend,
  setShowLegend,
  showExportMenu,
  setShowExportMenu,
  exportingFormat,
  exportFeedback,
  setExportFeedback,
  reactFlowWrapperRef,
  setReactFlowInstance,
  handleExportPNG,
  handleExportSVG,
  handleExportJSON,
  directImporters,
  transitiveDependents,
  normalizedAffectedFiles
}) {
  return (
    <>

          <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        {/* LEFT SIDEBAR: Project Explorer & Stats */}
        <aside
          style={{
            width: '260px',
            minWidth: '220px',
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
              <Search size={13} style={{ position: 'absolute', left: '8px', top: '8px', color: searchQuery.trim() ? '#38bdf8' : 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search repository files or paths..."
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

          {/* Explorer Tree */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', paddingLeft: '4px' }}>
              Project Files ({filteredFiles.length})
            </div>
            <ProjectExplorer
              files={filteredFiles}
              selectedFilePath={selectedFile?.path}
              onSelectFile={handleSelectFile}
              isSearching={Boolean(searchQuery.trim())}
            />
          </div>

          {/* Project Statistics */}
          <div style={{ padding: '12px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
              Graph Statistics
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ background: 'var(--bg-secondary)', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>NODES</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#ededf0' }}>{rawGraph.nodes.length}</div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>EDGES</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#ededf0' }}>{rawGraph.edges.length}</div>
              </div>
            </div>
          </div>
        </aside>

        {/* CENTRE: Graph Viewport */}
        <main style={{ flex: 1, position: 'relative', height: '100%', background: 'var(--bg-primary)' }}>
          {/* Top Graph Controls Bar */}
          <div
            style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              zIndex: 5,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '4px 6px'
            }}
          >
            {/* Graph Type Selector */}
            <select
              value={graphMode}
              onChange={(e) => handleModeChange(e.target.value)}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '4px',
                color: '#ededf0',
                fontSize: '11px',
                padding: '3px 8px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="dependency">Hierarchical Dependencies</option>
              <option value="tree">Layered Tree</option>
              <option value="horizontal">Horizontal Architecture Flow</option>
              <option value="radial">Radial Blast-Radius</option>
            </select>

            <button
              onClick={() => setFitViewTrigger((t) => t + 1)}
              title="Fit graph to viewport"
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                color: 'var(--text-secondary)',
                padding: '4px 6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ededf0')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
            >
              <Maximize2 size={12} />
              Fit to Screen
            </button>

            <div style={{ width: 1, height: 16, background: 'var(--border-subtle)' }} />

            <button
              onClick={() => setShowLegend(!showLegend)}
              style={{
                background: showLegend ? 'var(--bg-elevated)' : 'transparent',
                border: 'none',
                borderRadius: '4px',
                color: showLegend ? '#ededf0' : 'var(--text-secondary)',
                padding: '4px 6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px'
              }}
            >
              <Palette size={12} />
              Legend
            </button>

            <button
              onClick={() => setShowMinimap(!showMinimap)}
              style={{
                background: showMinimap ? 'var(--bg-elevated)' : 'transparent',
                border: 'none',
                borderRadius: '4px',
                color: 'var(--text-secondary)',
                padding: '4px 6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px'
              }}
            >
              <Radio size={12} />
              Minimap
            </button>

            {/* Export Dropdown Popover */}
            <div id="export-menu-container" style={{ position: 'relative' }}>
              <button
                onClick={() => setShowExportMenu((prev) => !prev)}
                disabled={Boolean(exportingFormat) || !nodes || nodes.length === 0}
                title={!nodes || nodes.length === 0 ? 'Graph is empty' : 'Export graph as PNG, SVG, or JSON'}
                style={{
                  background: showExportMenu ? 'var(--bg-elevated, #1f1f26)' : 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  color: !nodes || nodes.length === 0 ? 'var(--text-muted, #646473)' : '#ededf0',
                  padding: '4px 8px',
                  cursor: !nodes || nodes.length === 0 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '11px',
                  opacity: !nodes || nodes.length === 0 ? 0.5 : 1,
                  transition: 'all 0.15s ease'
                }}
              >
                {exportingFormat ? (
                  <RefreshCw size={12} className="spin" />
                ) : (
                  <Download size={12} />
                )}
                <span>Export</span>
                <ChevronDown size={11} style={{ opacity: 0.7 }} />
              </button>

              {showExportMenu && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    width: '190px',
                    background: '#121217',
                    border: '1px solid var(--border-subtle, #23232b)',
                    borderRadius: '6px',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.65)',
                    padding: '4px',
                    zIndex: 20,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}
                >
                  <div
                    style={{
                      padding: '5px 8px 3px 8px',
                      fontSize: '9px',
                      fontWeight: 700,
                      color: 'var(--text-muted, #646473)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    Export Options
                  </div>

                  {/* PNG Option */}
                  <button
                    onClick={handleExportPNG}
                    disabled={Boolean(exportingFormat)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '6px 8px',
                      color: '#ededf0',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      textAlign: 'left',
                      transition: 'background 0.12s ease'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#1a1a22')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileImage size={13} color="#60a5fa" />
                      <div>
                        <div style={{ fontWeight: 500 }}>High-Res PNG</div>
                        <div style={{ fontSize: '9px', color: 'var(--text-muted, #646473)' }}>2x full graph image</div>
                      </div>
                    </div>
                    {exportingFormat === 'png' && <RefreshCw size={11} className="spin" />}
                  </button>

                  {/* SVG Option */}
                  <button
                    onClick={handleExportSVG}
                    disabled={Boolean(exportingFormat)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '6px 8px',
                      color: '#ededf0',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      textAlign: 'left',
                      transition: 'background 0.12s ease'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#1a1a22')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Code size={13} color="#34d399" />
                      <div>
                        <div style={{ fontWeight: 500 }}>Scalable SVG</div>
                        <div style={{ fontSize: '9px', color: 'var(--text-muted, #646473)' }}>Vector resolution</div>
                      </div>
                    </div>
                    {exportingFormat === 'svg' && <RefreshCw size={11} className="spin" />}
                  </button>

                  {/* JSON Option */}
                  <button
                    onClick={handleExportJSON}
                    disabled={Boolean(exportingFormat)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '6px 8px',
                      color: '#ededf0',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      textAlign: 'left',
                      transition: 'background 0.12s ease'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#1a1a22')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileCode size={13} color="#fbbf24" />
                      <div>
                        <div style={{ fontWeight: 500 }}>Graph JSON</div>
                        <div style={{ fontSize: '9px', color: 'var(--text-muted, #646473)' }}>Nodes, edges & metadata</div>
                      </div>
                    </div>
                    {exportingFormat === 'json' && <RefreshCw size={11} className="spin" />}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Export Feedback Toast */}
          {exportFeedback && (
            <div
              style={{
                position: 'absolute',
                top: '52px',
                right: '16px',
                zIndex: 30,
                background: exportFeedback.type === 'success' ? '#0f291e' : '#2b1111',
                border: `1px solid ${exportFeedback.type === 'success' ? '#22c55e' : '#ef4444'}`,
                borderRadius: '6px',
                padding: '8px 12px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.65)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '11px',
                color: exportFeedback.type === 'success' ? '#86efac' : '#fca5a5',
                animation: 'fadeIn 0.2s ease'
              }}
            >
              {exportFeedback.type === 'success' ? (
                <Check size={14} color="#22c55e" style={{ flexShrink: 0 }} />
              ) : (
                <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0 }} />
              )}
              <span>{exportFeedback.message}</span>
              <button
                onClick={() => setExportFeedback(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  padding: '0 2px',
                  fontSize: '11px',
                  opacity: 0.7
                }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Loading / Error Overlays */}
          {loadingGraph && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,10,12,0.85)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ededf0', fontSize: '13px' }}>
                <RefreshCw size={16} className="spin" />
                Loading graph data from Neo4j...
              </div>
            </div>
          )}

          {graphError && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,10,12,0.9)' }}>
              <div style={{ maxWidth: '400px', background: 'var(--bg-surface)', border: '1px solid #7f1d1d', borderRadius: '6px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f87171', fontWeight: 600, marginBottom: '6px' }}>
                  <AlertCircle size={16} />
                  Failed to load graph
                </div>
                <div style={{ fontSize: '11px', color: '#9a9aa8', marginBottom: '12px' }}>{graphError}</div>
                <button
                  onClick={fetchGraph}
                  style={{ background: '#2e2e38', border: '1px solid #454554', color: '#ededf0', borderRadius: '4px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer' }}
                >
                  Retry Connection
                </button>
              </div>
            </div>
          )}

          {/* React Flow Component Container */}
          <div ref={reactFlowWrapperRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={(_, node) => handleSelectFile(node.id)}
              onPaneClick={handlePaneClick}
              fitView
              fitViewOptions={{ padding: 0.18 }}
              minZoom={0.1}
              maxZoom={2}
            >
              <GraphNavigator
                fitTrigger={fitViewTrigger}
                centerTarget={centerTarget}
                onReactFlowReady={setReactFlowInstance}
              />
              <Background color="#1c1c24" gap={16} size={1} />
              <Controls position="bottom-right" />
              {showMinimap && (
                <MiniMap
                  position="bottom-left"
                  nodeStrokeColor="#2e2e38"
                  nodeColor="#1a1a20"
                  maskColor="rgba(10, 10, 12, 0.7)"
                />
              )}
            </ReactFlow>
          </div>

          {/* Compact Graph Color Legend */}
          {showLegend && (
            <div
              style={{
                position: 'absolute',
                bottom: '16px',
                left: showMinimap ? '230px' : '16px',
                zIndex: 5,
                background: 'rgba(17, 17, 20, 0.95)',
                backdropFilter: 'blur(6px)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                padding: '8px 12px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
                fontSize: '11px',
                minWidth: '170px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Graph Legend
                </span>
                <button
                  onClick={() => setShowLegend(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '10px',
                    cursor: 'pointer',
                    padding: '0 2px'
                  }}
                  title="Hide Legend"
                >
                  ✕
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: 9, height: 9, borderRadius: '2px', background: '#202B36', border: '1.5px solid #6B9BCB', flexShrink: 0 }} />
                <span style={{ color: '#ededf0', fontWeight: 500 }}>Steel Blue:</span>
                <span style={{ color: 'var(--text-secondary)' }}>Selected file</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: 9, height: 9, borderRadius: '2px', background: 'rgba(34, 197, 94, 0.2)', border: '1.5px solid #22c55e', flexShrink: 0 }} />
                <span style={{ color: '#ededf0', fontWeight: 500 }}>Green:</span>
                <span style={{ color: 'var(--text-secondary)' }}>Direct dependencies</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: 9, height: 9, borderRadius: '2px', background: 'rgba(249, 115, 22, 0.2)', border: '1.5px solid #f97316', flexShrink: 0 }} />
                <span style={{ color: '#ededf0', fontWeight: 500 }}>Orange:</span>
                <span style={{ color: 'var(--text-secondary)' }}>Affected files</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: 9, height: 9, borderRadius: '2px', background: 'rgba(239, 68, 68, 0.2)', border: '1.5px solid #ef4444', flexShrink: 0 }} />
                <span style={{ color: '#ededf0', fontWeight: 500 }}>Red:</span>
                <span style={{ color: 'var(--text-secondary)' }}>Changed/origin file</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: 9, height: 9, borderRadius: '2px', background: 'rgba(56, 189, 248, 0.2)', border: '1.5px solid #38bdf8', flexShrink: 0 }} />
                <span style={{ color: '#ededf0', fontWeight: 500 }}>Sky Blue:</span>
                <span style={{ color: 'var(--text-secondary)' }}>Search match</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: 9, height: 9, borderRadius: '2px', background: '#141418', border: '1.5px solid #646473', flexShrink: 0 }} />
                <span style={{ color: '#ededf0', fontWeight: 500 }}>Grey:</span>
                <span style={{ color: 'var(--text-secondary)' }}>Normal files</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: 9, height: 9, borderRadius: '2px', background: '#141418', border: '1.5px solid #646473', flexShrink: 0 }} />
                <span style={{ color: '#ededf0', fontWeight: 500 }}>Grey:</span>
                <span style={{ color: 'var(--text-secondary)' }}>Normal files</span>
              </div>
            </div>
          )}
        </main>

        {/* RIGHT SIDEBAR: Selected File & Impact Analysis */}
        <aside
          style={{
            width: '300px',
            minWidth: '260px',
            background: 'var(--bg-secondary)',
            borderLeft: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 5
          }}
        >
          <div style={{ padding: '12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Info size={14} color="#60a5fa" />
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#ededf0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              File Inspector
            </span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
            {selectedFile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Selected Node</div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#ededf0', marginTop: '2px' }}>{selectedFile.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                    {selectedFile.path}
                  </div>
                </div>

                {selectedFile.summary && (
                  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '10px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Summary</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{selectedFile.summary}</div>
                  </div>
                )}

                {/* Impact Analysis & Delete Simulation Section */}
                <div>
                  {/* Mode Selector */}
                  <div
                    style={{
                      display: 'flex',
                      background: 'var(--bg-surface)',
                      padding: '2px',
                      borderRadius: '5px',
                      border: '1px solid var(--border-subtle)',
                      marginBottom: '10px'
                    }}
                  >
                    <button
                      onClick={() => {
                        setAnalysisMode('modify')
                        if (activeHighlightedPath) {
                          setEdges((eds) => updateEdgeStyles(eds, activeHighlightedPath, 'modify'))
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '5px 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        borderRadius: '4px',
                        border: 'none',
                        background: analysisMode === 'modify' ? '#202B36' : 'transparent',
                        color: analysisMode === 'modify' ? '#6B9BCB' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        transition: 'all 0.15s'
                      }}
                    >
                      <ShieldAlert size={12} />
                      Modify Impact
                    </button>
                    <button
                      onClick={() => {
                        setAnalysisMode('delete')
                        if (activeHighlightedPath) {
                          setEdges((eds) => updateEdgeStyles(eds, activeHighlightedPath, 'delete'))
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '5px 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        borderRadius: '4px',
                        border: 'none',
                        background: analysisMode === 'delete' ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                        color: analysisMode === 'delete' ? '#ef4444' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        transition: 'all 0.15s'
                      }}
                    >
                      <Trash2 size={12} />
                      Delete Simulation
                    </button>
                  </div>

                  {/* Delete Simulation Notice & Counts */}
                  {analysisMode === 'delete' && (
                    <>
                      <div
                        style={{
                          background: 'rgba(239, 68, 68, 0.08)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: '4px',
                          padding: '8px 10px',
                          marginBottom: '10px',
                          fontSize: '10px',
                          color: '#fca5a5',
                          lineHeight: 1.4
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 700, marginBottom: '2px', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                          <AlertTriangle size={12} />
                          Simulation Mode Only
                        </div>
                        Predicting build breakages if <strong>{selectedFile.name}</strong> were deleted. No actual files are deleted or modified.
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                        <div style={{ background: 'var(--bg-surface)', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                          <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>DIRECT IMPORTERS</div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#ef4444' }}>{directImporters.length} broken</div>
                        </div>
                        <div style={{ background: 'var(--bg-surface)', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                          <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>TRANSITIVE DEPENDENTS</div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#fb923c' }}>{transitiveDependents.length} affected</div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Section Title Bar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 600, color: analysisMode === 'delete' ? '#ef4444' : '#fb923c', textTransform: 'uppercase' }}>
                      {analysisMode === 'delete' ? <Trash2 size={12} /> : <ShieldAlert size={12} />}
                      {analysisMode === 'delete' ? 'Delete Impact Breakdown' : 'Transitive Blast Radius'}
                    </div>
                    {impactData && (
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        Total affected files: <strong style={{ color: '#ededf0' }}>{normalizedAffectedFiles.length}</strong>
                      </span>
                    )}
                  </div>

                  {loadingImpact ? (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '8px 0' }}>Analyzing dependent paths...</div>
                  ) : normalizedAffectedFiles.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {/* 1. DIRECT IMPACT / DIRECT IMPORTERS */}
                      {directImporters.length > 0 && (
                        <div>
                          <div style={{ fontSize: '9px', fontWeight: 700, color: analysisMode === 'delete' ? '#ef4444' : '#22c55e', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>{analysisMode === 'delete' ? 'Direct Importers Broken (1 Hop)' : 'Direct Impact (1 Hop)'}</span>
                            <span>({directImporters.length})</span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            {directImporters.map((aff) => {
                              const isExpanded = expandedPathFiles.has(aff.path)
                              const isHighlighted = activeHighlightedPath && activeHighlightedPath[0] === aff.path
                              return (
                                <div
                                  key={aff.path}
                                  onClick={() => handleHighlightPath(aff)}
                                  style={{
                                    background: isHighlighted ? '#202B36' : 'var(--bg-surface)',
                                    border: isHighlighted ? '1px solid #6B9BCB' : '1px solid var(--border-subtle)',
                                    borderRadius: '4px',
                                    padding: '7px 9px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                      <FileCode size={12} color={analysisMode === 'delete' ? '#ef4444' : '#22c55e'} />
                                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#ededf0' }}>{aff.name}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <span
                                        style={{
                                          fontSize: '8px',
                                          fontWeight: 700,
                                          padding: '1px 4px',
                                          borderRadius: '2px',
                                          background: analysisMode === 'delete' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.15)',
                                          color: analysisMode === 'delete' ? '#ef4444' : '#22c55e'
                                        }}
                                      >
                                        1 HOP
                                      </span>
                                      <button
                                        onClick={(e) => toggleExpand(aff.path, e)}
                                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 2px' }}
                                        title={isExpanded ? 'Collapse path' : 'Expand path'}
                                      >
                                        {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleSelectFile(aff.path)
                                        }}
                                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 2px' }}
                                        title="Inspect this file as target"
                                      >
                                        <ExternalLink size={10} />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Unresolved Import Alert in Delete Mode */}
                                  {analysisMode === 'delete' && (
                                    <div style={{ fontSize: '9px', color: '#ef4444', fontFamily: 'var(--font-mono)', background: 'rgba(239, 68, 68, 0.1)', padding: '2px 5px', borderRadius: '2px', marginBottom: '4px' }}>
                                      Broken: import from "./{selectedFile.name}"
                                    </div>
                                  )}

                                  {/* Path string */}
                                  <div style={{ fontSize: '9px', color: '#6B9BCB', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {aff.dependencyPath && aff.dependencyPath.length > 0 ? aff.dependencyPath.join(' → ') : `${aff.name} → ${selectedFile.name}`}
                                  </div>

                                  {/* Expanded details */}
                                  {isExpanded && (
                                    <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--border-subtle)', fontSize: '10px', color: 'var(--text-secondary)' }}>
                                      <div style={{ marginBottom: '3px', color: analysisMode === 'delete' ? '#fca5a5' : '#86efac' }}>
                                        <strong>Consequence: </strong>
                                        {aff.consequence || (analysisMode === 'delete'
                                          ? `Direct broken import: Module '${selectedFile.name}' cannot be resolved. Build or module loading will fail.`
                                          : `Direct consumer: Any modification to '${selectedFile.name}' will directly affect this module.`)}
                                      </div>
                                      <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                        Click to highlight complete path in graph.
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* 2. INDIRECT IMPACT / TRANSITIVE DEPENDENTS */}
                      {transitiveDependents.length > 0 && (
                        <div>
                          <div style={{ fontSize: '9px', fontWeight: 700, color: '#fb923c', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>{analysisMode === 'delete' ? 'Transitive Dependents Affected (2+ Hops)' : 'Indirect Impact (2+ Hops)'}</span>
                            <span>({transitiveDependents.length})</span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            {transitiveDependents.map((aff) => {
                              const isExpanded = expandedPathFiles.has(aff.path)
                              const isHighlighted = activeHighlightedPath && activeHighlightedPath[0] === aff.path
                              return (
                                <div
                                  key={aff.path}
                                  onClick={() => handleHighlightPath(aff)}
                                  style={{
                                    background: isHighlighted ? '#202B36' : 'var(--bg-surface)',
                                    border: isHighlighted ? '1px solid #6B9BCB' : '1px solid var(--border-subtle)',
                                    borderRadius: '4px',
                                    padding: '7px 9px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                      <FileCode size={12} color="#fb923c" />
                                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#ededf0' }}>{aff.name}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <span
                                        style={{
                                          fontSize: '8px',
                                          fontWeight: 700,
                                          padding: '1px 4px',
                                          borderRadius: '2px',
                                          background: 'rgba(251, 146, 60, 0.15)',
                                          color: '#fb923c'
                                        }}
                                      >
                                        {aff.hops} HOPS
                                      </span>
                                      <button
                                        onClick={(e) => toggleExpand(aff.path, e)}
                                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 2px' }}
                                        title={isExpanded ? 'Collapse path' : 'Expand path'}
                                      >
                                        {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleSelectFile(aff.path)
                                        }}
                                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 2px' }}
                                        title="Inspect this file as target"
                                      >
                                        <ExternalLink size={10} />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Path string */}
                                  <div style={{ fontSize: '9px', color: '#6B9BCB', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {aff.dependencyPath && aff.dependencyPath.length > 0 ? aff.dependencyPath.join(' → ') : `${aff.name} → ... → ${selectedFile.name}`}
                                  </div>

                                  {/* Expanded details */}
                                  {isExpanded && (
                                    <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--border-subtle)', fontSize: '10px', color: 'var(--text-secondary)' }}>
                                      <div style={{ marginBottom: '3px', color: '#fed7aa' }}>
                                        <strong>Consequence: </strong>
                                        {aff.consequence || (analysisMode === 'delete'
                                          ? `Cascade runtime failure: Calls passing through intermediate modules will fail when reaching '${selectedFile.name}'.`
                                          : `Transitive dependent: Relies on '${selectedFile.name}' across ${aff.hops} hops.`)}
                                      </div>
                                      <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                        Click to highlight complete path in graph.
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-surface)', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                      {analysisMode === 'delete'
                        ? 'No dependent files. This file can be safely removed without breaking any other modules in the repository.'
                        : 'No dependent files affected. Modifying this file introduces no downstream transitive impact.'}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', textAlign: 'center', gap: '8px' }}>
                <Layers size={28} strokeWidth={1.5} />
                <div style={{ fontSize: '12px' }}>Select any file node in the canvas or explorer to inspect dependencies and impact.</div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* 3. BOTTOM NL QUERY INTERFACE */}
      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10
        }}
      >
        {/* Results Banner if active */}
        {nlResponse && (
          <div style={{ maxHeight: '360px', overflowY: 'auto', padding: '12px 16px', background: 'var(--bg-surface, #141418)', borderBottom: '1px solid var(--border-subtle, #23232b)', fontSize: '11px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#60a5fa', fontWeight: 600 }}>
                <Terminal size={12} />
                {nlResponse.intent === 'delete_simulation'
                  ? 'Delete Simulation Result'
                  : nlResponse.intent === 'modify_impact'
                  ? 'Modify Impact / Blast Radius'
                  : nlResponse.intent === 'rename'
                  ? 'Rename Impact Analysis'
                  : nlResponse.intent === 'file_explanation' || nlResponse.explanation
                  ? 'File Summary'
                  : 'Generated Cypher Query'}
              </div>
              <button
                onClick={() => setNlResponse(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted, #71717a)', cursor: 'pointer', fontSize: '11px' }}
              >
                Dismiss
              </button>
            </div>

            {nlResponse.error ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#f87171'
                }}
              >
                <AlertCircle size={14} color="#f87171" />
                <span>{nlResponse.error}</span>
              </div>
            ) : (
              <>
                {/* Generated Cypher Query */}
                {nlResponse.cypher && (
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted, #71717a)', fontWeight: 600 }}>
                        Cypher Query (Scoped to {activeProjectId})
                      </span>
                    </div>
                    <pre
                      style={{
                        margin: 0,
                        padding: '6px 8px',
                        background: '#09090d',
                        borderRadius: '4px',
                        border: '1px solid var(--border-subtle, #23232b)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        color: '#93c5fd',
                        overflowX: 'auto',
                        lineHeight: 1.4
                      }}
                    >
                      {nlResponse.cypher}
                    </pre>
                  </div>
                )}

                {/* Narrative Message or Explanation */}
                {nlResponse.message ? (
                  <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, color: '#ededf0' }}>{nlResponse.file?.name || nlResponse.targetFile || ''}{nlResponse.file?.name || nlResponse.targetFile ? ': ' : ''}</span>
                    {nlResponse.message}
                  </div>
                ) : nlResponse.explanation ? (
                  <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, color: '#ededf0' }}>{nlResponse.file?.name}: </span>
                    {nlResponse.explanation}
                  </div>
                ) : null}

                {/* Zero Results Handling */}
                {Array.isArray(nlResponse.results) && nlResponse.results.length === 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      background: '#0e0e12',
                      border: '1px solid var(--border-subtle, #23232b)',
                      color: 'var(--text-muted, #a1a1aa)',
                      fontSize: '11px',
                      marginTop: '4px'
                    }}
                  >
                    <AlertCircle size={14} color="#f59e0b" />
                    <span>
                      No matching records found in project <strong style={{ color: '#ededf0' }}>"{activeProjectId}"</strong>. The query executed successfully but returned 0 rows.
                    </span>
                  </div>
                ) : Array.isArray(nlResponse.results) && nlResponse.results.length > 0 ? (
                  <div style={{ marginTop: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '11px' }}>
                      <span>
                        Returned <strong style={{ color: '#ededf0' }}>{nlResponse.results.length}</strong> matching record{nlResponse.results.length === 1 ? '' : 's'}. Matching nodes highlighted in graph.
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        Click row to select file in workspace
                      </span>
                    </div>
                    <QueryResultTable results={nlResponse.results} onSelectFile={handleSelectFile} />
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}

        {/* Query Input Bar */}
        <form
          onSubmit={handleNlSubmit}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '11px' }}>
            <Sparkles size={14} color="#ededf0" />
            <span style={{ fontWeight: 600, color: '#ededf0' }}>NL Query:</span>
          </div>

          <input
            type="text"
            placeholder="Ask a question (e.g. 'Which files directly or indirectly depend on database.js?')..."
            value={nlQuestion}
            onChange={(e) => setNlQuestion(e.target.value)}
            disabled={nlLoading}
            style={{
              flex: 1,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              padding: '6px 10px',
              color: '#ededf0',
              fontSize: '12px',
              outline: 'none'
            }}
          />

          <button
            type="submit"
            disabled={!nlQuestion.trim() || nlLoading}
            style={{
              background: nlQuestion.trim() && !nlLoading ? '#2e2e38' : 'transparent',
              border: '1px solid var(--border-medium)',
              borderRadius: '4px',
              padding: '6px 12px',
              color: nlQuestion.trim() && !nlLoading ? '#ededf0' : 'var(--text-muted)',
              fontSize: '11px',
              fontWeight: 500,
              cursor: nlQuestion.trim() && !nlLoading ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s'
            }}
          >
            {nlLoading ? <RefreshCw size={12} className="spin" /> : <Send size={12} />}
            Ask
          </button>
        </form>
      </footer>

    </>
  )
}
