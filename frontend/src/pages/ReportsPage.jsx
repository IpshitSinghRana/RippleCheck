import React, { useRef } from 'react'
import {
  FileText,
  Printer,
  Download,
  FileCode,
  FileImage,
  Code,
  RefreshCw,
  CheckCircle2,
  GitBranch,
  ShieldAlert,
  Layers,
  ArrowRight
} from 'lucide-react'

export function ReportsPage({
  activeProjectId,
  rawGraph,
  selectedFile,
  normalizedAffectedFiles,
  directImporters,
  transitiveDependents,
  handleExportPNG,
  handleExportSVG,
  handleExportJSON,
  exportingFormat,
  exportFeedback
}) {
  const nodes = rawGraph?.nodes || []
  const edges = rawGraph?.edges || []

  // Print-to-PDF triggered via browser window.print()
  const handlePrint = () => {
    window.print()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, position: 'relative', overflowY: 'auto' }}>
      {/* Top Header Bar */}
      <div
        className="no-print"
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
            Repository Reports & Export
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

        {/* Action Buttons: Print to PDF, PNG, SVG, JSON */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handlePrint}
            title="Print or Save as PDF"
            style={{
              background: '#202B36',
              border: '1px solid #6B9BCB',
              borderRadius: '4px',
              padding: '4px 10px',
              color: '#6B9BCB',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              transition: 'all 0.15s ease'
            }}
          >
            <Printer size={12} />
            Print / Save as PDF
          </button>

          <button
            onClick={handleExportPNG}
            disabled={Boolean(exportingFormat) || nodes.length === 0}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              padding: '4px 8px',
              color: '#ededf0',
              fontSize: '11px',
              cursor: nodes.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <FileImage size={12} color="#60a5fa" />
            PNG
          </button>

          <button
            onClick={handleExportSVG}
            disabled={Boolean(exportingFormat) || nodes.length === 0}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              padding: '4px 8px',
              color: '#ededf0',
              fontSize: '11px',
              cursor: nodes.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Code size={12} color="#34d399" />
            SVG
          </button>

          <button
            onClick={handleExportJSON}
            disabled={Boolean(exportingFormat) || nodes.length === 0}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              padding: '4px 8px',
              color: '#ededf0',
              fontSize: '11px',
              cursor: nodes.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <FileCode size={12} color="#fbbf24" />
            JSON
          </button>
        </div>
      </div>

      {/* Printable Report Document Container */}
      <div
        id="printable-report"
        style={{
          maxWidth: '920px',
          width: '100%',
          margin: '0 auto',
          padding: '32px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}
      >
        {/* Document Header */}
        <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <GitBranch size={20} color="#ededf0" />
              <span style={{ fontSize: '18px', fontWeight: 700, color: '#ededf0', letterSpacing: '0.5px' }}>
                RIPPLECHECK
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Dependency Audit Report</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Generated on {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <div>Project: <strong style={{ color: '#ededf0' }}>{activeProjectId}</strong></div>
            <div>Total Files: <strong style={{ color: '#ededf0' }}>{nodes.length}</strong></div>
            <div>Total Dependencies: <strong style={{ color: '#ededf0' }}>{edges.length}</strong></div>
          </div>
        </div>

        {/* Section 1: Executive Overview */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '18px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#ededf0', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Executive Architecture Overview
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
            This audit report captures code coupling and dependency structures for project <strong style={{ color: '#ededf0' }}>{activeProjectId}</strong>.
            The repository contains <strong>{nodes.length} module files</strong> interconnected through <strong>{edges.length} directed import statements</strong>.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '16px' }}>
            <div style={{ background: 'var(--bg-surface)', padding: '10px 12px', borderRadius: '4px' }}>
              <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>REPOSITORY MODULES</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#ededf0', marginTop: '2px' }}>{nodes.length}</div>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: '10px 12px', borderRadius: '4px' }}>
              <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>DIRECTED CONNECTIONS</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#6B9BCB', marginTop: '2px' }}>{edges.length}</div>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: '10px 12px', borderRadius: '4px' }}>
              <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>AVG COUPLING RATIO</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#ededf0', marginTop: '2px' }}>
                {nodes.length > 0 ? (edges.length / nodes.length).toFixed(1) : 0} <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>edges/node</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Selected Target Impact Summary */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '18px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#ededf0', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Target Change Impact Analysis
          </h2>

          {selectedFile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: '4px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#ededf0' }}>{selectedFile.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{selectedFile.path}</div>
                </div>
                <div style={{ fontSize: '11px', color: normalizedAffectedFiles.length > 0 ? '#ef4444' : '#22c55e', fontWeight: 700 }}>
                  {normalizedAffectedFiles.length} Affected Module{normalizedAffectedFiles.length === 1 ? '' : 's'}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: '4px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#ef4444', textTransform: 'uppercase' }}>Direct Importers ({directImporters.length})</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {directImporters.length > 0 ? directImporters.map((d) => d.name).join(', ') : 'None (No direct consumers)'}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: '4px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#fb923c', textTransform: 'uppercase' }}>Transitive Cascade ({transitiveDependents.length})</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {transitiveDependents.length > 0 ? transitiveDependents.map((t) => `${t.name} (${t.hops} hops)`).join(', ') : 'None (No indirect cascade)'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '6px 0' }}>
              No target file currently selected in Workspace. Select a file in the Project Explorer or Graph Studio to view target-specific blast radius metrics.
            </div>
          )}
        </div>

        {/* Section 3: Module Inventory Table */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '18px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#ededf0', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Module Inventory & Dependencies ({nodes.length})
          </h2>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#121217', borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={{ padding: '8px 10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '9px' }}>Module Name</th>
                  <th style={{ padding: '8px 10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '9px' }}>Relative Path</th>
                  <th style={{ padding: '8px 10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '9px' }}>Outgoing Imports</th>
                  <th style={{ padding: '8px 10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '9px' }}>Incoming Importers</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((node, i) => {
                  const outCount = edges.filter((e) => e.source === node.path).length
                  const inCount = edges.filter((e) => e.target === node.path).length
                  return (
                    <tr key={node.path || i} style={{ borderBottom: '1px solid #1a1a24' }}>
                      <td style={{ padding: '7px 10px', color: '#ededf0', fontWeight: 600 }}>{node.name}</td>
                      <td style={{ padding: '7px 10px', color: '#93c5fd', fontFamily: 'var(--font-mono)' }}>{node.path}</td>
                      <td style={{ padding: '7px 10px', color: 'var(--text-secondary)' }}>{outCount}</td>
                      <td style={{ padding: '7px 10px', color: inCount > 0 ? '#ef4444' : 'var(--text-muted)', fontWeight: inCount > 0 ? 600 : 400 }}>{inCount}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

