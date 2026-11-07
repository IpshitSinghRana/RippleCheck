import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { FileCode, Database, Server, Shield, Layers } from 'lucide-react'

function getFileIcon(name) {
  if (name.includes('db') || name.includes('database')) return <Database size={13} color="#60a5fa" />
  if (name.includes('auth') || name.includes('security')) return <Shield size={13} color="#f87171" />
  if (name.includes('service')) return <Server size={13} color="#fbbf24" />
  if (name.includes('app') || name.includes('index')) return <Layers size={13} color="#4ade80" />
  return <FileCode size={13} color="#9a9aa8" />
}

export const FileNode = memo(({ data, selected }) => {
  const isTarget = data.isTarget
  const isAffected = data.isAffected
  const isDependency = data.isDependency

  // Search synchronization states
  const isSearchActive = Boolean(data.isSearchActive)
  const isSearchMatch = Boolean(data.isSearchMatch)
  const isSearchDimmed = Boolean(data.isSearchDimmed)

  // Color semantics according to legend:
  // - Steel Blue (#6B9BCB) / Background (#202B36): Selected file
  // - Red (#ef4444): Changed/origin file
  // - Orange (#f97316): Affected files
  // - Green (#22c55e): Direct dependencies
  // - Sky Blue (#38bdf8): Search matches (when not overridden by semantic colors)
  // - Grey (#646473): Normal files
  let borderColor = 'var(--border-subtle)'
  let borderWidth = '1.5px'
  let badgeColor = '#646473'
  let statusText = null
  let bgStyle = '#141418'
  let boxShadowStyle = '0 2px 8px rgba(0,0,0,0.4)'

  if (selected || isTarget) {
    if (selected) {
      // Selected file takes primary focus with steel blue accent
      borderColor = '#6B9BCB'
      borderWidth = '2px'
      statusText = isTarget ? 'ORIGIN' : 'SELECTED'
      badgeColor = '#6B9BCB'
      bgStyle = '#202B36'
      boxShadowStyle = isSearchMatch
        ? '0 0 0 2px #38bdf8, 0 0 0 4px rgba(107, 155, 203, 0.3), 0 8px 24px rgba(0, 0, 0, 0.6)'
        : '0 0 0 3px rgba(107, 155, 203, 0.22), 0 8px 24px rgba(0, 0, 0, 0.6)'
    } else {
      borderColor = '#ef4444' // Red for changed/origin file if not directly selected
      statusText = 'ORIGIN'
      badgeColor = '#ef4444'
      bgStyle = 'rgba(239, 68, 68, 0.08)'
      if (isSearchMatch) {
        boxShadowStyle = '0 0 0 2px #38bdf8, 0 4px 16px rgba(0,0,0,0.5)'
      }
    }
  } else if (isAffected) {
    borderColor = '#f97316' // Orange for affected files
    statusText = 'AFFECTED'
    badgeColor = '#f97316'
    bgStyle = 'rgba(249, 115, 22, 0.08)'
    if (isSearchMatch) {
      boxShadowStyle = '0 0 0 2px #38bdf8, 0 4px 16px rgba(0,0,0,0.5)'
    }
  } else if (isDependency) {
    borderColor = '#22c55e' // Green for direct dependencies
    statusText = 'DEPENDENCY'
    badgeColor = '#22c55e'
    bgStyle = 'rgba(34, 197, 94, 0.08)'
    if (isSearchMatch) {
      boxShadowStyle = '0 0 0 2px #38bdf8, 0 4px 16px rgba(0,0,0,0.5)'
    }
  } else if (isSearchMatch) {
    // Normal file matching the active search query
    borderColor = '#38bdf8'
    borderWidth = '2px'
    statusText = 'MATCH'
    badgeColor = '#38bdf8'
    bgStyle = 'rgba(56, 189, 248, 0.08)'
    boxShadowStyle = '0 0 0 2px rgba(56, 189, 248, 0.3), 0 6px 20px rgba(0, 0, 0, 0.55)'
  }

  // Non-matching nodes are subtly dimmed during active search (Requirement 2)
  const nodeOpacity = isSearchDimmed ? 0.22 : 1
  const nodeFilter = isSearchDimmed ? 'grayscale(40%)' : 'none'

  // Support dynamic handle positions for horizontal DAG and radial layouts
  const targetPos = data.targetPosition
    ? (data.targetPosition === 'left' ? Position.Left : data.targetPosition === 'right' ? Position.Right : data.targetPosition === 'bottom' ? Position.Bottom : Position.Top)
    : (data.handleOrientation === 'horizontal' ? Position.Left : Position.Top)

  const sourcePos = data.sourcePosition
    ? (data.sourcePosition === 'left' ? Position.Left : data.sourcePosition === 'right' ? Position.Right : data.sourcePosition === 'top' ? Position.Top : Position.Bottom)
    : (data.handleOrientation === 'horizontal' ? Position.Right : Position.Bottom)

  return (
    <div
      style={{
        background: bgStyle,
        border: `${borderWidth} solid ${borderColor}`,
        borderRadius: '6px',
        padding: '8px 12px',
        minWidth: '180px',
        maxWidth: '260px',
        boxShadow: boxShadowStyle,
        cursor: 'pointer',
        opacity: nodeOpacity,
        filter: nodeFilter,
        transition: 'opacity 0.2s ease, filter 0.2s ease, border-color 0.15s ease, box-shadow 0.15s ease'
      }}
      onMouseEnter={(e) => {
        if (isSearchDimmed) {
          e.currentTarget.style.opacity = '0.6'
        }
      }}
      onMouseLeave={(e) => {
        if (isSearchDimmed) {
          e.currentTarget.style.opacity = '0.22'
        }
      }}
    >
      <Handle type="target" position={targetPos} style={{ background: '#646473', width: 6, height: 6, border: 'none' }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
          {getFileIcon(data.name || '')}
          <span style={{ fontWeight: 600, fontSize: '12px', color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {data.name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {isSearchActive && isSearchMatch && (selected || isTarget || isAffected || isDependency) && (
            <span
              title="Matches search query"
              style={{
                fontSize: '8px',
                fontWeight: 700,
                letterSpacing: '0.4px',
                padding: '1px 4px',
                borderRadius: '2px',
                background: 'rgba(56, 189, 248, 0.16)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                color: '#38bdf8'
              }}
            >
              MATCH
            </span>
          )}
          {statusText && (
            <span style={{
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.5px',
              padding: '1px 5px',
              borderRadius: '3px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: `1px solid ${badgeColor}`,
              color: badgeColor
            }}>
              {statusText}
            </span>
          )}
        </div>
      </div>

      <div style={{
        fontSize: '10px',
        color: isSearchMatch ? '#93c5fd' : '#646473',
        fontFamily: 'var(--font-mono)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}>
        {data.path}
      </div>

      {data.summary && (
        <div style={{
          marginTop: '6px',
          paddingTop: '6px',
          borderTop: '1px solid #23232b',
          fontSize: '11px',
          color: '#9a9aa8',
          lineHeight: '1.3',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}>
          {data.summary}
        </div>
      )}

      <Handle type="source" position={sourcePos} style={{ background: '#646473', width: 6, height: 6, border: 'none' }} />
    </div>
  )
})
