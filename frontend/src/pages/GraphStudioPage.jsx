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
  Download,
  Maximize2,
  RefreshCw,
  Radio,
  ChevronDown,
  Palette,
  Check,
  FileImage,
  Code
} from 'lucide-react'
import { FileNode } from '../FileNode'
import { ProjectExplorer } from '../ProjectExplorer'

const nodeTypes = {
  fileNode: FileNode
}

function GraphNavigator({ fitTrigger, centerTarget, onReactFlowReady }) {
  const reactFlow = useReactFlow()
  const { fitView, setCenter, getNode, getZoom } = reactFlow

  useEffect(() => {
    if (onReactFlowReady) {
      onReactFlowReady(reactFlow)
    }
  }, [onReactFlowReady, reactFlow])

  useEffect(() => {
    if (fitTrigger === 0) return
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

export function GraphStudioPage({
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
  handlePaneClick,
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
  handleExportJSON
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, position: 'relative' }}>
      {/* Subheader / Page Title */}
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
            Graph Studio
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          <span>
            <strong style={{ color: '#ededf0' }}>{rawGraph?.nodes?.length || 0}</strong> nodes
          </span>
          <span style={{ color: 'var(--border-subtle)' }}>•</span>
          <span>
            <strong style={{ color: '#ededf0' }}>{rawGraph?.edges?.length || 0}</strong> connections
          </span>
        </div>
      </div>

      {/* Main Studio Area */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        {/* Left Explorer Sidebar */}
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
              Project Files ({filteredFiles.length})
            </div>
            <ProjectExplorer
              files={filteredFiles}
              selectedFilePath={selectedFile?.path}
              onSelectFile={handleSelectFile}
              isSearching={Boolean(searchQuery.trim())}
            />
          </div>

          {/* Statistics summary */}
          <div style={{ padding: '12px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ background: 'var(--bg-secondary)', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>NODES</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#ededf0' }}>{rawGraph?.nodes?.length || 0}</div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>EDGES</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#ededf0' }}>{rawGraph?.edges?.length || 0}</div>
              </div>
            </div>
          </div>
        </aside>

        {/* Center: Graph Viewport */}
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
                color: exportFeedback.type === 'success' ? '#86efac' : '#fca5a5'
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
                gap: '6px',
                fontSize: '10px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Node Legend
                </span>
                <button
                  onClick={() => setShowLegend(false)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px', padding: 0 }}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: 9, height: 9, borderRadius: '2px', background: '#202B36', border: '1.5px solid #6B9BCB', flexShrink: 0 }} />
                <span style={{ color: '#6B9BCB', fontWeight: 500 }}>Target:</span>
                <span style={{ color: 'var(--text-secondary)' }}>Selected file</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: 9, height: 9, borderRadius: '2px', background: '#2A1818', border: '1.5px solid #ef4444', flexShrink: 0 }} />
                <span style={{ color: '#ef4444', fontWeight: 500 }}>Direct (1 hop):</span>
                <span style={{ color: 'var(--text-secondary)' }}>Direct dependents</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: 9, height: 9, borderRadius: '2px', background: '#2A1F14', border: '1.5px solid #f97316', flexShrink: 0 }} />
                <span style={{ color: '#f97316', fontWeight: 500 }}>Indirect (2+ hops):</span>
                <span style={{ color: 'var(--text-secondary)' }}>Transitive dependents</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: 9, height: 9, borderRadius: '2px', background: '#12231A', border: '1.5px solid #22c55e', flexShrink: 0 }} />
                <span style={{ color: '#22c55e', fontWeight: 500 }}>Dependency:</span>
                <span style={{ color: 'var(--text-secondary)' }}>Files it imports</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: 9, height: 9, borderRadius: '2px', background: '#082531', border: '1.5px solid #38bdf8', flexShrink: 0 }} />
                <span style={{ color: '#38bdf8', fontWeight: 500 }}>Search match:</span>
                <span style={{ color: 'var(--text-secondary)' }}>Matches query</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: 9, height: 9, borderRadius: '2px', background: '#141418', border: '1.5px solid #646473', flexShrink: 0 }} />
                <span style={{ color: '#ededf0', fontWeight: 500 }}>Grey:</span>
                <span style={{ color: 'var(--text-secondary)' }}>Normal files</span>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

