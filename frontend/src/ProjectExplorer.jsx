import React, { useState, useMemo } from 'react'
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  FileSpreadsheet,
  Image,
  Video,
  File,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  HelpCircle
} from 'lucide-react'

/**
 * Returns an appropriate icon based on file extension.
 */
function getFileIcon(extension, inGraph, isSelected, category) {
  const ext = (extension || '').toLowerCase()
  const iconColor = isSelected ? '#60a5fa' : inGraph ? '#93c5fd' : category === 'config' ? '#a5b4fc' : '#646473'

  if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) {
    return <FileCode size={13} color={iconColor} style={{ flexShrink: 0 }} />
  }
  if (['.json', '.yml', '.yaml', '.toml', '.env', '.xml'].includes(ext)) {
    return <FileSpreadsheet size={13} color={iconColor} style={{ flexShrink: 0 }} />
  }
  if (['.html', '.css', '.md', '.txt'].includes(ext)) {
    return <FileText size={13} color={iconColor} style={{ flexShrink: 0 }} />
  }
  if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'].includes(ext)) {
    return <Image size={13} color={iconColor} style={{ flexShrink: 0 }} />
  }
  if (['.mp4', '.webm', '.mov', '.avi'].includes(ext)) {
    return <Video size={13} color={iconColor} style={{ flexShrink: 0 }} />
  }
  return <File size={13} color={iconColor} style={{ flexShrink: 0 }} />
}

// Helper to render badge based on whether file is actually in the graph vs config vs raw
function renderBadge(fileData) {
  if (fileData?.inGraph) {
    return (
      <span
        title="Module parsed and modeled in the dependency graph"
        style={{
          fontSize: '8px',
          textTransform: 'uppercase',
          padding: '1px 4px',
          borderRadius: '2px',
          background: 'rgba(34, 197, 94, 0.12)',
          color: '#86efac',
          fontWeight: 700,
          letterSpacing: '0.3px',
          flexShrink: 0
        }}
      >
        Graph
      </span>
    )
  }

  if (fileData?.category === 'config' || fileData?.extension === '.json') {
    return (
      <span
        title="Configuration / metadata file (not a JS dependency module)"
        style={{
          fontSize: '8px',
          textTransform: 'uppercase',
          padding: '1px 4px',
          borderRadius: '2px',
          background: 'rgba(96, 165, 250, 0.12)',
          color: '#93c5fd',
          fontWeight: 600,
          letterSpacing: '0.2px',
          flexShrink: 0
        }}
      >
        Config
      </span>
    )
  }

  return (
    <span
      title="Asset / non-module resource (visible in project, not in dependency graph)"
      style={{
        fontSize: '8px',
        textTransform: 'uppercase',
        padding: '1px 4px',
        borderRadius: '2px',
        background: 'rgba(255, 255, 255, 0.04)',
        color: 'var(--text-muted, #646473)',
        fontWeight: 600,
        flexShrink: 0
      }}
    >
      Raw
    </span>
  )
}

/**
 * Builds a hierarchical tree from a manifest list of file items containing `.path`.
 * Normalizes backslashes to forward slashes.
 */
export function buildFileTree(files) {
  const root = { name: '', fullPath: '', isFolder: true, children: {} }

  for (const file of files) {
    if (!file || !file.path) continue
    const normalized = file.path.replace(/\\/g, '/').replace(/^\/+/, '')
    const parts = normalized.split('/')

    let curr = root
    let accumulatedPath = ''

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part
      const isFile = i === parts.length - 1

      if (!curr.children[part]) {
        curr.children[part] = {
          name: part,
          fullPath: accumulatedPath,
          isFolder: !isFile,
          fileData: isFile ? file : null,
          children: {}
        }
      } else if (isFile) {
        curr.children[part].fileData = file
      }

      curr = curr.children[part]
    }
  }

  // Convert nested objects to sorted arrays
  function toSortedArray(node) {
    const list = Object.values(node.children)
    // Sort directories first, then alphabetical
    list.sort((a, b) => {
      if (a.isFolder === b.isFolder) {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      }
      return a.isFolder ? -1 : 1
    })

    for (const child of list) {
      if (child.isFolder) {
        child.items = toSortedArray(child)
      }
    }

    return list
  }

  return toSortedArray(root)
}

/**
 * Single tree node item (recursive for folders)
 */
