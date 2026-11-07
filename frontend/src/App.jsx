import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  MarkerType,
  getNodesBounds,
  getViewportForBounds
} from '@xyflow/react'
import { toPng, toSvg } from 'html-to-image'
import '@xyflow/react/dist/style.css'
import { apiUrl } from './apiConfig'
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
  Database,
  ArrowRight,
  Info,
  Radio,
  FileText,
  Activity,
  GitBranch,
  ShieldAlert,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Terminal,
  Palette,
  BookOpen,
  Trash2,
  AlertTriangle,
  ExternalLink,
  LogIn,
  LogOut,
  User,
  LayoutDashboard,
  Check,
  FileImage,
  Code
} from 'lucide-react'
import { FileNode } from './FileNode'
import { HelpGuide } from './HelpGuide'
import { AuthPage } from './AuthPage'
import { Dashboard } from './Dashboard'
import { useAuth } from './AuthContext'
import { UserAvatar } from './UserAvatar'
import { ProjectExplorer } from './ProjectExplorer'
import { TopNav } from './components/TopNav'
import { WorkspacePage } from './pages/WorkspacePage'
import { GraphStudioPage } from './pages/GraphStudioPage'
import { ImpactPage } from './pages/ImpactPage'
import { AskPage } from './pages/AskPage'
import { InsightsPage } from './pages/InsightsPage'
import { ReportsPage } from './pages/ReportsPage'
import { SetupWizardModal } from './components/SetupWizardModal'

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

// Build shared adjacency/layer structures used by both layout modes.
function buildLayerMap(nodesData, edgesData) {
  const inDegree = {}
  const outEdges = {}
  const inEdges = {}
  nodesData.forEach((n) => {
    inDegree[n.path] = 0
    outEdges[n.path] = []
    inEdges[n.path] = []
  })
  edgesData.forEach((e) => {
    if (e.source === e.target) return
    if (inDegree[e.target] !== undefined) inDegree[e.target]++
    if (outEdges[e.source]) outEdges[e.source].push(e.target)
    if (inEdges[e.target]) inEdges[e.target].push(e.source)
  })

  // Kahn's BFS — assign longest-path layer
  const nodeLayer = {}
  const inDegreeCopy = { ...inDegree }
  const queue = nodesData.filter((n) => inDegreeCopy[n.path] === 0).map((n) => n.path)
  queue.forEach((id) => { nodeLayer[id] = 0 })

  let head = 0
  while (head < queue.length) {
    const curr = queue[head++]
    const currLayer = nodeLayer[curr]
    ;(outEdges[curr] || []).forEach((next) => {
      const proposed = currLayer + 1
      if (nodeLayer[next] === undefined || nodeLayer[next] < proposed) {
        nodeLayer[next] = proposed
      }
      inDegreeCopy[next]--
      if (inDegreeCopy[next] === 0) queue.push(next)
    })
  }

  // Handle remaining (cycles / disconnected)
  const maxLayer = nodesData.reduce((max, n) => {
    const l = nodeLayer[n.path]
    return l !== undefined && l > max ? l : max
  }, 0)
  nodesData.forEach((n) => {
    if (nodeLayer[n.path] === undefined) nodeLayer[n.path] = maxLayer + 1
  })

  // Group by layer
  const layers = {}
  nodesData.forEach((n) => {
    const l = nodeLayer[n.path]
    if (!layers[l]) layers[l] = []
    layers[l].push(n.path)
  })

  return { nodeLayer, outEdges, inEdges, layers, inDegree }
}

// Build the standard flow edges (shared between both modes)
function buildFlowEdges(edgesData) {
  return edgesData
    .filter((e) => e.source !== e.target)
    .map((e, idx) => ({
      id: `edge-${idx}`,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      animated: false,
      style: { stroke: '#ffffff', strokeWidth: 1.8 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: '#ffffff'
      }
    }))
}

// Mode 1 — DAG / Hierarchical Dependencies layout.
// Layers from Kahn's BFS. Within each layer, nodes are sorted by the
// barycenter heuristic (mean x-position of their parents) to reduce crossings.
function dagLayout(nodesData, edgesData) {
  if (!nodesData || nodesData.length === 0) return { nodes: [], edges: [] }

  const { nodeLayer, inEdges, layers } = buildLayerMap(nodesData, edgesData)
  const pathToData = {}
  nodesData.forEach((n) => { pathToData[n.path] = n })

  const NODE_W = 220
  const NODE_H = 90
  const H_GAP = 60   // moderate horizontal gap
  const V_GAP = 120  // moderate vertical gap

  const nodeX = {}  // path → final x centre
  const flowNodes = []
  const layerKeys = Object.keys(layers).map(Number).sort((a, b) => a - b)

  layerKeys.forEach((layerIdx) => {
    const layerPaths = layers[layerIdx]

    // Sort by mean parent x (barycenter) to minimise edge crossings
    const sorted = layerPaths.slice().sort((a, b) => {
      const parentsA = inEdges[a] || []
      const parentsB = inEdges[b] || []
      const meanA = parentsA.length
        ? parentsA.reduce((s, p) => s + (nodeX[p] ?? 0), 0) / parentsA.length
        : 0
      const meanB = parentsB.length
        ? parentsB.reduce((s, p) => s + (nodeX[p] ?? 0), 0) / parentsB.length
        : 0
      return meanA - meanB
    })

    const totalWidth = sorted.length * NODE_W + (sorted.length - 1) * H_GAP
    const startX = -totalWidth / 2

    sorted.forEach((path, i) => {
      const x = startX + i * (NODE_W + H_GAP)
      nodeX[path] = x + NODE_W / 2  // centre of the node

      flowNodes.push({
        id: path,
        type: 'fileNode',
        position: {
          x,
          y: layerIdx * (NODE_H + V_GAP) + 60
        },
        data: {
          ...pathToData[path],
          handleOrientation: 'vertical',
          targetPosition: 'top',
          sourcePosition: 'bottom',
          isTarget: false,
          isAffected: false,
          isDependency: false
        }
      })
    })
  })

  return { nodes: flowNodes, edges: buildFlowEdges(edgesData) }
}

