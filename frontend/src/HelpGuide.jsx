import React, { useState, useMemo } from 'react'
import {
  BookOpen,
  Search,
  ArrowRight,
  GitBranch,
  ShieldAlert,
  Layers,
  HelpCircle,
  Activity,
  CheckCircle2,
  Trash2,
  FileCode,
  Radio,
  Download,
  RefreshCw,
  Terminal,
  Info,
  ChevronRight,
  Sparkles,
  Maximize2
} from 'lucide-react'

// 12 Core Concepts with Definition, Sample Repo Example, and Developer Importance
const CONCEPTS = [
  {
    id: 1,
    title: 'What is a dependency?',
    tag: 'Fundamentals',
    definition: 'A dependency is an external file, module, or package that another piece of code relies upon to execute its logic.',
    example: 'In the sample repository, auth.js depends on utils.js because auth.js calls helper functions defined in utils.js.',
    whyCare: 'Whenever you change code in a dependency, every file that relies on it may also be impacted or break. Managing dependencies prevents unintended regressions.'
  },
  {
    id: 2,
    title: 'What are nodes and edges?',
    tag: 'Graph Theory',
    definition: 'In a dependency graph, nodes represent the code files (the entities), and edges represent the directed relationships (the connections) between those files.',
    example: 'In RippleCheck, each JavaScript file (like index.js, app.js, database.js) is a node, and the white directional arrow connecting index.js to app.js is an edge.',
    whyCare: 'Viewing code as nodes and edges transforms thousands of lines of hidden imports into a clear map of architectural structure and data flow.'
  },
  {
    id: 3,
    title: 'What does "A imports B" mean?',
    tag: 'Relationships',
    definition: '"A imports B" means file A contains an explicit import or require statement referencing file B. File A is the consumer; file B is the supplier.',
    example: 'app.js contains require("./auth.js"), meaning app.js imports auth.js. The edge points from app.js to auth.js.',
    whyCare: 'The direction of the import determines coupling: if B is modified or deleted, A is directly affected. A changes do not directly affect B.'
  },
  {
    id: 4,
    title: 'Direct vs Transitive dependencies',
    tag: 'Coupling',
    definition: 'A direct dependency is imported directly by a file (1 hop). A transitive (indirect) dependency is a dependency of your dependency (2 or more hops away).',
    example: 'app.js directly imports auth.js (1 hop). auth.js directly imports utils.js. Therefore, utils.js is a transitive dependency of app.js (2 hops: app.js → auth.js → utils.js).',
    whyCare: 'Most surprise bugs in production stem from transitive dependencies. Developers often forget that modifying a deep utility function cascades upward through the entire chain.'
  },
  {
    id: 5,
    title: 'What is a dependency graph?',
    tag: 'Architecture',
    definition: 'A dependency graph is a directed network visualizing all files in a codebase and every import relationship connecting them.',
    example: 'The RippleCheck canvas displays the complete sample repo DAG: index.js → app.js → {auth.js → utils.js, userService.js → database.js}.',
    whyCare: 'A dependency graph reveals tight coupling, architectural bottlenecks, dead code, and high-risk central files before you refactor.'
  },
  {
    id: 6,
    title: 'What is impact analysis?',
    tag: 'Analysis',
    definition: 'Impact analysis is the reverse traversal of the dependency graph to determine all files and systems that rely on a target file when it is changed or deleted.',
    example: 'If you want to edit utils.js, RippleCheck traverses backward to show that auth.js, app.js, and index.js will all be affected.',
    whyCare: 'Instead of guessing what to test or hoping for the best, impact analysis tells you exactly which files, components, and automated test suites must be verified.'
  },
  {
    id: 7,
    title: 'What is blast radius?',
    tag: 'Risk Assessment',
    definition: 'Blast radius is the total count and spread of files that can experience side effects or break when a specific file is modified or removed.',
    example: 'Modifying utils.js has a blast radius of 3 files (auth.js, app.js, index.js). In contrast, modifying index.js has a blast radius of 0 files because nothing imports index.js.',
    whyCare: 'Files with a large blast radius carry the highest risk in your codebase. They require stricter PR reviews, comprehensive testing, and careful refactoring.'
  },
  {
    id: 8,
    title: 'What are circular dependencies?',
    tag: 'Code Smells',
    definition: 'A circular dependency occurs when file A imports file B, and file B imports file A directly or transitively (A → B → ... → A).',
    example: 'If utils.js were to import app.js, it would create a loop: app.js → auth.js → utils.js → app.js. (The sample repo is currently cleanly cycle-free).',
    whyCare: 'Circular dependencies often cause undefined module exports at runtime, infinite build loops, memory leaks, and tightly coupled spaghetti code.'
  },
  {
    id: 9,
    title: 'What are isolated files?',
    tag: 'Code Hygiene',
    definition: 'Isolated files are source files with zero incoming and zero outgoing import connections, standing completely disconnected from the rest of the application.',
    example: 'If a file like scratch-pad.js exists in the folder without importing any app module and without being imported by index.js, it is isolated.',
    whyCare: 'Isolated files frequently represent abandoned features, dead code, forgotten tests, or missing connections that inflate repository size.'
  },
  {
    id: 10,
    title: 'What are entry points?',
    tag: 'Architecture',
    definition: 'An entry point is a root node where application execution begins. It typically imports downstream modules but is not imported by any other file (in-degree = 0).',
    example: 'index.js is the sample repository\'s entry point: it imports app.js and bootstraps the HTTP server, and no other internal file imports index.js.',
    whyCare: 'Entry points dictate how your application initializes configuration, environment variables, and routing. Changing an entry point alters the startup lifecycle.'
  },
  {
    id: 11,
    title: 'What do different graph colours mean?',
    tag: 'Semantics',
    definition: 'RippleCheck uses semantic visual indicators on the graph canvas to instantly distinguish roles in the dependency hierarchy without visual clutter.',
    example: 'When inspecting utils.js:\n• Steel Blue (#6B9BCB / #202B36): Selected node under inspection.\n• Red (#ef4444): Origin/target file being modified or simulated for deletion.\n• Orange (#f97316): Affected files (direct importers and transitive dependents).\n• Green (#22c55e): Direct outgoing dependencies (modules imported by the target).\n• Grey (#646473): Normal, unaffected files.',
    whyCare: 'Color-coded semantics allow you to assess the risk of a pull request or refactor in seconds without deciphering terminal logs.'
  },
  {
    id: 12,
    title: 'How do Modify and Delete simulations work?',
    tag: 'Simulation Engine',
    definition: 'Modify analysis tracks downstream files that may experience behavioral regressions. Delete simulation calculates immediate compilation failures (unresolved imports) and cascading runtime crashes if a file were permanently removed.',
    example: 'Simulating the deletion of database.js reveals that userService.js immediately breaks with an unresolved import ("Cannot find module ./database.js"), while app.js and index.js suffer cascading runtime failures.\n\nNOTE: Simulations are completely safe read-only graph queries. RippleCheck NEVER deletes or modifies any source files.',
    whyCare: 'Running a delete simulation before refactoring prevents broken builds, missing dependencies, and catastrophic downtime.'
  }
]

