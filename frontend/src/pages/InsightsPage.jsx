import React, { useMemo } from 'react'
import {
  Activity,
  Layers,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  FileCode,
  GitBranch,
  Repeat,
  Info,
  Maximize2
} from 'lucide-react'

export function InsightsPage({
  activeProjectId,
  rawGraph,
  handleSelectFile,
  setActiveTab
}) {
  const nodes = rawGraph?.nodes || []
  const edges = rawGraph?.edges || []

  // Calculate real graph metrics directly from raw nodes and edges
  const metrics = useMemo(() => {
    const totalFiles = nodes.length
    const totalEdges = edges.length

    // Fan-in: how many files import this file (incoming edges)
    // Fan-out: how many files this file imports (outgoing edges)
    const inDegree = {}
    const outDegree = {}
    const adjacency = {}

    nodes.forEach((n) => {
      inDegree[n.path] = 0
      outDegree[n.path] = 0
      adjacency[n.path] = new Set()
    })

    edges.forEach((e) => {
      if (outDegree[e.source] !== undefined) {
        outDegree[e.source]++
        adjacency[e.source]?.add(e.target)
      }
      if (inDegree[e.target] !== undefined) {
        inDegree[e.target]++
      }
    })

    // Map path to node object for easy lookup
    const pathToNode = {}
    nodes.forEach((n) => {
      pathToNode[n.path] = n
    })

    // 1. Most depended-upon modules (Highest Fan-In / In-Degree)
    const sortedByFanIn = [...nodes]
      .map((n) => ({
        ...n,
        fanIn: inDegree[n.path] || 0,
        fanOut: outDegree[n.path] || 0
      }))
      .sort((a, b) => b.fanIn - a.fanIn)

    // 2. Highest Fan-Out modules (Files importing the most dependencies)
    const sortedByFanOut = [...nodes]
      .map((n) => ({
        ...n,
        fanIn: inDegree[n.path] || 0,
        fanOut: outDegree[n.path] || 0
      }))
      .sort((a, b) => b.fanOut - a.fanOut)

    // 3. Isolated files (In-degree === 0 AND Out-degree === 0)
    const isolatedFiles = nodes.filter((n) => (inDegree[n.path] || 0) === 0 && (outDegree[n.path] || 0) === 0)

    // 4. Entry point files (In-degree === 0, Out-degree > 0)
    const entryPoints = nodes.filter((n) => (inDegree[n.path] || 0) === 0 && (outDegree[n.path] || 0) > 0)

    // 5. Leaf utility files (In-degree > 0, Out-degree === 0)
    const leafNodes = nodes.filter((n) => (inDegree[n.path] || 0) > 0 && (outDegree[n.path] || 0) === 0)

    // 6. Detect circular dependencies (elementary cycles using DFS)
    const cycles = []
    const visited = {} // 0 = unvisited, 1 = visiting, 2 = visited
    const parentPath = {}

    const detectCyclesDFS = (curr, path) => {
      visited[curr] = 1
      const neighbors = adjacency[curr] || new Set()

      for (const next of neighbors) {
        if (visited[next] === 1) {
          // Found cycle
          const cycleStartIdx = path.indexOf(next)
          if (cycleStartIdx !== -1) {
            const cyclePath = path.slice(cycleStartIdx).concat(next)
            cycles.push(cyclePath)
          }
        } else if (!visited[next]) {
          detectCyclesDFS(next, [...path, next])
        }
      }
      visited[curr] = 2
    }

    nodes.forEach((n) => {
      if (!visited[n.path]) {
        detectCyclesDFS(n.path, [n.path])
      }
    })

    // Deduplicate cycles by canonical string representation
    const uniqueCycles = []
    const seenCycles = new Set()
    for (const c of cycles) {
      const cycleNodes = c.slice(0, -1)
      const minNode = cycleNodes.reduce((min, cur) => (cur < min ? cur : min), cycleNodes[0])
      const minIdx = cycleNodes.indexOf(minNode)
      const canonical = cycleNodes.slice(minIdx).concat(cycleNodes.slice(0, minIdx)).join(' → ')
      if (!seenCycles.has(canonical)) {
        seenCycles.add(canonical)
        uniqueCycles.push(c)
      }
    }

    // Instability index (Martin metrics): I = FanOut / (FanIn + FanOut)
    // 0 = completely stable (independent, hard to change), 1 = completely unstable (highly dependent)
    const couplingScores = nodes.map((n) => {
      const fi = inDegree[n.path] || 0
      const fo = outDegree[n.path] || 0
      const total = fi + fo
      const instability = total === 0 ? 0 : Number((fo / total).toFixed(2))
      return {
        ...n,
        fanIn: fi,
        fanOut: fo,
        instability
      }
    })

    return {
      totalFiles,
      totalEdges,
      avgDependencies: totalFiles > 0 ? (totalEdges / totalFiles).toFixed(1) : 0,
      sortedByFanIn,
      sortedByFanOut,
      isolatedFiles,
      entryPoints,
      leafNodes,
      uniqueCycles,
      couplingScores
    }
  }, [nodes, edges])

  const onInspect = (filePath) => {
    if (handleSelectFile) handleSelectFile(filePath)
    if (setActiveTab) setActiveTab('Workspace')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, position: 'relative', overflowY: 'auto' }}>
      {/* Header Bar */}
      <div
        style={{
          height: '42px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          zIndex: 5,
          flexShrink: 0
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
            Architecture Insights
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          <span>Real Graph Metrics</span>
        </div>
      </div>

      {/* Main Content Dashboard */}
      <div style={{ maxWidth: '1080px', width: '100%', margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Top Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '14px' }}>
            <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>TOTAL REPO FILES</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#ededf0', marginTop: '3px' }}>{metrics.totalFiles}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>Graph module nodes</div>
          </div>

          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '14px' }}>
            <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>TOTAL DEPENDENCIES</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#6B9BCB', marginTop: '3px' }}>{metrics.totalEdges}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>Directed import edges</div>
          </div>

          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '14px' }}>
            <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>ISOLATED MODULES</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: metrics.isolatedFiles.length > 0 ? '#fbbf24' : '#22c55e', marginTop: '3px' }}>
              {metrics.isolatedFiles.length}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>0 incoming / 0 outgoing</div>
          </div>

          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '14px' }}>
            <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>CIRCULAR DEPENDENCIES</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: metrics.uniqueCycles.length > 0 ? '#ef4444' : '#22c55e', marginTop: '3px' }}>
              {metrics.uniqueCycles.length}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>Cycle import loops</div>
          </div>
        </div>

        {/* Circular Dependency Warning Banner */}
        {metrics.uniqueCycles.length > 0 ? (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '6px',
              padding: '16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontWeight: 700, fontSize: '13px', marginBottom: '8px' }}>
              <AlertTriangle size={16} />
              Detected {metrics.uniqueCycles.length} Circular Dependency Loop{metrics.uniqueCycles.length === 1 ? '' : 's'}
            </div>
            <div style={{ fontSize: '11px', color: '#fca5a5', lineHeight: 1.5, marginBottom: '12px' }}>
              Circular dependencies complicate module initialization, prevent tree shaking, and create tight coupling risks.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {metrics.uniqueCycles.map((cycle, idx) => (
                <div
                  key={idx}
                  style={{
                    background: '#09090d',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    padding: '8px 12px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: '#f87171',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <Repeat size={12} />
                    <span>{cycle.join(' → ')}</span>
                  </div>
                  <button
                    onClick={() => onInspect(cycle[0])}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      borderRadius: '3px',
                      color: '#f87171',
                      fontSize: '10px',
                      padding: '2px 6px',
                      cursor: 'pointer'
                    }}
                  >
                    Inspect
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div
            style={{
              background: 'rgba(34, 197, 94, 0.06)',
              border: '1px solid rgba(34, 197, 94, 0.25)',
              borderRadius: '6px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <CheckCircle2 size={16} color="#22c55e" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '11px', color: '#86efac' }}>
              <strong>Clean DAG Architecture:</strong> Zero circular dependencies detected in this project.
            </div>
          </div>
        )}

        {/* Two-Column Breakdown: Fan-In vs Fan-Out */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Highest Fan-In (Most Depended Upon) */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#ededf0', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Most Depended-Upon (Highest Fan-In)
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  High blast radius modules imported by the most files
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {metrics.sortedByFanIn.slice(0, 6).map((file) => (
                <div
                  key={file.path}
                  onClick={() => onInspect(file.path)}
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#6B9BCB')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#ededf0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {file.name}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {file.path}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span
                      style={{
                        padding: '2px 7px',
                        borderRadius: '3px',
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#ef4444',
                        fontSize: '10px',
                        fontWeight: 700
                      }}
                    >
                      {file.fanIn} dependent{file.fanIn === 1 ? '' : 's'}
                    </span>
                    <ArrowRight size={12} color="var(--text-muted)" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Highest Fan-Out (Imports the Most) */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#ededf0', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Heaviest Consumers (Highest Fan-Out)
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Modules relying on the most external dependencies
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {metrics.sortedByFanOut.slice(0, 6).map((file) => (
                <div
                  key={file.path}
                  onClick={() => onInspect(file.path)}
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#fb923c')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#ededf0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {file.name}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {file.path}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span
                      style={{
                        padding: '2px 7px',
                        borderRadius: '3px',
                        background: 'rgba(251, 146, 60, 0.15)',
                        border: '1px solid rgba(251, 146, 60, 0.3)',
                        color: '#fb923c',
                        fontSize: '10px',
                        fontWeight: 700
                      }}
                    >
                      {file.fanOut} import{file.fanOut === 1 ? '' : 's'}
                    </span>
                    <ArrowRight size={12} color="var(--text-muted)" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Isolated & Standalone Modules */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#ededf0', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Isolated Files ({metrics.isolatedFiles.length})
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Files that neither import anything nor are imported by any module (potential dead code or standalone configs)
              </div>
            </div>
          </div>

          {metrics.isolatedFiles.length === 0 ? (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
              No isolated files found. All modules in this repository are actively connected to the graph.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
              {metrics.isolatedFiles.map((file) => (
                <div
                  key={file.path}
                  onClick={() => onInspect(file.path)}
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    padding: '8px 10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#ededf0' }}>{file.name}</div>
                    <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{file.path}</div>
                  </div>
                  <span style={{ fontSize: '9px', color: '#fbbf24', background: 'rgba(251, 191, 36, 0.1)', padding: '2px 5px', borderRadius: '3px' }}>
                    Isolated
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

