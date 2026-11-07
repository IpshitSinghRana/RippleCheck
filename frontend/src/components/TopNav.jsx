import React from 'react'
import {
  GitBranch,
  LayoutDashboard,
  LogOut,
  BookOpen,
  RefreshCw
} from 'lucide-react'
import { UserAvatar } from '../UserAvatar'

export function TopNav({
  activeTab = 'Workspace',
  setActiveTab,
  user,
  signOut,
  fetchGraph,
  loadingGraph = false
}) {
  const tabs = [
    { id: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard, enabled: true },
    { id: 'Workspace', label: 'Workspace', enabled: true },
    { id: 'Graphs', label: 'Graphs', enabled: true },
    { id: 'Impact', label: 'Impact', enabled: true },
    { id: 'Ask', label: 'Ask', enabled: true },
    { id: 'Insights', label: 'Insights', enabled: true },
    { id: 'Reports', label: 'Reports', enabled: true },
    { id: 'Help', label: 'Help', enabled: true }
  ]

  return (
    <header
      className="no-print"
      style={{
        height: '46px',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        zIndex: 10
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div
          onClick={() => setActiveTab && setActiveTab('Workspace')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
          title="RippleCheck - Code Dependency & Impact Platform"
        >
          <GitBranch size={16} color="#ededf0" />
          <span style={{ fontWeight: 700, fontSize: '13px', letterSpacing: '0.5px', color: '#ededf0' }}>
            RIPPLECHECK
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', borderLeft: '1px solid var(--border-medium)', paddingLeft: '8px' }}>
            v1.0
          </span>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            const isEnabled = tab.enabled

            return (
              <button
                key={tab.id}
                disabled={!isEnabled}
                onClick={() => {
                  if (isEnabled && setActiveTab) {
                    setActiveTab(tab.id)
                  }
                }}
                title={!isEnabled ? `${tab.label} (${tab.note || 'Coming soon'})` : tab.label}
                style={{
                  background: isActive ? 'var(--bg-surface)' : 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  color: isActive
                    ? '#ededf0'
                    : isEnabled
                    ? 'var(--text-secondary)'
                    : 'rgba(154, 154, 168, 0.4)',
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: isEnabled ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  transition: 'all 0.15s ease',
                  position: 'relative'
                }}
              >
                {Icon && <Icon size={13} />}
                {tab.label}
                {!isEnabled && (
                  <span
                    style={{
                      fontSize: '9px',
                      color: 'var(--text-muted)',
                      background: 'rgba(255, 255, 255, 0.05)',
                      padding: '1px 4px',
                      borderRadius: '3px',
                      marginLeft: '2px',
                      border: '1px solid var(--border-subtle)'
                    }}
                  >
                    soon
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* User profile & Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '4px' }}>
          <UserAvatar user={user} size={22} fontSize={9} />
          <span
            title={user?.displayName || user?.email || 'Developer'}
            style={{
              fontSize: '11px',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              maxWidth: '140px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {user?.displayName || user?.email?.split('@')[0] || 'Developer'}
          </span>
          {signOut && (
            <button
              onClick={signOut}
              title="Log out of RippleCheck"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <LogOut size={12} />
            </button>
          )}
        </div>

        <button
          onClick={() => setActiveTab && setActiveTab(activeTab === 'Help' ? 'Workspace' : 'Help')}
          title="Help & Learning Guide"
          style={{
            background: activeTab === 'Help' ? '#202B36' : 'transparent',
            border: '1px solid ' + (activeTab === 'Help' ? '#6B9BCB' : 'var(--border-subtle)'),
            borderRadius: '4px',
            padding: '4px 8px',
            color: activeTab === 'Help' ? '#6B9BCB' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            transition: 'all 0.15s'
          }}
        >
          <BookOpen size={12} />
          Help Guide
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />
          Neo4j Connected
        </div>

        {fetchGraph && (
          <button
            onClick={fetchGraph}
            disabled={loadingGraph}
            title="Reload Graph Data"
            style={{
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              padding: '4px 8px',
              color: 'var(--text-secondary)',
              cursor: loadingGraph ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              opacity: loadingGraph ? 0.6 : 1
            }}
          >
            <RefreshCw size={12} className={loadingGraph ? 'spin' : ''} />
            Sync
          </button>
        )}
      </div>
    </header>
  )
}