// Searchable Glossary Terms
const GLOSSARY = [
  { term: 'Blast Radius', category: 'Risk', definition: 'The set of all downstream files affected by a change to a specific file.' },
  { term: 'Circular Dependency', category: 'Architecture', definition: 'A closed loop where module A depends on B, which in turn depends on A.' },
  { term: 'DAG (Directed Acyclic Graph)', category: 'Graph Theory', definition: 'A graph with directed edges and no closed cycles, representing healthy modular code.' },
  { term: 'Dependency', category: 'Fundamentals', definition: 'A file or package required by another file to carry out its functions.' },
  { term: 'Direct Dependency', category: 'Coupling', definition: 'A module imported directly with a single hop (A → B).' },
  { term: 'Direct Importer', category: 'Coupling', definition: 'A file that explicitly requires/imports the file in question.' },
  { term: 'Entry Point', category: 'Architecture', definition: 'The root file where program execution starts (e.g. index.js, main.js).' },
  { term: 'Hop Count', category: 'Metrics', definition: 'The number of dependency edges traversed along a path between two nodes.' },
  { term: 'Impact Analysis', category: 'Risk', definition: 'The systematic evaluation of downstream consequences of altering or deleting code.' },
  { term: 'Isolated File', category: 'Code Hygiene', definition: 'A node with no incoming or outgoing dependency edges (often dead code).' },
  { term: 'Leaf Node', category: 'Architecture', definition: 'A file that imports no other files in the project (out-degree = 0, e.g. utils.js).' },
  { term: 'Neo4j', category: 'Infrastructure', definition: 'The graph database storing RippleCheck files as nodes and imports as relationships.' },
  { term: 'Root Node', category: 'Architecture', definition: 'A file not imported by any other project file (in-degree = 0, e.g. index.js).' },
  { term: 'Simulation', category: 'Safety', definition: 'A read-only analytical projection of changes without altering source files on disk.' },
  { term: 'Transitive Dependency', category: 'Coupling', definition: 'An indirect dependency reached across 2 or more hops (A → B → C).' },
  { term: 'Unresolved Import', category: 'Errors', definition: 'A MODULE_NOT_FOUND error occurring when an imported file does not exist on disk.' }
]

