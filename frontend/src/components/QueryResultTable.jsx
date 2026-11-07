import React from 'react'

export function QueryResultTable({ results, onSelectFile }) {
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
        maxHeight: '260px',
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