// Mode 2 — Layered Tree layout.
// Nodes are positioned by subtree width so each subtree is centred under its
// parent with generous vertical spacing. Shared nodes (DAG diamonds) are placed
// once using the first-encountered parent; all edges still render.
function treeLayout(nodesData, edgesData) {
  if (!nodesData || nodesData.length === 0) return { nodes: [], edges: [] }

  const { nodeLayer, outEdges, inDegree } = buildLayerMap(nodesData, edgesData)
  const pathToData = {}
  nodesData.forEach((n) => { pathToData[n.path] = n })

  const NODE_W = 220
  const NODE_H = 90
  const H_GAP = 90   // wider horizontal gap for clear branch separation
  const V_GAP = 160  // taller vertical gap for tree clarity

  // Compute subtree width (in units of NODE_W + H_GAP) for each node using
  // post-order DFS. Nodes with multiple parents counted only once.
  const subtreeWidth = {}
  const visited = new Set()

  function computeSubtree(path) {
    if (visited.has(path)) {
      subtreeWidth[path] = subtreeWidth[path] ?? 1
      return subtreeWidth[path]
    }
    visited.add(path)
    const children = outEdges[path] || []
    if (children.length === 0) {
      subtreeWidth[path] = 1
    } else {
      subtreeWidth[path] = children.reduce((sum, c) => sum + computeSubtree(c), 0)
    }
    return subtreeWidth[path]
  }

  // Start from roots (in-degree 0)
  const roots = nodesData.filter((n) => inDegree[n.path] === 0).map((n) => n.path)
  roots.forEach(computeSubtree)
  // Fallback: any node not yet visited
  nodesData.forEach((n) => { if (!visited.has(n.path)) computeSubtree(n.path) })

  const nodeX = {}
  const positionedSet = new Set()
  const flowNodes = []

  // DFS to assign x positions: each node is centred over the x-span of its subtree.
  function assignPositions(path, leftBoundary) {
    if (positionedSet.has(path)) return leftBoundary
    positionedSet.add(path)

    const children = outEdges[path] || []
    const myWidth = subtreeWidth[path] * (NODE_W + H_GAP) - H_GAP

    if (children.length === 0) {
      nodeX[path] = leftBoundary + NODE_W / 2
    } else {
      // Recursively position children left-to-right
      let cursor = leftBoundary
      children.forEach((child) => {
        if (!positionedSet.has(child)) {
          cursor = assignPositions(child, cursor)
          cursor += H_GAP  // gap between siblings
        }
      })
      // Centre this node over its children span
      const firstChildX = nodeX[children.find((c) => nodeX[c] !== undefined)] ?? leftBoundary + NODE_W / 2
      const lastChild = [...children].reverse().find((c) => nodeX[c] !== undefined)
      const lastChildX = lastChild ? nodeX[lastChild] : firstChildX
      nodeX[path] = (firstChildX + lastChildX) / 2
    }

    return leftBoundary + myWidth
  }

  // Calculate total width of all roots to centre the whole tree
  const totalRootWidth = roots.reduce((s, r) => s + subtreeWidth[r] * (NODE_W + H_GAP), 0) - H_GAP
  let cursor = -totalRootWidth / 2
  roots.forEach((r) => {
    cursor = assignPositions(r, cursor) + H_GAP
  })

  // Handle any remaining unpositioned nodes (isolated / in cycles)
  let isolatedX = cursor
  nodesData.forEach((n) => {
    if (!positionedSet.has(n.path)) {
      nodeX[n.path] = isolatedX + NODE_W / 2
      isolatedX += NODE_W + H_GAP
    }
  })

  // Build flow nodes using computed x and layer-based y
  nodesData.forEach((n) => {
    const layer = nodeLayer[n.path] ?? 0
    flowNodes.push({
      id: n.path,
      type: 'fileNode',
      position: {
        x: (nodeX[n.path] ?? 0) - NODE_W / 2,
        y: layer * (NODE_H + V_GAP) + 60
      },
      data: {
        ...n,
        handleOrientation: 'vertical',
        targetPosition: 'top',
        sourcePosition: 'bottom',
        isTarget: false,
        isAffected: false,
        isDependency: false
      }
    })
  })

  return { nodes: flowNodes, edges: buildFlowEdges(edgesData) }
}

// Mode 3 — Horizontal Architecture Flow Layout.
// Left-to-right DAG layout with topological layering.
// Entry points appear on the left (Layer 0), downstream dependencies toward the right.
// Barycenter sorting minimizes vertical edge crossings.
function horizontalDagLayout(nodesData, edgesData) {
  if (!nodesData || nodesData.length === 0) return { nodes: [], edges: [] }

  const { inEdges, layers } = buildLayerMap(nodesData, edgesData)
  const pathToData = {}
  nodesData.forEach((n) => { pathToData[n.path] = n })

  const NODE_W = 220
  const NODE_H = 88
  const H_GAP = 120 // horizontal column spacing between dependency tiers
  const V_GAP = 40  // vertical row spacing within each tier

  const nodeY = {}  // path → final y centre
  const flowNodes = []
  const layerKeys = Object.keys(layers).map(Number).sort((a, b) => a - b)

  layerKeys.forEach((layerIdx) => {
    const layerPaths = layers[layerIdx]

    // Sort by mean parent Y (barycenter heuristic) to minimize edge crossings
    const sorted = layerPaths.slice().sort((a, b) => {
      const parentsA = inEdges[a] || []
      const parentsB = inEdges[b] || []
      const meanA = parentsA.length
        ? parentsA.reduce((s, p) => s + (nodeY[p] ?? 0), 0) / parentsA.length
        : 0
      const meanB = parentsB.length
        ? parentsB.reduce((s, p) => s + (nodeY[p] ?? 0), 0) / parentsB.length
        : 0
      return meanA - meanB
    })

    const totalHeight = sorted.length * NODE_H + (sorted.length - 1) * V_GAP
    const startY = -totalHeight / 2

    sorted.forEach((path, i) => {
      const x = layerIdx * (NODE_W + H_GAP) + 60
      const y = startY + i * (NODE_H + V_GAP)
      nodeY[path] = y + NODE_H / 2

      flowNodes.push({
        id: path,
        type: 'fileNode',
        position: { x, y },
        data: {
          ...pathToData[path],
          handleOrientation: 'horizontal',
          targetPosition: 'left',
          sourcePosition: 'right',
          isTarget: false,
          isAffected: false,
          isDependency: false
        }
      })
    })
  })

  return { nodes: flowNodes, edges: buildFlowEdges(edgesData) }
}

