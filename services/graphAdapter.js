// -----------------------------------------------------------------------------
// graphAdapter.js — Unified Polymorphic Storage Adapter for RippleCheck
//
// Responsibilities:
// 1. Directs database queries to Neo4j Aura (Web Edition) OR LadybugDB (Desktop Edition).
// 2. Selection criteria: strictly depends on process.env.RIPPLECHECK_EDITION === 'desktop'.
// 3. Web Edition ALWAYS uses cypherExecutor (Neo4j Aura) — zero desktop code execution.
// 4. Desktop Edition uses embedded LadybugDB — zero cloud Aura network calls.
// -----------------------------------------------------------------------------

"use strict";

const isDesktop = process.env.RIPPLECHECK_EDITION === "desktop";

if (isDesktop) {
    const ladybug = require("./ladybugExecutor");
    module.exports = {
        executeCypher: ladybug.executeCypher,
        initSchema: ladybug.initLadybugSchema,
        closeDatabase: ladybug.closeLadybugDatabase,
        isDesktop: true,
        engine: "ladybugdb"
    };
} else {
    const neo4j = require("./cypherExecutor");
    module.exports = {
        executeCypher: neo4j.executeCypher,
        verifyConnectivity: neo4j.verifyNeo4jConnection,
        initSchema: async () => {}, // Handled by initProjectSchema in Neo4j
        closeDatabase: () => {},
        isDesktop: false,
        engine: "neo4j"
    };
}