// Graph Controls Explanations
const CONTROLS_GUIDE = [
  {
    name: 'Layout Mode Selector',
    icon: <Layers size={14} color="#ffffff" />,
    description: 'Switches between 4 layouts: Hierarchical Dependencies (top-down DAG), Layered Tree (compact tree branches), Horizontal Architecture Flow (left-to-right DAG), and Radial Blast-Radius (concentric impact rings centered on selection).'
  },
  {
    name: 'Fit to Screen',
    icon: <Maximize2 size={14} color="#ffffff" />,
    description: 'Instantly re-centers and scales the graph canvas to fit all nodes smoothly within your visible viewport.'
  },
  {
    name: 'Legend Toggle',
    icon: <HelpCircle size={14} color="#ffffff" />,
    description: 'Shows or hides the visual indicator legend explaining what different border styles mean on the graph nodes.'
  },
  {
    name: 'Minimap Toggle',
    icon: <Radio size={14} color="#ffffff" />,
    description: 'Toggles the radar minimap in the bottom corner for quick navigation across large, dense dependency networks.'
  },
  {
    name: 'Export Menu (PNG, SVG, JSON)',
    icon: <Download size={14} color="#ffffff" />,
    description: 'Exports the full dependency graph as high-resolution 2x PNG, scalable vector SVG, or structured graph JSON containing nodes, edges, and file metadata.'
  },
  {
    name: 'Sync / Reload',
    icon: <RefreshCw size={14} color="#ffffff" />,
    description: 'Queries Neo4j to re-fetch the latest graph data, recalculating all node positions and import edges.'
  },
  {
    name: 'Pan & Zoom Controls',
    icon: <Search size={14} color="#ffffff" />,
    description: 'Use mouse scroll or the bottom-right +/- buttons to zoom. Click and drag on empty canvas to pan around.'
  }
]