// Mode 4 — Radial Blast-Radius Layout.
// Places the currently selected file at the center (0, 0).
// Direct dependencies and direct importers are placed in Ring 1.
// Transitive affected files and deeper dependencies are placed in subsequent concentric rings.
// Remaining project files are arranged in an outer peripheral ring.
function radialBlastLayout(nodesData, edgesData, selectedPath = null) {
  if (!nodesData || nodesData.length === 0) return { nodes: [], edges: [] }

  const pathToData = {}
  nodesData.forEach((n) => { pathToData[n.path] = n })

  // 1. Determine the center node (active selection or natural hub/entrypoint)
  let center = selectedPath && pathToData[selectedPath] ? selectedPath : null
  if (!center) {
    const degree = {}
    nodesData.forEach((n) => { degree[n.path] = 0 })
    edgesData.forEach((e) => {
      if (degree[e.source] !== undefined) degree[e.source]++
      if (degree[e.target] !== undefined) degree[e.target]++
    })
    const entry = nodesData.find((n) => /^(index|app|server|main)\./i.test(n.name))
    if (entry) {
      center = entry.path
    } else {
      let maxDeg = -1
      nodesData.forEach((n) => {
        if (degree[n.path] > maxDeg) {
          maxDeg = degree[n.path]
          center = n.path
        }
      })
      if (!center) center = nodesData[0].path
    }
  }

  // 2. Build bidirectional adjacency to traverse blast radius hops from center
  const adj = {}
  nodesData.forEach((n) => { adj[n.path] = [] })
  edgesData.forEach((e) => {
    if (e.source === e.target) return
    if (adj[e.source]) adj[e.source].push(e.target)
    if (adj[e.target]) adj[e.target].push(e.source)
  })

  // 3. BFS partitioning into concentric rings
  const rings = {}
  const visited = new Set([center])
  const queue = [{ path: center, ring: 0 }]
  rings[0] = [center]

  let maxRing = 0
  let head = 0
  while (head < queue.length) {
    const { path, ring } = queue[head++]
    const neighbors = adj[path] || []
    for (const n of neighbors) {
      if (!visited.has(n)) {
        visited.add(n)
        const nextRing = ring + 1
        if (!rings[nextRing]) rings[nextRing] = []
        rings[nextRing].push(n)
        if (nextRing > maxRing) maxRing = nextRing
        queue.push({ path: n, ring: nextRing })
      }
    }
  }

  // Unconnected / isolated nodes placed in outer peripheral ring
  const unvisited = nodesData.filter((n) => !visited.has(n.path)).map((n) => n.path)
  if (unvisited.length > 0) {
    rings[maxRing + 1] = unvisited
    maxRing += 1
  }

  const NODE_W = 220
  const NODE_H = 88
  const flowNodes = []

  // Position center node at (0, 0)
  flowNodes.push({
    id: center,
    type: 'fileNode',
    position: { x: -NODE_W / 2, y: -NODE_H / 2 },
    data: {
      ...pathToData[center],
      handleOrientation: 'radial',
      targetPosition: 'left',
      sourcePosition: 'right',
      isTarget: false,
      isAffected: false,
      isDependency: false
    }
  })

  // Position each concentric ring
  for (let r = 1; r <= maxRing; r++) {
    const ringPaths = rings[r] || []
    if (ringPaths.length === 0) continue

    let radius = 320
    if (r === 2) radius = 580
    else if (r >= 3) radius = 580 + (r - 2) * 260

    // Ensure circumference accommodates node width and padding
    const minCircumference = ringPaths.length * (NODE_W + 50)
    const minRadius = minCircumference / (2 * Math.PI)
    if (radius < minRadius) radius = minRadius

    const angleStep = (2 * Math.PI) / ringPaths.length
    const ringAngleOffset = (r * Math.PI) / 6 // Stagger rings to prevent radial overlap

    ringPaths.forEach((path, idx) => {
      const angle = idx * angleStep - Math.PI / 2 + ringAngleOffset
      const x = radius * Math.cos(angle) - NODE_W / 2
      const y = radius * Math.sin(angle) - NODE_H / 2

      // Determine handle positions facing center
      const cosA = Math.cos(angle)
      const targetPosition = cosA >= 0 ? 'left' : 'right'
      const sourcePosition = cosA >= 0 ? 'right' : 'left'

      flowNodes.push({
        id: path,
        type: 'fileNode',
        position: { x, y },
        data: {
          ...pathToData[path],
          handleOrientation: 'radial',
          targetPosition,
          sourcePosition,
          isTarget: false,
          isAffected: false,
          isDependency: false
        }
      })
    })
  }

  return { nodes: flowNodes, edges: buildFlowEdges(edgesData) }
}

// Layout dispatcher — routes to the correct algorithm based on graphMode.
function calculateLayout(nodesData, edgesData, mode = 'dependency', selectedPath = null) {
  if (mode === 'horizontal') return horizontalDagLayout(nodesData, edgesData)
  if (mode === 'radial') return radialBlastLayout(nodesData, edgesData, selectedPath)
  if (mode === 'tree') return treeLayout(nodesData, edgesData)
  return dagLayout(nodesData, edgesData)
}

// BFS to find the shortest ordered dependency path from startPath to targetPath along graph edges
function findDependencyPath(edges, startPath, targetPath) {
  if (!startPath || !targetPath) return []
  if (startPath === targetPath) return [startPath]
  const adj = {}
  edges.forEach((e) => {
    if (!adj[e.source]) adj[e.source] = []
    adj[e.source].push(e.target)
  })

  const queue = [[startPath]]
  const visited = new Set([startPath])

  while (queue.length > 0) {
    const currentPath = queue.shift()
    const lastNode = currentPath[currentPath.length - 1]

    const neighbors = adj[lastNode] || []
    for (const neighbor of neighbors) {
      if (neighbor === targetPath) {
        return [...currentPath, targetPath]
      }
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push([...currentPath, neighbor])
      }
    }
  }

  return [startPath, targetPath]
}

// Dynamic Query Result Table component
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