function TreeNode({ item, level = 0, selectedFilePath, onSelectFile, expandedFolders, onToggleFolder }) {
  const isExpanded = Boolean(expandedFolders[item.fullPath])
  const isSelected = !item.isFolder && selectedFilePath === item.fullPath
  const isSupported = item.fileData?.isSupported ?? false

  if (item.isFolder) {
    return (
      <div>
        <div
          onClick={() => onToggleFolder(item.fullPath)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 6px',
            paddingLeft: `${level * 12 + 6}px`,
            borderRadius: '4px',
            color: 'var(--text-secondary, #9a9aa8)',
            cursor: 'pointer',
            fontSize: '11px',
            userSelect: 'none',
            transition: 'background 0.1s ease',
            lineHeight: 1.4
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-elevated, #1f1f26)'
            e.currentTarget.style.color = '#ededf0'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-secondary, #9a9aa8)'
          }}
        >
          {isExpanded ? (
            <ChevronDown size={12} color="var(--text-muted, #646473)" style={{ flexShrink: 0 }} />
          ) : (
            <ChevronRight size={12} color="var(--text-muted, #646473)" style={{ flexShrink: 0 }} />
          )}
          {isExpanded ? (
            <FolderOpen size={13} color="#94a3b8" style={{ flexShrink: 0 }} />
          ) : (
            <Folder size={13} color="#64748b" style={{ flexShrink: 0 }} />
          )}
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: 500
            }}
          >
            {item.name}
          </span>
        </div>

        {isExpanded && item.items && item.items.length > 0 && (
          <div>
            {item.items.map((child) => (
              <TreeNode
                key={child.fullPath}
                item={child}
                level={level + 1}
                selectedFilePath={selectedFilePath}
                onSelectFile={onSelectFile}
                expandedFolders={expandedFolders}
                onToggleFolder={onToggleFolder}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // File leaf item
  const inGraph = Boolean(item.fileData?.inGraph)
  const category = item.fileData?.category

  return (
    <div
      onClick={() => onSelectFile(item.fullPath, item.fileData)}
      title={inGraph ? `${item.fullPath} (Analysed in dependency graph)` : `${item.fullPath} (${category === 'config' ? 'Configuration file' : 'Resource file'}; not in dependency graph)`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 6px',
        paddingLeft: `${level * 12 + 18}px`,
        borderRadius: '4px',
        background: isSelected ? 'var(--bg-elevated, #1f1f26)' : 'transparent',
        border: isSelected ? '1px solid var(--border-active, #454554)' : '1px solid transparent',
        color: isSelected ? '#ededf0' : inGraph ? 'var(--text-primary, #ededf0)' : 'var(--text-muted, #646473)',
        cursor: 'pointer',
        fontSize: '11px',
        marginBottom: '1px',
        transition: 'all 0.1s ease',
        lineHeight: 1.4,
        opacity: inGraph ? 1 : 0.85
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'
          e.currentTarget.style.color = '#ededf0'
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = isSelected ? '#ededf0' : inGraph ? 'var(--text-primary, #ededf0)' : 'var(--text-muted, #646473)'
        }
      }}
    >
      {getFileIcon(item.fileData?.extension || item.name.slice(item.name.lastIndexOf('.')), inGraph, isSelected, category)}
      
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {item.name}
      </span>

      {renderBadge(item.fileData)}
    </div>
  )
}

/**
 * Expandable Project Explorer Component
 */
export function ProjectExplorer({ files, selectedFilePath, onSelectFile, isSearching = false }) {
  // Map of fullPath -> boolean
  const [expandedFolders, setExpandedFolders] = useState({})

  // Automatically expand all folders when user is actively searching
  const tree = useMemo(() => buildFileTree(files), [files])

  // Collect all folder paths for auto-expansion during search or initial view
  React.useEffect(() => {
    if (isSearching) {
      const allPaths = {}
      function mark(items) {
        for (const item of items) {
          if (item.isFolder) {
            allPaths[item.fullPath] = true
            if (item.items) mark(item.items)
          }
        }
      }
      mark(tree)
      setExpandedFolders(allPaths)
    } else {
      // Default: Expand first 2 levels of folders
      const initial = {}
      function markLevels(items, depth) {
        if (depth > 2) return
        for (const item of items) {
          if (item.isFolder) {
            initial[item.fullPath] = true
            if (item.items) markLevels(item.items, depth + 1)
          }
        }
      }
      markLevels(tree, 0)
      setExpandedFolders(initial)
    }
  }, [tree, isSearching])

  const toggleFolder = (folderPath) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath]
    }))
  }

  if (tree.length === 0) {
    return (
      <div style={{ padding: '12px 8px', fontSize: '11px', color: 'var(--text-muted, #646473)', textAlign: 'center' }}>
        No matching files found
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {tree.map((item) => (
        <TreeNode
          key={item.fullPath}
          item={item}
          level={0}
          selectedFilePath={selectedFilePath}
          onSelectFile={onSelectFile}
          expandedFolders={expandedFolders}
          onToggleFolder={toggleFolder}
        />
      ))}
    </div>
  )
}