export function HelpGuide({ onClose }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [activeSection, setActiveSection] = useState('concepts')
  const [selectedConcept, setSelectedConcept] = useState(CONCEPTS[0])

  const filteredConcepts = useMemo(() => {
    if (!searchTerm.trim()) return CONCEPTS
    const q = searchTerm.toLowerCase()
    return CONCEPTS.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.definition.toLowerCase().includes(q) ||
        c.example.toLowerCase().includes(q) ||
        c.tag.toLowerCase().includes(q)
    )
  }, [searchTerm])

  const filteredGlossary = useMemo(() => {
    if (!searchTerm.trim()) return GLOSSARY
    const q = searchTerm.toLowerCase()
    return GLOSSARY.filter(
      (g) =>
        g.term.toLowerCase().includes(q) ||
        g.definition.toLowerCase().includes(q) ||
        g.category.toLowerCase().includes(q)
    )
  }, [searchTerm])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: '#000000',
        color: '#ffffff',
        overflow: 'hidden'
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          padding: '12px 20px',
          background: '#000000',
          borderBottom: '1px solid rgba(255,255,255,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: '#000000',
              border: '1px solid #ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <BookOpen size={16} color="#ffffff" />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.3px', color: '#ffffff' }}>
              RippleCheck Help &amp; Learning Guide
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
              Interactive architectural documentation and dependency graph primer
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={13} style={{ position: 'absolute', left: '10px', top: '8px', color: 'rgba(255,255,255,0.4)' }} />
          <input
            type="text"
            placeholder="Search concepts, controls &amp; glossary..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              background: '#000000',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: '4px',
              padding: '6px 10px 6px 30px',
              color: '#ffffff',
              fontSize: '11px',
              outline: 'none'
            }}
          />
        </div>

        {/* Section Navigation Tabs & Close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {[
            { id: 'concepts', label: '12 Core Concepts' },
            { id: 'walkthrough', label: 'How to Use' },
            { id: 'controls', label: 'Controls Guide' },
            { id: 'glossary', label: `Glossary (${filteredGlossary.length})` }
          ].map((sec) => (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              style={{
                background: activeSection === sec.id ? '#ffffff' : 'transparent',
                border: '1px solid ' + (activeSection === sec.id ? '#ffffff' : 'rgba(255,255,255,0.25)'),
                borderRadius: '4px',
                color: activeSection === sec.id ? '#000000' : 'rgba(255,255,255,0.6)',
                padding: '5px 10px',
                fontSize: '11px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              {sec.label}
            </button>
          ))}

          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: '#ffffff',
                border: '1px solid #ffffff',
                color: '#000000',
                borderRadius: '4px',
                padding: '5px 12px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                marginLeft: '8px'
              }}
            >
              Back to Workspace
            </button>
          )}
        </div>
      </div>

      {/* Educational Banner */}
      <div
        style={{
          background: '#000000',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          padding: '6px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '11px',
          color: 'rgba(255,255,255,0.5)'
        }}
      >
        <Sparkles size={13} color="#ffffff" />
        <span>
          <strong style={{ color: '#ffffff' }}>Educational Reference:</strong> All examples are derived from the real sample repository structure:
          <code style={{ background: '#000000', border: '1px solid rgba(255,255,255,0.2)', padding: '1px 5px', borderRadius: '3px', marginLeft: '6px', color: '#ffffff' }}>
            index.js → app.js → [auth.js → utils.js, userService.js → database.js]
          </code>
        </span>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* SECTION 1: 12 CORE CONCEPTS */}
        {activeSection === 'concepts' && (
          <div style={{ display: 'flex', width: '100%', height: '100%' }}>
            {/* Left Concept Selector */}
            <div
              style={{
                width: '320px',
                borderRight: '1px solid rgba(255,255,255,0.12)',
                background: '#000000',
                overflowY: 'auto',
                padding: '12px'
              }}
            >
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', paddingLeft: '4px' }}>
                Concepts ({filteredConcepts.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {filteredConcepts.map((c) => {
                  const isSelected = selectedConcept?.id === c.id
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedConcept(c)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '4px',
                        background: isSelected ? '#ffffff' : 'transparent',
                        border: isSelected ? '1px solid #ffffff' : '1px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.1s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ fontSize: '9px', fontWeight: 700, color: isSelected ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.4)' }}>
                          #{c.id} {c.tag}
                        </span>
                        {isSelected && <ChevronRight size={12} color="#000000" />}
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: isSelected ? '#000000' : 'rgba(255,255,255,0.7)' }}>
                        {c.title}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Right Detailed Concept Viewer */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
              {selectedConcept ? (
                <div style={{ maxWidth: '780px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '3px',
                        background: '#ffffff',
                        border: '1px solid #ffffff',
                        color: '#000000'
                      }}
                    >
                      CONCEPT #{selectedConcept.id} • {selectedConcept.tag}
                    </span>
                  </div>

                  <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', margin: '4px 0 16px 0' }}>
                    {selectedConcept.title}
                  </h2>

                  {/* 1. Simple Definition */}
                  <div
                    style={{
                      background: '#000000',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '6px',
                      padding: '16px',
                      marginBottom: '16px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, color: '#ffffff', textTransform: 'uppercase', marginBottom: '6px' }}>
                      <Info size={14} />
                      Simple Definition
                    </div>
                    <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#ffffff' }}>
                      {selectedConcept.definition}
                    </div>
                  </div>

                  {/* 2. Practical Example using Sample Repository */}
                  <div
                    style={{
                      background: '#000000',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '6px',
                      padding: '16px',
                      marginBottom: '16px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, color: '#ffffff', textTransform: 'uppercase', marginBottom: '6px' }}>
                      <GitBranch size={14} />
                      Sample Repository Example
                    </div>
                    <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#ffffff', whiteSpace: 'pre-line' }}>
                      {selectedConcept.example}
                    </div>
                  </div>

                  {/* 3. Why a Developer Should Care */}
                  <div
                    style={{
                      background: '#000000',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '6px',
                      padding: '16px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, color: '#ffffff', textTransform: 'uppercase', marginBottom: '6px' }}>
                      <ShieldAlert size={14} />
                      Why You Should Care
                    </div>
                    <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#ffffff' }}>
                      {selectedConcept.whyCare}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ color: 'rgba(255,255,255,0.4)' }}>Select a concept from the left sidebar.</div>
              )}
            </div>
          </div>
        )}

        {/* SECTION 2: HOW TO USE RIPPLECHECK WALKTHROUGH */}
        {activeSection === 'walkthrough' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
            <div style={{ maxWidth: '820px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', marginBottom: '6px' }}>
                How to Use RippleCheck
              </h2>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '20px' }}>
                Follow this quick 5-step workflow to analyze code changes and simulate refactorings safely.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {[
                  {
                    step: 'Step 1',
                    title: 'Select a Target File',
                    desc: 'Click on any file node in the interactive graph canvas or choose a file from the Left Sidebar Project Explorer. The selected file is highlighted with an inverted (white filled) node.'
                  },
                  {
                    step: 'Step 2',
                    title: 'Choose Analysis Mode: Modify vs Delete',
                    desc: 'In the Right Sidebar (File Inspector), use the mode selector. Choose "Modify Impact" to see downstream files affected by code edits, or "Delete Simulation" to simulate removing the file entirely.'
                  },
                  {
                    step: 'Step 3',
                    title: 'Inspect Direct and Indirect Blast Radius',
                    desc: 'Review the blast radius breakdown. Direct impact (1 hop) files are immediate importers that directly depend on the target. Indirect impact (2+ hops) files suffer cascading transitive effects.'
                  },
                  {
                    step: 'Step 4',
                    title: 'Expand Paths & Highlight Graph Connections',
                    desc: 'Click on any affected file card in the inspector to expand its full ordered path (e.g. index.js → app.js → auth.js → utils.js). Clicking highlights the entire path in the graph canvas.'
                  },
                  {
                    step: 'Step 5',
                    title: 'Ask Natural-Language Questions',
                    desc: 'Use the bottom query bar to ask questions like "What does utils.js do?" or "Which files transitively depend on database.js?". RippleCheck retrieves AI summaries and executes read-only Cypher queries in Neo4j.'
                  }
                ].map((st, i) => (
                  <div
                    key={i}
                    style={{
                      background: '#000000',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '6px',
                      padding: '16px',
                      display: 'flex',
                      gap: '14px'
                    }}
                  >
                    <div
                      style={{
                        width: '56px',
                        height: '32px',
                        borderRadius: '4px',
                        background: '#ffffff',
                        border: '1px solid #ffffff',
                        color: '#000000',
                        fontSize: '11px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      {st.step}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>
                        {st.title}
                      </div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
                        {st.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: GRAPH CONTROLS GUIDE */}
        {activeSection === 'controls' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
            <div style={{ maxWidth: '820px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', marginBottom: '6px' }}>
                Graph Controls &amp; Tooltips Guide
              </h2>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '20px' }}>
                Overview of all buttons, toggles, and interactions on the React Flow canvas.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {CONTROLS_GUIDE.map((ctrl, i) => (
                  <div
                    key={i}
                    style={{
                      background: '#000000',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '6px',
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '4px',
                          background: '#000000',
                          border: '1px solid rgba(255,255,255,0.25)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {ctrl.icon}
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff' }}>{ctrl.name}</div>
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
                      {ctrl.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 4: SEARCHABLE GLOSSARY */}
        {activeSection === 'glossary' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
            <div style={{ maxWidth: '820px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                    Searchable Architecture Glossary
                  </h2>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
                    Quick reference for dependency graph terminology
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
                  Showing {filteredGlossary.length} term{filteredGlossary.length === 1 ? '' : 's'}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filteredGlossary.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      background: '#000000',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '4px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: '12px'
                    }}
                  >
                    <div style={{ minWidth: '160px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff' }}>{item.term}</span>
                      <span
                        style={{
                          fontSize: '9px',
                          color: '#000000',
                          background: '#ffffff',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          marginLeft: '6px',
                          fontWeight: 700
                        }}
                      >
                        {item.category}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.4, flex: 1 }}>
                      {item.definition}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