export default function App() {
  const { user, idToken, loading: authLoading, signOut, getIdToken } = useAuth()
  const [showDesktopWizard, setShowDesktopWizard] = useState(
    typeof window !== 'undefined' && Boolean(window.electronAPI && window.electronAPI.isDesktop)
  )
  const [activeTab, setActiveTab] = useState('Workspace')
  const [activeProjectId, setActiveProjectId] = useState('sample-repo')
  const [graphMode, setGraphMode] = useState('dependency')
  const [showMinimap, setShowMinimap] = useState(true)
  const [showLegend, setShowLegend] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [centerTarget, setCenterTarget] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [impactData, setImpactData] = useState(null)
  const [loadingImpact, setLoadingImpact] = useState(false)
  const [rawGraph, setRawGraph] = useState({ nodes: [], edges: [] })
  const [loadingGraph, setLoadingGraph] = useState(true)
  const [graphError, setGraphError] = useState(null)

  // Simulation & path highlighting state
  const [analysisMode, setAnalysisMode] = useState('modify') // 'modify' | 'delete'
  const [expandedPathFiles, setExpandedPathFiles] = useState(new Set())
  const [activeHighlightedPath, setActiveHighlightedPath] = useState(null)

  // Natural Language Query state
  const [nlQuestion, setNlQuestion] = useState('')
  const [nlResponse, setNlResponse] = useState(null)
  const [nlLoading, setNlLoading] = useState(false)

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  // Incrementing this triggers <GraphNavigator> to call fitView() after a layout change
  const [fitViewTrigger, setFitViewTrigger] = useState(0)

  // Export menu & feedback state
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [exportingFormat, setExportingFormat] = useState(null) // 'png' | 'svg' | 'json' | null
  const [exportFeedback, setExportFeedback] = useState(null) // { type: 'success' | 'error', message: string }
  const [reactFlowInstance, setReactFlowInstance] = useState(null)
  const reactFlowWrapperRef = useRef(null)

  // Normalized query and matching graph node IDs for Explorer & Graph synchronization
  const normalizedSearchQuery = useMemo(() => {
    return searchQuery.trim().toLowerCase().replace(/\\/g, '/')
  }, [searchQuery])

  const matchingGraphNodeIds = useMemo(() => {
    if (!normalizedSearchQuery) return null
    const q = normalizedSearchQuery
    const ids = new Set()
    ;(rawGraph.nodes || []).forEach((n) => {
      const normPath = (n.path || n.id || '').toLowerCase().replace(/\\/g, '/')
      const normName = (n.name || '').toLowerCase()
      if (normPath.includes(q) || normName.includes(q)) {
        ids.add(n.path)
        if (n.id) ids.add(n.id)
      }
    })
    return ids
  }, [normalizedSearchQuery, rawGraph.nodes])

  // Re-style edges based on active highlighted path and search query
  const updateEdgeStyles = useCallback((edgesList, pathNodes, mode = 'modify', overrideMatchingIds = null) => {
    const isSearchActive = Boolean(normalizedSearchQuery)
    const matchingIds = overrideMatchingIds !== null ? overrideMatchingIds : matchingGraphNodeIds

    const hasPath = pathNodes && pathNodes.length >= 2
    const pathEdgeKeys = new Set()
    if (hasPath) {
      for (let i = 0; i < pathNodes.length - 1; i++) {
        pathEdgeKeys.add(`${pathNodes[i]}->${pathNodes[i + 1]}`)
      }
    }

    const highlightColor = mode === 'delete' ? '#ef4444' : '#f97316'

    return (edgesList || []).map((e) => {
      // 1. Path edges always take top priority (Requirement 7)
      const isPathEdge = pathEdgeKeys.has(`${e.source}->${e.target}`)
      if (isPathEdge) {
        return {
          ...e,
          style: { stroke: highlightColor, strokeWidth: 2.8, opacity: 1 },
          animated: true,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 18,
            height: 18,
            color: highlightColor
          }
        }
      }

      // If a path is highlighted, other non-path edges are already dimmed for path visibility
      if (hasPath) {
        return {
          ...e,
          style: { stroke: 'rgba(255, 255, 255, 0.12)', strokeWidth: 1, opacity: isSearchActive ? 0.12 : 0.25 },
          animated: false,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: 'rgba(255, 255, 255, 0.15)'
          }
        }
      }

      // 2. Search is active: dim edges unless connecting matching nodes (Requirement 2)
      if (isSearchActive && matchingIds) {
        const sourceMatches = matchingIds.has(e.source)
        const targetMatches = matchingIds.has(e.target)

        if (sourceMatches && targetMatches) {
          // Both ends match: fully visible
          return {
            ...e,
            style: { stroke: '#ffffff', strokeWidth: 1.8, opacity: 1 },
            animated: false,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 16,
              height: 16,
              color: '#ffffff'
            }
          }
        } else if (sourceMatches || targetMatches) {
          // One end matches: moderate visibility
          return {
            ...e,
            style: { stroke: 'rgba(255, 255, 255, 0.28)', strokeWidth: 1.2, opacity: 0.4 },
            animated: false,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 14,
              height: 14,
              color: 'rgba(255, 255, 255, 0.25)'
            }
          }
        } else {
          // Neither end matches: subtly dimmed
          return {
            ...e,
            style: { stroke: 'rgba(255, 255, 255, 0.08)', strokeWidth: 1, opacity: 0.15 },
            animated: false,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 12,
              height: 12,
              color: 'rgba(255, 255, 255, 0.12)'
            }
          }
        }
      }

      // 3. Normal edge styling when search is cleared and no path is active (Requirement 6)
      return {
        ...e,
        style: { stroke: '#ffffff', strokeWidth: 1.8, opacity: 1 },
        animated: false,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: '#ffffff'
        }
      }
    })
  }, [normalizedSearchQuery, matchingGraphNodeIds])

  // Synchronize graph nodes and edges whenever search query changes
  useEffect(() => {
    const isSearchActive = Boolean(normalizedSearchQuery)
    const matchingIds = matchingGraphNodeIds

    setNodes((prevNodes) => {
      let hasChanges = false
      const nextNodes = prevNodes.map((n) => {
        const isMatch = isSearchActive && Boolean(matchingIds && (matchingIds.has(n.id) || matchingIds.has(n.data?.path)))
        const isDimmed = isSearchActive && !isMatch

        if (
          Boolean(n.data?.isSearchActive) === isSearchActive &&
          Boolean(n.data?.isSearchMatch) === isMatch &&
          Boolean(n.data?.isSearchDimmed) === isDimmed
        ) {
          return n
        }

        hasChanges = true
        return {
          ...n,
          data: {
            ...n.data,
            isSearchActive,
            isSearchMatch: isMatch,
            isSearchDimmed: isDimmed
          }
        }
      })
      return hasChanges ? nextNodes : prevNodes
    })

    setEdges((prevEdges) => updateEdgeStyles(prevEdges, activeHighlightedPath, analysisMode))
  }, [normalizedSearchQuery, matchingGraphNodeIds, activeHighlightedPath, analysisMode, updateEdgeStyles, setNodes, setEdges])

  // Fetch initial graph from /api/graph scoped to activeProjectId
  const fetchGraph = useCallback(async () => {
    setLoadingGraph(true)
    setGraphError(null)
    try {
      const token = typeof getIdToken === 'function' ? await getIdToken() : idToken
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(apiUrl(`/graph?projectId=${encodeURIComponent(activeProjectId)}`), { headers })
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}: ${res.statusText}`)
      }
      const data = await res.json()
      setRawGraph(data)
      const { nodes: initNodes, edges: initEdges } = calculateLayout(data.nodes || [], data.edges || [], graphMode, selectedFile?.path)

      const isSearchActive = Boolean(normalizedSearchQuery)
      const matchingIds = matchingGraphNodeIds
      const annotatedNodes = initNodes.map((n) => {
        const isMatch = isSearchActive && Boolean(matchingIds && (matchingIds.has(n.id) || matchingIds.has(n.data?.path)))
        return {
          ...n,
          data: {
            ...n.data,
            isSearchActive,
            isSearchMatch: isMatch,
            isSearchDimmed: isSearchActive && !isMatch
          }
        }
      })

      setNodes(annotatedNodes)
      setEdges(updateEdgeStyles(initEdges, null))
      setFitViewTrigger((t) => t + 1)
    } catch (err) {
      setGraphError(err.message)
    } finally {
      setLoadingGraph(false)
    }
  }, [setNodes, setEdges, activeProjectId, graphMode, idToken, getIdToken, selectedFile?.path, normalizedSearchQuery, matchingGraphNodeIds, updateEdgeStyles])

  useEffect(() => {
    fetchGraph()
  }, [fetchGraph])

  // Recalculate layout on mode change
  const handleModeChange = (newMode) => {
    setGraphMode(newMode)
    if (!rawGraph.nodes || rawGraph.nodes.length === 0) return
    const { nodes: layoutNodes, edges: layoutEdges } = calculateLayout(rawGraph.nodes, rawGraph.edges, newMode, selectedFile?.path)

    const isSearchActive = Boolean(normalizedSearchQuery)
    const matchingIds = matchingGraphNodeIds

    // Preserve selection, impact state, and search state
    let updatedNodes = layoutNodes
    if (selectedFile) {
      const affectedPaths = new Set((impactData?.affectedFiles || []).map((f) => f.path))
      const directDepPaths = new Set(
        rawGraph.edges.filter((e) => e.source === selectedFile.path).map((e) => e.target)
      )
      updatedNodes = layoutNodes.map((node) => {
        const isTarget = node.id === selectedFile.path
        const isAffected = !isTarget && affectedPaths.has(node.id)
        const isDependency = !isTarget && !isAffected && directDepPaths.has(node.id)
        const isMatch = isSearchActive && Boolean(matchingIds && (matchingIds.has(node.id) || matchingIds.has(node.data?.path)))
        return {
          ...node,
          selected: isTarget,
          data: {
            ...node.data,
            isTarget,
            isAffected,
            isDependency,
            isSearchActive,
            isSearchMatch: isMatch,
            isSearchDimmed: isSearchActive && !isMatch
          }
        }
      })
    } else {
      updatedNodes = layoutNodes.map((node) => {
        const isMatch = isSearchActive && Boolean(matchingIds && (matchingIds.has(node.id) || matchingIds.has(node.data?.path)))
        return {
          ...node,
          data: {
            ...node.data,
            isSearchActive,
            isSearchMatch: isMatch,
            isSearchDimmed: isSearchActive && !isMatch
          }
        }
      })
    }

    setNodes(updatedNodes)
    setEdges(activeHighlightedPath ? updateEdgeStyles(layoutEdges, activeHighlightedPath, analysisMode) : updateEdgeStyles(layoutEdges, null))
    setFitViewTrigger((t) => t + 1)
  }

  // Handle file selection and transitive impact fetch
  const handleSelectFile = async (filePath, rawFileInfo = null) => {
    // 1. Check if the file is an analysed graph node (matching full path or basename)
    let fileObj = rawGraph.nodes.find(
      (n) => n.path === filePath || n.name === filePath || (filePath.endsWith('/' + n.name) || filePath.endsWith('\\' + n.name))
    )

    // 2. If it's not a graph node (unsupported/raw file in manifest), create a preview object
    if (!fileObj) {
      const fileName = rawFileInfo?.name || filePath.split('/').pop().split('\\').pop()
      fileObj = {
        path: filePath,
        name: fileName,
        summary: `This file (${rawFileInfo?.extension || 'resource'}) is part of the repository manifest but is not a JavaScript module analyzed in the dependency graph.`,
        isSupported: false
      }
      setSelectedFile(fileObj)
      setLoadingImpact(false)
      setImpactData(null)
      setActiveHighlightedPath(null)
      setExpandedPathFiles(new Set())
      // Reset ReactFlow selection
      setNodes((nds) => nds.map((n) => ({ ...n, selected: false })))
      setEdges((eds) => updateEdgeStyles(eds, null))
      return
    }

    setSelectedFile(fileObj)
    // Smoothly center the selected node in the viewport (Requirement 3)
    setCenterTarget({ id: fileObj.path, ts: Date.now() })

    setLoadingImpact(true)
    setImpactData(null)
    setActiveHighlightedPath(null)
    setExpandedPathFiles(new Set())

    const isSearchActive = Boolean(normalizedSearchQuery)
    const matchingIds = matchingGraphNodeIds

    const annotateNode = (node, isTarget, isAffected, isDependency) => {
      const isMatch = isSearchActive && Boolean(matchingIds && (matchingIds.has(node.id) || matchingIds.has(node.data?.path)))
      return {
        ...node,
        selected: isTarget,
        data: {
          ...node.data,
          isTarget,
          isAffected,
          isDependency,
          isSearchActive,
          isSearchMatch: isMatch,
          isSearchDimmed: isSearchActive && !isMatch
        }
      }
    }

    try {
      // Direct outgoing dependencies from raw edges
      const directDepPaths = new Set(
        rawGraph.edges.filter((e) => e.source === fileObj.path).map((e) => e.target)
      )

      const token = typeof getIdToken === 'function' ? await getIdToken() : idToken
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(apiUrl(`/impact/${encodeURIComponent(fileObj.name)}?projectId=${encodeURIComponent(activeProjectId)}`), { headers })
      if (res.ok) {
        const impact = await res.json()
        setImpactData(impact)

        // Highlight nodes on React Flow
        const affectedPaths = new Set((impact.affectedFiles || []).map((f) => f.path))

        // If in radial mode, recalculate layout to place selected node at center
        if (graphMode === 'radial') {
          const { nodes: radialNodes, edges: radialEdges } = calculateLayout(rawGraph.nodes, rawGraph.edges, 'radial', fileObj.path)
          setNodes(
            radialNodes.map((node) => {
              const isTarget = node.id === fileObj.path
              const isAffected = !isTarget && affectedPaths.has(node.id)
              const isDependency = !isTarget && !isAffected && directDepPaths.has(node.id)
              return annotateNode(node, isTarget, isAffected, isDependency)
            })
          )
          setEdges(updateEdgeStyles(radialEdges, null))
          setFitViewTrigger((t) => t + 1)
        } else {
          setNodes((nds) =>
            nds.map((node) => {
              const isTarget = node.id === fileObj.path
              const isAffected = !isTarget && affectedPaths.has(node.id)
              const isDependency = !isTarget && !isAffected && directDepPaths.has(node.id)
              return annotateNode(node, isTarget, isAffected, isDependency)
            })
          )
          setEdges((eds) => updateEdgeStyles(eds, null))
        }
      } else {
        setImpactData({ file: fileObj, affectedFiles: [] })
        if (graphMode === 'radial') {
          const { nodes: radialNodes, edges: radialEdges } = calculateLayout(rawGraph.nodes, rawGraph.edges, 'radial', fileObj.path)
          setNodes(
            radialNodes.map((node) => annotateNode(node, node.id === fileObj.path, false, directDepPaths.has(node.id)))
          )
          setEdges(updateEdgeStyles(radialEdges, null))
          setFitViewTrigger((t) => t + 1)
        } else {
          setNodes((nds) =>
            nds.map((node) => annotateNode(node, node.id === fileObj.path, false, directDepPaths.has(node.id)))
          )
          setEdges((eds) => updateEdgeStyles(eds, null))
        }
      }
    } catch (_) {
      setImpactData({ file: fileObj, affectedFiles: [] })
    } finally {
      setLoadingImpact(false)
    }
  }

  // Highlight complete path from an affected file to the target in the graph
  const handleHighlightPath = (aff) => {
    const pathNodes = aff.dependencyPath && aff.dependencyPath.length > 0
      ? aff.dependencyPath
      : [aff.path, selectedFile?.path].filter(Boolean)

    setActiveHighlightedPath(pathNodes)
    setEdges((eds) => updateEdgeStyles(eds, pathNodes, analysisMode))

    // Select the affected node in React Flow
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        selected: node.id === aff.path
      }))
    )

    // Automatically expand this file's path card
    setExpandedPathFiles((prev) => {
      const next = new Set(prev)
      next.add(aff.path)
      return next
    })
  }

  // Toggle path card expansion
  const toggleExpand = (filePath, e) => {
    e?.stopPropagation()
    setExpandedPathFiles((prev) => {
      const next = new Set(prev)
      if (next.has(filePath)) next.delete(filePath)
      else next.add(filePath)
      return next
    })
  }

  // Reset highlighted path on canvas background click
  const handlePaneClick = () => {
    setActiveHighlightedPath(null)
    setEdges((eds) => updateEdgeStyles(eds, null))
  }

  // Normalize affected files: guarantees accurate hops, impactType, and dependencyPath
  // derived from API response or graph edges (1 hop = direct, 2+ hops = transitive)
  const normalizedAffectedFiles = useMemo(() => {
    if (!impactData?.affectedFiles) return []
    return impactData.affectedFiles.map((aff) => {
      let hops = typeof aff.hops === 'number' ? aff.hops : (Number(aff.hops) || null)
      let dependencyPath = Array.isArray(aff.dependencyPath) && aff.dependencyPath.length > 0
        ? aff.dependencyPath
        : null

      // If dependencyPath or hops missing, derive from graph edges using BFS
      if (!dependencyPath || hops === null) {
        if (selectedFile && rawGraph.edges && rawGraph.edges.length > 0) {
          const derived = findDependencyPath(rawGraph.edges, aff.path, selectedFile.path)
          if (derived && derived.length > 1) {
            dependencyPath = derived
            hops = derived.length - 1
          }
        }
      }

      if (!dependencyPath) {
        dependencyPath = [aff.path, selectedFile?.path].filter(Boolean)
      }
      if (hops === null) {
        hops = dependencyPath.length > 1 ? dependencyPath.length - 1 : 1
      }

      const impactType = hops === 1 ? 'direct' : 'indirect'
      const consequence = aff.consequence || (hops === 1
        ? `Direct broken import: Module '${selectedFile?.name}' will fail to resolve (MODULE_NOT_FOUND). Compilation or module loading fails immediately.`
        : `Cascade failure: Runtime calls through intermediate dependencies (${dependencyPath.slice(1, -1).join(' → ')}) will fail when accessing functionality previously provided by '${selectedFile?.name}'.`)

      return {
        ...aff,
        hops,
        impactType,
        dependencyPath,
        unresolvedImport: aff.unresolvedImport || (hops === 1 ? selectedFile?.name : null),
        consequence
      }
    })
  }, [impactData, selectedFile, rawGraph.edges])

  // Derive counts from actual dependency paths and hop counts:
  // 1 hop = direct importer.
  // 2+ hops = transitive dependent.
  const directImporters = useMemo(() => {
    return normalizedAffectedFiles.filter((f) => f.hops === 1)
  }, [normalizedAffectedFiles])

  const transitiveDependents = useMemo(() => {
    return normalizedAffectedFiles.filter((f) => f.hops >= 2)
  }, [normalizedAffectedFiles])

  // Handle Natural Language Query submission
  const handleNlSubmit = async (e) => {
    e?.preventDefault()
    if (!nlQuestion.trim() || nlLoading) return

    setNlLoading(true)
    setNlResponse(null)

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
          question: nlQuestion.trim(),
          projectId: activeProjectId
        })
      })
      const data = await res.json()
      setNlResponse(data)

      // Intent-based routing to existing workspace features:
      // 1. Delete simulation intent: select target file and set analysisMode to 'delete'
      if (data.intent === 'delete_simulation' && data.targetFile) {
        setAnalysisMode('delete')
        await handleSelectFile(data.targetFile)
      } else if (data.intent === 'modify_impact' && data.targetFile) {
        // 2. Modify impact intent: select target file and set analysisMode to 'modify'
        setAnalysisMode('modify')
        await handleSelectFile(data.targetFile)
      } else if (data.intent === 'rename' && data.targetFile) {
        // 3. Rename intent: select target file and highlight direct importers in graph
        await handleSelectFile(data.targetFile)
        if (data.directImporters && data.directImporters.length > 0) {
          const directPaths = new Set(data.directImporters.map((d) => d.path || d.name))
          setNodes((nds) =>
            nds.map((node) => ({
              ...node,
              data: {
                ...node.data,
                isAffected: directPaths.has(node.id)
              }
            }))
          )
        }
      } else if (data.intent === 'file_explanation' && data.targetFile) {
        // 4. File explanation intent: select target file in inspector
        await handleSelectFile(data.targetFile)
      }

      // Highlight matching graph nodes for all query types whenever results are returned
      const resultItems = data.results || data.affectedFiles || data.directImporters || []
      if (Array.isArray(resultItems) && resultItems.length > 0) {
        const resultIdentifiers = new Set()
        resultItems.forEach((r) => {
          if (!r) return
          if (typeof r === 'string') resultIdentifiers.add(r)
          if (r.path) resultIdentifiers.add(r.path)
          if (r.name) resultIdentifiers.add(r.name)
          Object.entries(r).forEach(([k, v]) => {
            if (typeof v === 'string' && (k.endsWith('.path') || k.endsWith('.name'))) {
              resultIdentifiers.add(v)
            } else if (v && typeof v === 'object' && v.properties) {
              if (v.properties.path) resultIdentifiers.add(v.properties.path)
              if (v.properties.name) resultIdentifiers.add(v.properties.name)
            }
          })
        })

        if (resultIdentifiers.size > 0) {
          setNodes((nds) =>
            nds.map((node) => ({
              ...node,
              data: {
                ...node.data,
                isAffected:
                  resultIdentifiers.has(node.id) ||
                  resultIdentifiers.has(node.data?.name) ||
                  resultIdentifiers.has(node.data?.path)
              }
            }))
          )
        }
      }
    } catch (err) {
      setNlResponse({ error: err.message })
    } finally {
      setNlLoading(false)
    }
  }

  // Active manifest files list (if manifest is available, use it; otherwise fallback to graph nodes)
  const allExplorerFiles = useMemo(() => {
    const graphNodePaths = new Set((rawGraph.nodes || []).map((n) => n.path))
    const graphNodeNames = new Set((rawGraph.nodes || []).map((n) => n.name))

    if (rawGraph.manifest && Array.isArray(rawGraph.manifest) && rawGraph.manifest.length > 0) {
      return rawGraph.manifest.map((m) => {
        const inGraph = graphNodePaths.has(m.path) || graphNodeNames.has(m.name)
        return {
          ...m,
          inGraph
        }
      })
    }
    // Fallback: graph nodes marked as inGraph
    return (rawGraph.nodes || []).map((n) => ({
      path: n.path,
      name: n.name,
      isSupported: true,
      inGraph: true,
      category: 'code',
      extension: n.name.slice(n.name.lastIndexOf('.'))
    }))
  }, [rawGraph.manifest, rawGraph.nodes])

  // Filtered files for Left Sidebar (normalizing both search query and paths)
  const filteredFiles = useMemo(() => {
    if (!normalizedSearchQuery) return allExplorerFiles
    const q = normalizedSearchQuery
    return allExplorerFiles.filter((n) => {
      const normPath = (n.path || '').toLowerCase().replace(/\\/g, '/')
      const normName = (n.name || '').toLowerCase()
      return normName.includes(q) || normPath.includes(q)
    })
  }, [allExplorerFiles, normalizedSearchQuery])

  // Download helper for generated blobs or data URLs
  const triggerDownload = (url, filename) => {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  // Calculate sanitized base filename from project name and timestamp
  const getExportFilename = (extension) => {
    const safeProjectName = (activeProjectId || 'project')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .toLowerCase()
    const dateStr = new Date().toISOString().slice(0, 10)
    return `ripplecheck-${safeProjectName}-${graphMode}-${dateStr}.${extension}`
  }

  // 1. Export graph as JSON
  const handleExportJSON = () => {
    if (!rawGraph.nodes || rawGraph.nodes.length === 0) {
      setExportFeedback({ type: 'error', message: 'Graph is empty. Nothing to export.' })
      return
    }
    setExportingFormat('json')
    try {
      const exportPayload = {
        project: activeProjectId,
        exportedAt: new Date().toISOString(),
        layoutMode: graphMode,
        nodesCount: rawGraph.nodes.length,
        edgesCount: rawGraph.edges.length,
        nodes: rawGraph.nodes,
        edges: rawGraph.edges,
        manifest: rawGraph.manifest || []
      }
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportPayload, null, 2))
      triggerDownload(dataStr, getExportFilename('json'))
      setExportFeedback({ type: 'success', message: 'Exported graph JSON successfully.' })
    } catch (err) {
      setExportFeedback({ type: 'error', message: `JSON export failed: ${err.message}` })
    } finally {
      setExportingFormat(null)
      setShowExportMenu(false)
    }
  }

  // Helper to extract clean viewport element and calculate bounding box for full graph capture
  const getFullGraphExportBounds = () => {
    const rfNodes = reactFlowInstance?.getNodes ? reactFlowInstance.getNodes() : nodes
    if (!rfNodes || rfNodes.length === 0) return null

    // Compute bounding box covering all graph nodes
    const bounds = getNodesBounds(rfNodes)
    const padding = 80 // generous balanced padding around graph to prevent clipped endpoints
    const graphWidth = Math.max(bounds.width + padding * 2, 600)
    const graphHeight = Math.max(bounds.height + padding * 2, 400)

    // Dedicated viewport selector scoped strictly within ReactFlow container
    const wrapper = reactFlowWrapperRef.current
    const viewportEl = wrapper ? wrapper.querySelector('.react-flow__viewport') : document.querySelector('.react-flow__viewport')
    return { viewportEl, bounds, graphWidth, graphHeight, padding }
  }

  // 2. Export full graph as high-resolution PNG
  const handleExportPNG = async () => {
    if (!nodes || nodes.length === 0) {
      setExportFeedback({ type: 'error', message: 'Graph is empty. Nothing to export.' })
      return
    }

    setExportingFormat('png')
    setShowExportMenu(false)

    try {
      // Yield to let export menu close and DOM stabilize
      await new Promise((r) => setTimeout(r, 80))

      const exportInfo = getFullGraphExportBounds()
      if (!exportInfo || !exportInfo.viewportEl) {
        throw new Error('Unable to locate graph viewport element.')
      }

      const { viewportEl, bounds, graphWidth, graphHeight, padding } = exportInfo

      // Safe resolution calculation:
      // Target a crisp, highly readable 2.5x density while respecting browser canvas limits (max 8192px / 25M pixels)
      const maxDim = Math.max(graphWidth, graphHeight)
      let scale = 2.5
      if (maxDim * scale > 8192) {
        scale = 8192 / maxDim
      }
      if (graphWidth * scale * graphHeight * scale > 25000000) {
        scale = Math.sqrt(25000000 / (graphWidth * graphHeight))
      }

      if (scale < 0.5) {
        throw new Error('Graph is too massive to rasterize to PNG. Please export as scalable SVG instead.')
      }

      // Calculate translation to place bounds at (padding, padding) with 1:1 scale on full image
      const translateX = -bounds.x + padding
      const translateY = -bounds.y + padding

      const dataUrl = await toPng(viewportEl, {
        backgroundColor: '#0a0a0c',
        width: Math.round(graphWidth),
        height: Math.round(graphHeight),
        pixelRatio: scale,
        skipFonts: true, // Avoids external CORS/font failures and preserves local system font styling
        style: {
          width: `${Math.round(graphWidth)}px`,
          height: `${Math.round(graphHeight)}px`,
          transform: `translate(${translateX}px, ${translateY}px) scale(1)`,
          transformOrigin: 'top left'
        },
        filter: (el) => {
          // Strictly exclude application UI, overlays, and non-graph elements
          if (el.classList) {
            if (
              el.classList.contains('react-flow__controls') ||
              el.classList.contains('react-flow__minimap') ||
              el.classList.contains('react-flow__panel') ||
              el.classList.contains('react-flow__background') ||
              el.classList.contains('react-flow__attribution') ||
              el.id === 'export-menu-container'
            ) {
              return false
            }
          }
          return true
        }
      })

      triggerDownload(dataUrl, getExportFilename('png'))
      setExportFeedback({
        type: 'success',
        message: `Exported PNG (${Math.round(graphWidth * scale)}×${Math.round(graphHeight * scale)}px) successfully.`
      })
    } catch (err) {
      setExportFeedback({ type: 'error', message: `PNG export failed: ${err.message}` })
    } finally {
      setExportingFormat(null)
    }
  }

  // 3. Export full graph as standalone scalable vector SVG
  const handleExportSVG = async () => {
    if (!nodes || nodes.length === 0) {
      setExportFeedback({ type: 'error', message: 'Graph is empty. Nothing to export.' })
      return
    }

    setExportingFormat('svg')
    setShowExportMenu(false)

    try {
      await new Promise((r) => setTimeout(r, 80))

      const exportInfo = getFullGraphExportBounds()
      if (!exportInfo || !exportInfo.viewportEl) {
        throw new Error('Unable to locate graph viewport element.')
      }

      const { viewportEl, bounds, graphWidth, graphHeight, padding } = exportInfo
      const translateX = -bounds.x + padding
      const translateY = -bounds.y + padding

      // Extract all edges, markers, and paths from React Flow's internal SVG layer
      const edgesSvg = viewportEl.querySelector('svg.react-flow__edges')
      let defsContent = ''
      let edgesContent = ''
      if (edgesSvg) {
        const defsEl = edgesSvg.querySelector('defs')
        if (defsEl) defsContent = defsEl.innerHTML
        // Clone and extract edge paths and groups
        const edgeGroups = edgesSvg.querySelectorAll('g.react-flow__edge, g.react-flow__edge-path, path.react-flow__edge-path')
        if (edgeGroups.length > 0) {
          edgesContent = Array.from(edgesSvg.children)
            .filter((child) => child.tagName.toLowerCase() !== 'defs')
            .map((child) => child.outerHTML)
            .join('\n')
        }
      }

      // Extract all graph node elements (.react-flow__node)
      const nodeElements = viewportEl.querySelectorAll('.react-flow__node')
      const nodesContentList = []

      nodeElements.forEach((nodeEl) => {
        const style = window.getComputedStyle(nodeEl)
        const transform = nodeEl.style.transform || style.transform
        // Extract node position from style (or matrix/translate)
        const match = transform.match(/translate\(([-0-9.]+)px,\s*([-0-9.]+)px\)/)
        let nx = 0, ny = 0
        if (match) {
          nx = parseFloat(match[1])
          ny = parseFloat(match[2])
        } else {
          const matrixMatch = transform.match(/matrix\(([^)]+)\)/)
          if (matrixMatch) {
            const parts = matrixMatch[1].split(',').map(s => parseFloat(s.trim()))
            nx = parts[4] || 0
            ny = parts[5] || 0
          }
        }

        const nw = nodeEl.offsetWidth || 220
        const nh = nodeEl.offsetHeight || 88

        // Clean cloned node without event listeners
        const clone = nodeEl.cloneNode(true)
        clone.removeAttribute('id')
        clone.style.position = 'static'
        clone.style.transform = 'none'
        clone.style.margin = '0'

        // Wrap in foreignObject placed at node coordinates
        nodesContentList.push(`
          <g transform="translate(${nx}, ${ny})">
            <foreignObject width="${nw}" height="${nh}">
              <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%; height:100%;">
                ${clone.outerHTML}
              </div>
            </foreignObject>
          </g>
        `)
      })

      // Construct pure, self-contained SVG document
      const svgDocument = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xhtml="http://www.w3.org/1999/xhtml"
     width="${Math.round(graphWidth)}" height="${Math.round(graphHeight)}"
     viewBox="0 0 ${Math.round(graphWidth)} ${Math.round(graphHeight)}">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&amp;family=Plus+Jakarta+Sans:wght@400;500;600;700&amp;display=swap');
      text, div, span { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
      .mono { font-family: 'JetBrains Mono', monospace; }
    </style>
    ${defsContent}
  </defs>
  <!-- Background -->
  <rect width="100%" height="100%" fill="#0a0a0c" />
  <!-- Graph Viewport Container -->
  <g transform="translate(${translateX}, ${translateY})">
    <!-- Dependency Edges -->
    <g class="edges-layer">
      ${edgesContent}
    </g>
    <!-- Graph File Nodes -->
    <g class="nodes-layer">
      ${nodesContentList.join('\n')}
    </g>
  </g>
</svg>`

      const blob = new Blob([svgDocument], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      triggerDownload(url, getExportFilename('svg'))
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      setExportFeedback({ type: 'success', message: `Exported scalable SVG (${Math.round(graphWidth)}×${Math.round(graphHeight)}px) successfully.` })
    } catch (err) {
      setExportFeedback({ type: 'error', message: `SVG export failed: ${err.message}` })
    } finally {
      setExportingFormat(null)
    }
  }

  // Auto-clear export feedback toast after 4 seconds
  useEffect(() => {
    if (!exportFeedback) return
    const timer = setTimeout(() => setExportFeedback(null), 4000)
    return () => clearTimeout(timer)
  }, [exportFeedback])

  // Close export menu on click outside
  useEffect(() => {
    if (!showExportMenu) return
    const handleClickOutside = (e) => {
      if (!e.target.closest('#export-menu-container')) {
        setShowExportMenu(false)
      }
    }
    window.addEventListener('pointerdown', handleClickOutside)
    return () => window.removeEventListener('pointerdown', handleClickOutside)
  }, [showExportMenu])

  // Global Routing & Session Gates:
  // 1. Initial auth state loading indicator
  if (authLoading) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          background: 'var(--bg-primary, #0a0a0c)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          color: '#ededf0',
          fontFamily: 'var(--font-sans)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
          <GitBranch size={18} color="#ededf0" />
          <span>RIPPLECHECK</span>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted, #646473)' }}>
          Verifying session status...
        </div>
      </div>
    )
  }

  // 2. Unauthenticated user → Dedicated Auth Page
  if (!user) {
    return <AuthPage />
  }

  // 3. Authenticated user viewing Dashboard
  if (activeTab === 'Dashboard') {
    return (
      <>
        {showDesktopWizard && (
          <SetupWizardModal onComplete={() => setShowDesktopWizard(false)} />
        )}
        <Dashboard
          onOpenWorkspace={(projectId) => {
            if (projectId) setActiveProjectId(projectId)
            setActiveTab('Workspace')
          }}
        />
      </>
    )
  }

  // 4. Authenticated user viewing Workspace (with Help tab support)
  // 4. Authenticated user viewing Workspace / Help
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', background: 'var(--bg-primary)' }}>
      {showDesktopWizard && (
        <SetupWizardModal onComplete={() => setShowDesktopWizard(false)} />
      )}
      {/* 1. TOP NAVIGATION */}
      <TopNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        signOut={signOut}
        fetchGraph={fetchGraph}
        loadingGraph={loadingGraph}
      />

      {/* 2. PAGE CONTENT */}
      {activeTab === 'Help' ? (
        <HelpGuide onClose={() => setActiveTab('Workspace')} />
      ) : activeTab === 'Graphs' ? (
        <GraphStudioPage
          activeProjectId={activeProjectId}
          rawGraph={rawGraph}
          loadingGraph={loadingGraph}
          graphError={graphError}
          fetchGraph={fetchGraph}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filteredFiles={filteredFiles}
          centerTarget={centerTarget}
          fitViewTrigger={fitViewTrigger}
          setFitViewTrigger={setFitViewTrigger}
          graphMode={graphMode}
          handleModeChange={handleModeChange}
          selectedFile={selectedFile}
          handleSelectFile={handleSelectFile}
          handlePaneClick={handlePaneClick}
          showMinimap={showMinimap}
          setShowMinimap={setShowMinimap}
          showLegend={showLegend}
          setShowLegend={setShowLegend}
          showExportMenu={showExportMenu}
          setShowExportMenu={setShowExportMenu}
          exportingFormat={exportingFormat}
          exportFeedback={exportFeedback}
          setExportFeedback={setExportFeedback}
          reactFlowWrapperRef={reactFlowWrapperRef}
          setReactFlowInstance={setReactFlowInstance}
          handleExportPNG={handleExportPNG}
          handleExportSVG={handleExportSVG}
          handleExportJSON={handleExportJSON}
        />
      ) : activeTab === 'Impact' ? (
        <ImpactPage
          activeProjectId={activeProjectId}
          rawGraph={rawGraph}
          filteredFiles={filteredFiles}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selectedFile={selectedFile}
          handleSelectFile={handleSelectFile}
          impactData={impactData}
          loadingImpact={loadingImpact}
          analysisMode={analysisMode}
          setAnalysisMode={setAnalysisMode}
          normalizedAffectedFiles={normalizedAffectedFiles}
          directImporters={directImporters}
          transitiveDependents={transitiveDependents}
          expandedPathFiles={expandedPathFiles}
          toggleExpand={toggleExpand}
          activeHighlightedPath={activeHighlightedPath}
          handleHighlightPath={handleHighlightPath}
        />
      ) : activeTab === 'Ask' ? (
        <AskPage
          activeProjectId={activeProjectId}
          idToken={idToken}
          getIdToken={getIdToken}
          handleSelectFile={handleSelectFile}
          setActiveTab={setActiveTab}
        />
      ) : activeTab === 'Insights' ? (
        <InsightsPage
          activeProjectId={activeProjectId}
          rawGraph={rawGraph}
          handleSelectFile={handleSelectFile}
          setActiveTab={setActiveTab}
        />
      ) : activeTab === 'Reports' ? (
        <ReportsPage
          activeProjectId={activeProjectId}
          rawGraph={rawGraph}
          selectedFile={selectedFile}
          normalizedAffectedFiles={normalizedAffectedFiles}
          directImporters={directImporters}
          transitiveDependents={transitiveDependents}
          handleExportPNG={handleExportPNG}
          handleExportSVG={handleExportSVG}
          handleExportJSON={handleExportJSON}
          exportingFormat={exportingFormat}
          exportFeedback={exportFeedback}
        />
      ) : (
        <WorkspacePage
          activeProjectId={activeProjectId}
          rawGraph={rawGraph}
          loadingGraph={loadingGraph}
          graphError={graphError}
          fetchGraph={fetchGraph}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filteredFiles={filteredFiles}
          centerTarget={centerTarget}
          fitViewTrigger={fitViewTrigger}
          setFitViewTrigger={setFitViewTrigger}
          graphMode={graphMode}
          handleModeChange={handleModeChange}
          selectedFile={selectedFile}
          handleSelectFile={handleSelectFile}
          impactData={impactData}
          loadingImpact={loadingImpact}
          analysisMode={analysisMode}
          setAnalysisMode={setAnalysisMode}
          activeHighlightedPath={activeHighlightedPath}
          handleHighlightPath={handleHighlightPath}
          expandedPathFiles={expandedPathFiles}
          toggleExpand={toggleExpand}
          handlePaneClick={handlePaneClick}
          updateEdgeStyles={updateEdgeStyles}
          setEdges={setEdges}
          nlQuestion={nlQuestion}
          setNlQuestion={setNlQuestion}
          nlResponse={nlResponse}
          setNlResponse={setNlResponse}
          nlLoading={nlLoading}
          handleNlSubmit={handleNlSubmit}
          showMinimap={showMinimap}
          setShowMinimap={setShowMinimap}
          showLegend={showLegend}
          setShowLegend={setShowLegend}
          showExportMenu={showExportMenu}
          setShowExportMenu={setShowExportMenu}
          exportingFormat={exportingFormat}
          exportFeedback={exportFeedback}
          setExportFeedback={setExportFeedback}
          reactFlowWrapperRef={reactFlowWrapperRef}
          setReactFlowInstance={setReactFlowInstance}
          handleExportPNG={handleExportPNG}
          handleExportSVG={handleExportSVG}
          handleExportJSON={handleExportJSON}
          directImporters={directImporters}
          transitiveDependents={transitiveDependents}
          normalizedAffectedFiles={normalizedAffectedFiles}
        />
      )}
    </div>
  )
}
