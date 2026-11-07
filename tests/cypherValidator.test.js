// -----------------------------------------------------------------------------
// tests/cypherValidator.test.js — Test suite for Cypher Query Safety Validator
//
// Tests the exported validateCypher(query) function using Node.js built-in
// test runner (node:test) and assertion library (node:assert/strict).
//
// Run with:  node --test tests/cypherValidator.test.js
// -----------------------------------------------------------------------------

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateCypher } = require("../services/cypherValidator");

// Counters for final test summary
let passedCount = 0;
let failedCount = 0;

function trackPass() {
    passedCount++;
}

function trackFail() {
    failedCount++;
}

test.describe("Cypher Query Safety Validator (validateCypher)", () => {

    // =========================================================================
    // BASELINE SAFE QUERIES
    // =========================================================================
    test.describe("Safe Queries (Baseline)", () => {

        test("Safe Query 1: Basic node match and property return", () => {
            const query = [
                "MATCH (f:File)",
                "RETURN f.name"
            ].join("\n");

            try {
                const result = validateCypher(query);
                assert.equal(result, true, "Expected validateCypher to return true for safe query 1");
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Safe Query 2: Direct dependency traversal between two File nodes", () => {
            const query = [
                "MATCH (a:File)-[:IMPORTS]->(b:File)",
                "RETURN a.name, b.name"
            ].join("\n");

            try {
                const result = validateCypher(query);
                assert.equal(result, true, "Expected validateCypher to return true for safe query 2");
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Safe Query 3: Variable-length traversal, property map, ORDER BY, and LIMIT", () => {
            const query = [
                'MATCH (affected:File)-[:IMPORTS*1..]->(target:File {name: "database.js"})',
                "RETURN DISTINCT affected.path AS path, affected.name AS name",
                "ORDER BY path",
                "LIMIT 50"
            ].join("\n");

            try {
                const result = validateCypher(query);
                assert.equal(result, true, "Expected validateCypher to return true for safe query 3");
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Safe Query 4: WHERE clause with string literal containing forbidden word substring ('delete-user.js')", () => {
            const query = [
                "MATCH (f:File)",
                "WHERE f.name CONTAINS 'delete-user.js'",
                "RETURN f.name"
            ].join("\n");

            try {
                const result = validateCypher(query);
                assert.equal(result, true, "Expected validateCypher to return true for safe query 4");
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Safe Query 5: Permitted read-only aggregation function (count)", () => {
            const query = [
                "MATCH (f:File)",
                "RETURN count(f) AS total"
            ].join("\n");

            try {
                const result = validateCypher(query);
                assert.equal(result, true, "Expected validateCypher to return true for safe query 5");
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Safe Query 6: Multi-clause query with intermediate WITH projection", () => {
            const query = [
                "MATCH (a:File)-[:IMPORTS]->(b:File)",
                "WITH a, b",
                "MATCH (b:File)",
                "RETURN a.name, b.name"
            ].join("\n");

            try {
                const result = validateCypher(query);
                assert.equal(result, true, "Expected validateCypher to return true for safe query 6");
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });
    });

    // =========================================================================
    // BASELINE INVALID QUERIES
    // =========================================================================
    test.describe("Unsafe or Invalid Queries (Baseline)", () => {

        test("Invalid 1: Rejects empty string", () => {
            try {
                assert.throws(
                    () => validateCypher(""),
                    Error,
                    "Expected validateCypher to throw for an empty string"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Invalid 2: Rejects CREATE mutation clause", () => {
            const query = "CREATE (f:File) RETURN f";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to throw for CREATE mutation clause"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Invalid 3: Rejects disallowed node label (:Other)", () => {
            const query = "MATCH (f:Other) RETURN f";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to throw for non-File node label"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Invalid 4: Rejects untyped node pattern without label", () => {
            const query = "MATCH (f) RETURN f";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to throw for untyped node pattern"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Invalid 5: Rejects disallowed relationship type ([:CALLS])", () => {
            const query = "MATCH (a:File)-[:CALLS]->(b:File) RETURN a";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to throw for non-IMPORTS relationship type"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Invalid 6: Rejects relationship type alternation ([:IMPORTS|CALLS])", () => {
            const query = "MATCH (a:File)-[:IMPORTS|CALLS]->(b:File) RETURN a";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to throw for relationship alternation"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Invalid 7: Rejects mutating DELETE clause", () => {
            const query = "MATCH (f:File) DELETE f RETURN f";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to throw for DELETE clause"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Invalid 8: Rejects procedural CALL and YIELD execution", () => {
            const query = "MATCH (f:File) CALL db.labels() YIELD label RETURN label";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to throw for CALL / YIELD execution"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Invalid 9: Rejects multiple queries chained with semicolon", () => {
            const query = "MATCH (f:File) RETURN f; MATCH (x:File) RETURN x";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to throw for semicolon query chaining"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Invalid 10: Rejects disallowed property access (f.password)", () => {
            const query = "MATCH (f:File) RETURN f.password";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to throw for unknown property access"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Invalid 11: Rejects unbalanced parenthesis in node pattern", () => {
            const query = "MATCH (f:File RETURN f";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to throw for unbalanced parenthesis"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Invalid 12: Rejects unsupported clause (UNWIND)", () => {
            const query = "MATCH (f:File) UNWIND [1,2] AS x RETURN x";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to throw for unsupported UNWIND clause"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Invalid 13: Rejects unknown / unsupported function call (unknownFunction)", () => {
            const query = "MATCH (f:File) RETURN unknownFunction(f)";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to throw for unknown function call"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Invalid 14: Rejects comments (//)", () => {
            const query = "MATCH (f:File) RETURN f.name // comment";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to throw for comments"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });
    });

    // =========================================================================
    // EDGE CASES: 1. UNSUPPORTED CLAUSES
    // =========================================================================
    test.describe("Edge Cases: Unsupported Clauses", () => {

        test("Edge 1.1: Rejects UNWIND clause at start of query", () => {
            const query = "UNWIND [1, 2] AS item MATCH (f:File) RETURN f.name";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to reject UNWIND clause"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 1.2: Rejects LOAD CSV clause", () => {
            const query = "LOAD CSV FROM 'file:///data.csv' AS row MATCH (f:File) RETURN f.name";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to reject LOAD CSV"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 1.3: Rejects UNION operator between queries", () => {
            const query = "MATCH (a:File) RETURN a.name UNION MATCH (b:File) RETURN b.name";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to reject UNION"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 1.4: Rejects FOREACH clause", () => {
            const query = "MATCH (f:File) FOREACH (x IN [1] | SET f.name = 'test') RETURN f.name";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to reject FOREACH"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });
    });

    // =========================================================================
    // EDGE CASES: 2. SCHEMA VIOLATIONS
    // =========================================================================
    test.describe("Edge Cases: Schema Violations", () => {

        test("Edge 2.1: Rejects multiple node labels (:File:Module)", () => {
            const query = "MATCH (f:File:Module) RETURN f.name";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to reject multiple node labels"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 2.2: Rejects unknown property in node pattern map ({size: 1024})", () => {
            const query = "MATCH (f:File {size: 1024}) RETURN f.name";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to reject unknown property in pattern map"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 2.3: Rejects unknown relationship type ([:DEPENDS_ON])", () => {
            const query = "MATCH (a:File)-[:DEPENDS_ON]->(b:File) RETURN a.name";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to reject unknown relationship type"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 2.4: Rejects untyped relationship connector (-->)", () => {
            const query = "MATCH (a:File)-->(b:File) RETURN a.name";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to reject untyped relationship"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 2.5: Rejects unknown property access after WITH clause (b.secret)", () => {
            const query = [
                "MATCH (a:File)-[:IMPORTS]->(b:File)",
                "WITH a, b",
                "MATCH (b:File)",
                "RETURN b.secret"
            ].join("\n");

            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to reject unknown property after WITH"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });
    });

    // =========================================================================
    // EDGE CASES: 3. STRING HANDLING
    // =========================================================================
    test.describe("Edge Cases: String Handling", () => {

        test("Edge 3.1: Accepts forbidden-looking words inside valid single-quoted string literal", () => {
            const query = "MATCH (f:File) WHERE f.path = 'CREATE-DELETE-DROP.js' RETURN f.name";
            try {
                const result = validateCypher(query);
                assert.equal(result, true, "Expected forbidden keywords inside string literal to be accepted");
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 3.2: Accepts query fragments inside valid double-quoted string literal", () => {
            const query = 'MATCH (f:File) WHERE f.name = "MATCH (a) DELETE a" RETURN f.name';
            try {
                const result = validateCypher(query);
                assert.equal(result, true, "Expected Cypher fragments inside string literal to be accepted");
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 3.3: Accepts escaped single-quotes inside string literal", () => {
            const query = "MATCH (f:File) WHERE f.summary CONTAINS 'user\\'s session' RETURN f.name";
            try {
                const result = validateCypher(query);
                assert.equal(result, true, "Expected escaped single quote in string literal to be accepted");
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 3.4: Accepts escaped double-quotes inside string literal", () => {
            const query = 'MATCH (f:File) WHERE f.summary CONTAINS "escaped \\"quotes\\"" RETURN f.name';
            try {
                const result = validateCypher(query);
                assert.equal(result, true, "Expected escaped double quote in string literal to be accepted");
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 3.5: Rejects unterminated single-quoted string", () => {
            const query = "MATCH (f:File) WHERE f.name = 'unterminated-string RETURN f.name";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to reject unterminated single-quoted string"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 3.6: Rejects unterminated double-quoted string", () => {
            const query = 'MATCH (f:File) WHERE f.name = "unterminated-string RETURN f.name';
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to reject unterminated double-quoted string"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });
    });

    // =========================================================================
    // EDGE CASES: 4. FUNCTION HANDLING
    // =========================================================================
    test.describe("Edge Cases: Function Handling", () => {

        test("Edge 4.1: Rejects unknown / custom function call in WHERE clause", () => {
            const query = "MATCH (f:File) WHERE customCheck(f.name) RETURN f.name";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to reject unknown customCheck function"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 4.2: Accepts permitted read-only function (toLower)", () => {
            const query = "MATCH (f:File) WHERE toLower(f.name) = 'app.js' RETURN f.path";
            try {
                const result = validateCypher(query);
                assert.equal(result, true, "Expected validateCypher to accept toLower()");
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 4.3: Accepts permitted string & length functions (trim, length)", () => {
            const query = "MATCH (f:File) RETURN trim(f.name) AS cleanName, length(f.path) AS pathLength";
            try {
                const result = validateCypher(query);
                assert.equal(result, true, "Expected validateCypher to accept trim() and length()");
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 4.4: Rejects function call named after forbidden keyword (create())", () => {
            const query = "MATCH (f:File) RETURN create(f.name)";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to reject function named create()"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 4.5: Rejects function call named after forbidden keyword (delete()) in WHERE", () => {
            const query = "MATCH (f:File) WHERE delete(f.path) RETURN f.name";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to reject function named delete()"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });
    });

    // =========================================================================
    // EDGE CASES: 5. STRUCTURAL VALIDATION
    // =========================================================================
    test.describe("Edge Cases: Structural Validation", () => {

        test("Edge 5.1: Rejects illegal operator character (@)", () => {
            const query = "MATCH (f:File) WHERE f.name @ 'app.js' RETURN f.name";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to reject '@' character"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 5.2: Rejects illegal operator character (#)", () => {
            const query = "MATCH (f:File) WHERE f.name # 'test' RETURN f.name";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to reject '#' character"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 5.3: Rejects mismatched delimiter (parenthesis closed by bracket)", () => {
            const query = "MATCH (f:File] RETURN f.name";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to reject mismatched delimiters '( ... ]'"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 5.4: Rejects mismatched delimiter in property map", () => {
            const query = "MATCH (f:File {path: 'app.js']) RETURN f.name";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to reject mismatched delimiters '{ ... ]'"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 5.5: Rejects multiple statements separated by semicolon", () => {
            const query = "MATCH (f:File) RETURN f.name; DROP INDEX file_name";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to reject multiple statements"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 5.6: Accepts complex nested WHERE boolean expressions", () => {
            const query = [
                "MATCH (f:File)",
                "WHERE (f.name = 'app.js' AND (f.path = 'app.js' OR f.summary IS NOT NULL))",
                "RETURN f.name"
            ].join("\n");

            try {
                const result = validateCypher(query);
                assert.equal(result, true, "Expected nested boolean expressions in WHERE to pass");
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 5.7: Accepts valid variable-length range with upper and lower bounds (*1..5)", () => {
            const query = "MATCH (a:File)-[:IMPORTS*1..5]->(b:File) RETURN a.name, b.name";
            try {
                const result = validateCypher(query);
                assert.equal(result, true, "Expected variable-length range *1..5 to pass");
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });
    });

    // =========================================================================
    // EDGE CASES: 6. CLAUSE HANDLING & SEQUENCING
    // =========================================================================
    test.describe("Edge Cases: Clause Handling & Sequencing", () => {

        test("Edge 6.1: Rejects unlabelled node pattern (a) even after WITH projection", () => {
            const query = [
                "MATCH (a:File)-[:IMPORTS]->(b:File)",
                "WITH a",
                "MATCH (c:File)-[:IMPORTS]->(a)",
                "RETURN a.name, c.name"
            ].join("\n");

            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to reject unlabelled node pattern (a) in subsequent MATCH"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 6.2: Rejects invalid clause order: ORDER BY before RETURN", () => {
            const query = "MATCH (f:File) ORDER BY f.name RETURN f.name";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to reject ORDER BY before RETURN"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 6.3: Rejects invalid clause order: MATCH after RETURN", () => {
            const query = "MATCH (f:File) RETURN f.name MATCH (b:File) RETURN b.name";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to reject MATCH after RETURN"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });

        test("Edge 6.4: Rejects subquery construct (CALL { ... })", () => {
            const query = "MATCH (f:File) CALL { WITH f RETURN f } RETURN f.name";
            try {
                assert.throws(
                    () => validateCypher(query),
                    Error,
                    "Expected validateCypher to reject subquery construct"
                );
                trackPass();
            } catch (err) {
                trackFail();
                throw err;
            }
        });
    });

    test.after(() => {
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("  📊 Cypher Validator Test Suite Summary");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`  Total test cases executed : ${passedCount + failedCount}`);
        console.log(`  Passed                    : ${passedCount}`);
        console.log(`  Failed                    : ${failedCount}`);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    });
});
